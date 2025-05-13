/**
 * J2PlaceholderProvider provides CodeLens and completion items for J2 templates.
 * - CodeLens: Adds clickable actions above placeholders (e.g., jump to YAML definition).
 * - Completion: Suggests variable names and values from YAML as you type in placeholders.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { logger } from './utils';

export class J2PlaceholderProvider implements vscode.CodeLensProvider, vscode.CompletionItemProvider {
    private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

    /**
     * Sets up listeners for configuration changes to refresh CodeLens.
     */
    constructor() {
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('j2magicwand')) {
                this.onDidChangeCodeLensesEmitter.fire();
            }
        });
    }

    /**
     * Provides CodeLens actions for all placeholders in a J2 document.
     * @param document The J2 template document.
     * @returns Array of CodeLens objects.
     */
    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const placeholderRegex = /{{([^}]+)}}/g;
        let match;

        // Get the custom title from settings
        const config = vscode.workspace.getConfiguration('j2magicwand');
        const customTitle = config.get('codeLensTitle', 'To YAML!!!');

        // Group placeholders by line number
        const placeholdersByLine = new Map<number, Array<{variable: string, range: vscode.Range}>>();

        while ((match = placeholderRegex.exec(text)) !== null) {
            const variable = match[1].trim();
            if (!variable.includes(' ')) { // Only add CodeLens for valid placeholders
                const range = new vscode.Range(
                    document.positionAt(match.index),
                    document.positionAt(match.index + match[0].length)
                );
                const line = range.start.line;

                if (!placeholdersByLine.has(line)) {
                    placeholdersByLine.set(line, []);
                }
                placeholdersByLine.get(line)?.push({ variable, range });
            }
        }

        // Create CodeLenses based on the number of placeholders per line
        for (const [line, placeholders] of placeholdersByLine) {
            if (placeholders.length === 1) {
                // Single placeholder on line - show just icon + generic text (no variable name)
                const { variable, range } = placeholders[0];
                // Remove {variable} from the custom title
                let title = customTitle.replace('{variable}', '').replace(/\s+$/, '');
                // If the title is now empty, fallback to a default
                if (!title.trim()) {title = '$(rocket)';}
                codeLenses.push(new vscode.CodeLens(range, {
                    title: title,
                    command: 'j2magicwand.goToDefinition',
                    arguments: [variable]
                }));
            } else {
                // Multiple placeholders on line - show compact format
                const lineRange = new vscode.Range(
                    new vscode.Position(line, 0),
                    new vscode.Position(line, 0)
                );

                // Create a single CodeLens for the line with all variables
                const variables = placeholders.map(p => p.variable).join(', ');
                const title = `$(symbol-variable) ${variables}`;

                const codeLens = new vscode.CodeLens(lineRange, {
                    title: title,
                    command: 'j2magicwand.goToDefinition',
                    arguments: [placeholders[0].variable] // Default to first variable
                });

                // Add additional commands for other variables
                codeLens.command = {
                    title: title,
                    command: 'j2magicwand.showVariableQuickPick',
                    arguments: [placeholders.map(p => p.variable)]
                };

                codeLenses.push(codeLens);
            }
        }

        return codeLenses;
    }

    /**
     * Provides completion items (variable names and values) for placeholders.
     * @param document The J2 template document.
     * @param position The cursor position.
     * @returns Array of CompletionItem objects.
     */
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
        const config = vscode.workspace.getConfiguration('j2magicwand');
        const yamlPaths = config.get('yamlPaths', []) as string[];

        if (yamlPaths.length === 0) {
            return [];
        }

        try {
            // Load and merge placeholders from all YAML files
            const placeholders = this.loadPlaceholders(yamlPaths);
            const completionItems: vscode.CompletionItem[] = [];

            // Get the current word being typed
            const wordRange = document.getWordRangeAtPosition(position);
            const currentWord = wordRange ? document.getText(wordRange) : '';

            // Create completion items from YAML content
            for (const [key, value] of Object.entries(placeholders)) {
                // Add completion item for the variable name
                const nameItem = new vscode.CompletionItem(key, vscode.CompletionItemKind.Variable);
                nameItem.detail = `Value: ${value}`;
                nameItem.documentation = new vscode.MarkdownString(`**${key}**\n\nValue: \`${value}\``);
                nameItem.insertText = key;
                nameItem.sortText = `0${key}`; // Ensure variable names appear first
                completionItems.push(nameItem);

                // Add value as a completion item, but make it insert the key
                if (typeof value === 'string') {
                    const valueItem = new vscode.CompletionItem(value, vscode.CompletionItemKind.Value);
                    valueItem.detail = `Variable: ${key}`;
                    valueItem.documentation = new vscode.MarkdownString(`**Value of ${key}**\n\nVariable: \`${key}\``);
                    valueItem.insertText = key; // Insert the key instead of the value
                    valueItem.sortText = `1${value}`; // Values appear after variable names
                    completionItems.push(valueItem);
                }
            }

            // Filter items based on current word if one is being typed
            if (currentWord) {
                return completionItems.filter(item =>
                    item.label.toString().toLowerCase().includes(currentWord.toLowerCase())
                );
            }

            return completionItems;
        } catch (error) {
            logger.error('Error providing completion items:', error);
            return [];
        }
    }

    /**
     * Loads and merges all placeholder variables from the configured YAML files.
     * @param yamlPaths Array of YAML file paths.
     * @returns A merged object of all placeholder variables.
     */
    private loadPlaceholders(yamlPaths: string[]): Record<string, unknown> {
        const placeholders: Record<string, unknown> = {};

        // Load placeholders from each YAML file, with later files overriding earlier ones
        for (const yamlPath of yamlPaths) {
            try {
                const yamlContent = fs.readFileSync(yamlPath, 'utf8');
                const filePlaceholders = yaml.load(yamlContent) as Record<string, unknown>;
                Object.assign(placeholders, filePlaceholders);
            } catch (error) {
                logger.error(`Error reading YAML file ${yamlPath}:`, error);
            }
        }

        return placeholders;
    }

    /**
     * Disposes the CodeLens event emitter.
     */
    public resolveCodeLens(codeLens: vscode.CodeLens): vscode.CodeLens {
        return codeLens;
    }

    public dispose(): void {
        this.onDidChangeCodeLensesEmitter.dispose();
    }
}
