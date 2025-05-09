/**
 * J2RenderView manages the webview panel for rendering J2 templates.
 * It displays the rendered output with syntax highlighting, line numbers,
 * and validation status for JSON, YAML, XML, or C#.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { logger } from './utils';

export class J2RenderView {
    private panel: vscode.WebviewPanel | undefined;
    private currentLanguage = 'json';

    /**
     * Shows or reveals the render view for a given document.
     * @param document The J2 template document to render.
     */
    public showRenderView(document: vscode.TextDocument): void {
        if (this.panel) {
            this.panel.reveal();
            this.updateRenderView(document);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'j2magicwand.renderView',
            `Rendered Template (${this.currentLanguage.toUpperCase()})`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Initial render
        this.updateRenderView(document);

        // Update render view when template changes
        const templateChangeDisposable = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document === document) {
                this.updateRenderView(e.document);
            }
        });

        // Update render view when YAML files change
        const yamlChangeDisposable = vscode.workspace.onDidChangeTextDocument(e => {
            const config = vscode.workspace.getConfiguration('j2magicwand');
            const yamlPaths = config.get('yamlPaths', []) as string[];
            if (yamlPaths.includes(e.document.fileName)) {
                this.updateRenderView(document);
            }
        });

        // Update render view when YAML paths change
        const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('j2magicwand.yamlPaths')) {
                this.updateRenderView(document);
            }
        });

        this.panel.onDidDispose(() => {
            templateChangeDisposable.dispose();
            yamlChangeDisposable.dispose();
            configChangeDisposable.dispose();
            this.panel = undefined;
        });

        // Register command for changing render language
        vscode.commands.registerCommand('j2magicwand.changeRenderLanguage', async () => {
            const languages = [
                { label: 'JSON', value: 'json' },
                { label: 'YAML', value: 'yaml' },
                { label: 'C#', value: 'csharp' },
                { label: 'XML', value: 'xml' }
            ];

            const selected = await vscode.window.showQuickPick(languages, {
                placeHolder: 'Select language for syntax highlighting'
            });

            if (selected) {
                this.currentLanguage = selected.value;
                if (this.panel) {
                    this.panel.title = `Rendered Template (${this.currentLanguage.toUpperCase()})`;
                    this.updateRenderView(document);
                }
            }
        });
    }

    /**
     * Updates the webview content with the latest rendered output.
     * @param document The J2 template document.
     */
    private updateRenderView(document: vscode.TextDocument): void {
        if (!this.panel) {
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('j2magicwand');
            const yamlPaths = config.get('yamlPaths', []) as string[];

            if (yamlPaths.length === 0) {
                this.panel.webview.html = this.getWebviewContent(document, 'No YAML paths configured');
                return;
            }

            const placeholders = this.loadPlaceholders(yamlPaths);
            const text = document.getText();
            let renderedText = text;

            // Replace all placeholders with their values
            const placeholderRegex = /{{([^}]+)}}/g;
            let match;
            while ((match = placeholderRegex.exec(text)) !== null) {
                const variable = match[1];
                if (!variable.includes(' ')) {
                    const value = placeholders[variable];
                    if (value !== undefined) {
                        renderedText = renderedText.replace(match[0], String(value));
                    }
                }
            }

            this.panel.webview.html = this.getWebviewContent(document, renderedText);
        } catch (error: unknown) {
            this.panel.webview.html = this.getWebviewContent(document, `Error rendering template: ${error}`);
        }
    }

    /**
     * Loads and merges all placeholder variables from the configured YAML files.
     * @param yamlPaths Array of YAML file paths.
     * @returns A merged object of all placeholder variables.
     */
    private loadPlaceholders(yamlPaths: string[]): Record<string, unknown> {
        const placeholders: Record<string, unknown> = {};

        for (const yamlPath of yamlPaths) {
            try {
                const yamlContent = fs.readFileSync(yamlPath, 'utf8');
                const filePlaceholders = yaml.load(yamlContent) as Record<string, unknown>;
                Object.assign(placeholders, filePlaceholders);
            } catch (error: unknown) {
                logger.error(`Error reading YAML file ${yamlPath}:`, error);
            }
        }

        return placeholders;
    }

    /**
     * Generates the HTML content for the webview.
     * @param document The J2 template document.
     * @param content The rendered content to display.
     * @returns The HTML string.
     */
    private getWebviewContent(document: vscode.TextDocument, content: string = ''): string {
        // Validate syntax based on current language
        let isValid = true;
        let validationMessage = '';
        const errorLines = new Set<number>();

        try {
            switch (this.currentLanguage) {
                case 'json':
                    const cleanedContent = content.replace(/,(\s*[}\]])/g, '$1');
                    try {
                        JSON.parse(cleanedContent);
                        validationMessage = 'Valid JSON syntax';
                    } catch (jsonError: unknown) {
                        isValid = false;
                        const errorMessage = jsonError instanceof Error ? jsonError.message : String(jsonError);
                        if (errorMessage.includes('trailing comma')) {
                            validationMessage = 'Invalid JSON syntax: Trailing comma detected';
                            // Find the line with the trailing comma
                            const lines = cleanedContent.split('\n');
                            for (let i = 0; i < lines.length; i++) {
                                if (lines[i].match(/,\s*[}\]].*$/)) {
                                    errorLines.add(i);
                                }
                            }
                        } else {
                            validationMessage = `Invalid JSON syntax: ${errorMessage}`;
                            // Try to extract line number from error message
                            const lineMatch = errorMessage.match(/position (\d+)/);
                            if (lineMatch) {
                                const position = parseInt(lineMatch[1]);
                                const beforeError = cleanedContent.substring(0, position);
                                const lineNumber = beforeError.split('\n').length - 1;
                                errorLines.add(lineNumber);
                            }
                        }
                    }
                    break;
                case 'yaml':
                    try {
                        yaml.load(content);
                        validationMessage = 'Valid YAML syntax';
                    } catch (yamlError: unknown) {
                        isValid = false;
                        validationMessage = `Invalid YAML syntax: ${yamlError as string}`;
                        // Try to extract line number from YAML error
                        const msg = yamlError as string;
                        const lineMatch = msg.match(/line (\d+)/);
                        if (lineMatch) {
                            const lineNumber = parseInt(lineMatch[1]) - 1;
                            errorLines.add(lineNumber);
                        }
                    }
                    break;
                case 'xml':
                    try {
                        if (!content.trim().startsWith('<') || !content.includes('>')) {
                            throw new Error('Invalid XML syntax');
                        }
                        validationMessage = 'Valid XML syntax';
                    } catch (xmlError: unknown) {
                        isValid = false;
                        validationMessage = `Invalid XML syntax: ${xmlError as string}`;
                        // Mark the first line if it doesn't start with <
                        if (!content.trim().startsWith('<')) {
                            errorLines.add(0);
                        }
                    }
                    break;
                case 'csharp':
                    try {
                        if (content.includes('{') && !content.includes('}') ||
                            content.includes('}') && !content.includes('{') ||
                            content.includes('(') && !content.includes(')') ||
                            content.includes(')') && !content.includes('(')) {
                            throw new Error('Invalid C# syntax');
                        }
                        validationMessage = 'Valid C# syntax';
                    } catch (csError: unknown) {
                        isValid = false;
                        validationMessage = `Invalid C# syntax: ${csError as string}`;
                        // Mark lines with unmatched brackets
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            if ((lines[i].includes('{') && !lines[i].includes('}')) ||
                                (lines[i].includes('}') && !lines[i].includes('{')) ||
                                (lines[i].includes('(') && !lines[i].includes(')')) ||
                                (lines[i].includes(')') && !lines[i].includes('('))) {
                                errorLines.add(i);
                            }
                        }
                    }
                    break;
            }
        } catch (error: unknown) {
            isValid = false;
            validationMessage = `Invalid ${this.currentLanguage.toUpperCase()} syntax: ${error as string}`;
        }

        const lines = content.split('\n');
        const lineNumbersHtml = lines.map((_, idx) => {
            const hasError = errorLines.has(idx);
            return `<span class='line-number ${hasError ? 'error' : ''}'>${idx + 1}</span>`;
        }).join('\n');
        const codeLinesHtml = lines.map((line, idx) => {
            const hasError = errorLines.has(idx);
            return `<span class='code-line ${hasError ? 'error' : ''}'>${this.escapeHtml(line) || '&nbsp;'}</span>`;
        }).join('\n');

        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .syntax-status {
                    margin-bottom: 6px;
                    padding: 6px 8px;
                    border-radius: 4px;
                    font-size: 0.95em;
                }
                .syntax-valid {
                    background-color: var(--vscode-testing-iconPassed);
                    color: var(--vscode-editor-background);
                }
                .syntax-invalid {
                    background-color: var(--vscode-editorError-background, #ff2d2d);
                    color: #fff !important;
                    border: 1.5px solid var(--vscode-editorError-foreground, #fff);
                    font-weight: bold;
                }
                .code-table {
                    display: flex;
                    flex-direction: row;
                    max-width: 100%;
                    overflow-x: auto;
                    background: var(--vscode-editor-background);
                    border-radius: 4px;
                }
                .line-numbers-col {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    background: var(--vscode-editorLineNumber-background, #23272e);
                    border-right: 1px solid var(--vscode-editorLineNumber-activeForeground);
                    user-select: none;
                }
                .line-number {
                    display: block;
                    width: 2.5em;
                    text-align: right;
                    color: var(--vscode-editorLineNumber-foreground);
                    font-variant-numeric: tabular-nums;
                    height: 1.5em;
                    line-height: 1.5em;
                    font-size: var(--vscode-editor-font-size);
                    font-family: var(--vscode-editor-font-family);
                    vertical-align: top;
                    margin: 0;
                    padding: 0;
                }
                .line-number.error {
                    color: var(--vscode-editorError-foreground);
                }
                .code-lines-col {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                }
                .code-line {
                    display: block;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    white-space: pre;
                    height: 1.5em;
                    line-height: 1.5em;
                    vertical-align: top;
                    margin: 0;
                    padding: 0;
                    position: relative;
                }
                .code-line.error {
                    text-decoration: wavy underline var(--vscode-editorError-foreground);
                    text-decoration-skip-ink: none;
                }
                .error-marker {
                    position: absolute;
                    left: -1em;
                    color: var(--vscode-editorError-foreground);
                    font-weight: bold;
                }
            </style>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/vs2015.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/languages/json.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/languages/yaml.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/languages/csharp.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/languages/xml.min.js"></script>
        </head>
        <body>
            <div class="syntax-status ${isValid ? 'syntax-valid' : 'syntax-invalid'}">
                ${validationMessage}
            </div>
            <div class="code-table">
                <div class="line-numbers-col">
                    ${lineNumbersHtml}
                </div>
                <div class="code-lines-col">
                    ${codeLinesHtml}
                </div>
            </div>
            <script>
                document.addEventListener('DOMContentLoaded', (event) => {
                    document.querySelectorAll('.code-line').forEach((block) => {
                        hljs.highlightBlock(block);
                    });
                });
            </script>
        </body>
        </html>`;
    }

    /**
     * Escapes HTML special characters for safe rendering.
     * @param text The string to escape.
     * @returns The escaped string.
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    /**
     * Disposes the webview panel.
     */
    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}
