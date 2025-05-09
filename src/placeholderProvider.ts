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

        while ((match = placeholderRegex.exec(text)) !== null) {
            const variable = match[1].trim();
            if (!variable.includes(' ')) { // Only add CodeLens for valid placeholders
                const range = new vscode.Range(
                    document.positionAt(match.index),
                    document.positionAt(match.index + match[0].length)
                );

                // Replace {variable} in the title with the actual variable name
                const title = customTitle.replace('{variable}', variable);

                const codeLens = new vscode.CodeLens(range, {
                    title: title,
                    command: 'j2magicwand.goToDefinition',
                    arguments: [variable]
                });

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
