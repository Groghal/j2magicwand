/**
 * J2Diagnostics manages error and warning diagnostics for J2 template files.
 * It checks for invalid placeholders, missing variables, and YAML issues,
 * and displays squiggly underlines and error messages in the editor.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { logger, isJ2Template, getDocumentText } from './utils';

export class J2Diagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;

    /**
     * Initializes the diagnostics collection for the extension.
     */
    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('j2magicwand');
    }

    /**
     * Updates diagnostics for a given document.
     * Checks for invalid placeholders and missing variables.
     * @param document The J2 template document to validate.
     */
    public updateDiagnostics(document: vscode.TextDocument): void {
        if (!isJ2Template(document)) {
            return;
        }

        const config = vscode.workspace.getConfiguration('j2magicwand');
        const yamlPaths = config.get('yamlPaths', []) as string[];

        if (yamlPaths.length === 0) {
            this.diagnosticCollection.clear();
            return;
        }

        try {
            const placeholders = this.loadPlaceholders(yamlPaths);
            const validVariables = new Set(Object.keys(placeholders));
            const text = getDocumentText(document);
            const diagnostics: vscode.Diagnostic[] = [];

            // Find all placeholders
            const placeholderRegex = /{{([^}]+)}}/g;
            let match: RegExpExecArray | null;
            while ((match = placeholderRegex.exec(text)) !== null) {
                const variableRaw = match[1];
                const variable = variableRaw.trim();
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                const range = new vscode.Range(startPos, endPos);

                // Check for spaces inside the curly braces or in the variable
                if (variableRaw !== variable || variable.includes(' ')) {
                    diagnostics.push({
                        range,
                        message: 'Spaces are not allowed in placeholders. Use format: {{variable}} (no spaces inside curly braces)',
                        severity: vscode.DiagnosticSeverity.Error,
                        source: 'J2 Magic Wand'
                    });
                    continue;
                }

                // Check for empty variables
                if (!variable) {
                    diagnostics.push({
                        range,
                        message: 'Empty placeholder is not allowed. Use format: {{variable}}',
                        severity: vscode.DiagnosticSeverity.Error,
                        source: 'J2 Magic Wand'
                    });
                    continue;
                }

                // Check for invalid characters
                if (!/^[a-zA-Z0-9_]+$/.test(variable)) {
                    diagnostics.push({
                        range,
                        message: 'Invalid characters in placeholder. Only letters, numbers, and underscores are allowed.',
                        severity: vscode.DiagnosticSeverity.Error,
                        source: 'J2 Magic Wand'
                    });
                    continue;
                }

                // Check if variable exists in YAML files
                if (!validVariables.has(variable)) {
                    diagnostics.push({
                        range,
                        message: `Variable "${variable}" is not defined in any of the YAML files`,
                        severity: vscode.DiagnosticSeverity.Error,
                        source: 'J2 Magic Wand'
                    });
                }
            }

            // Set diagnostics for the document
            this.diagnosticCollection.set(document.uri, diagnostics);
        } catch (error) {
            logger.error('Error updating diagnostics:', error);
            vscode.window.showErrorMessage(`Error updating diagnostics: ${error}`);
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
                if (!fs.existsSync(yamlPath)) {
                    logger.error(`YAML file not found: ${yamlPath}`);
                    continue;
                }
                const yamlContent = fs.readFileSync(yamlPath, 'utf8');
                const filePlaceholders = yaml.load(yamlContent) as Record<string, unknown>;
                if (filePlaceholders && typeof filePlaceholders === 'object') {
                    Object.assign(placeholders, filePlaceholders);
                }
            } catch (error) {
                logger.error(`Error reading YAML file ${yamlPath}:`, error);
                vscode.window.showErrorMessage(`Error reading YAML file ${yamlPath}: ${error}`);
            }
        }

        return placeholders;
    }

    /**
     * Clears all diagnostics.
     */
    public clearDiagnostics(): void {
        this.diagnosticCollection.clear();
    }

    /**
     * Disposes the diagnostics collection.
     */
    public dispose(): void {
        this.diagnosticCollection.dispose();
    }
}
