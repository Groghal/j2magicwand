/**
 * J2RenderView manages the webview panel for rendering J2 templates.
 * It displays the rendered output with syntax highlighting, line numbers,
 * and validation status for JSON, YAML, XML, or C#.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { logger } from './utils';

export class J2RenderView {
    private panel: vscode.WebviewPanel | undefined;
    private currentLanguage = 'json';
    private context: vscode.ExtensionContext;
    public lastJ2DocumentUri: vscode.Uri | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

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

        // In the constructor or showRenderView, add this to handle messages from the webview
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'executeCommand') {
                if (message.commandId === 'j2magicwand.setYamlPath') {
                    await vscode.commands.executeCommand('j2magicwand.setYamlPath');
                } else if (message.commandId === 'j2magicwand.changeRenderLanguage') {
                    await vscode.commands.executeCommand('j2magicwand.changeRenderLanguage');
                } else {
                    vscode.window.showWarningMessage(`Unknown commandId sent from webview: ${message.commandId}`);
                }
            } else if (message.command === 'changeEnvironment') {
                // Get current service name
                let serviceName = '';
                if (this.context.globalState) {
                    serviceName = this.context.globalState.get('j2magicwand.lastService', '');
                }
                if (!serviceName) {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        const filePath = editor.document.uri.fsPath;
                        serviceName = path.basename(path.dirname(filePath));
                    }
                }
                // Load all saved configs
                const globalStoragePath = this.context.globalStorageUri.fsPath;
                const saveFile = path.join(globalStoragePath, 'j2magicwand-yaml-configs.json');
                let environments: string[] = [];
                let allConfigs: Array<{ serviceName: string; environment: string; yamlPaths: string[] }> = [];
                if (fs.existsSync(saveFile)) {
                    try {
                        allConfigs = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
                        environments = allConfigs
                            .filter((c: { serviceName: string; environment: string }) => c.serviceName === serviceName)
                            .map((c: { serviceName: string; environment: string }) => c.environment);
                    } catch {}
                }
                if (environments.length === 0) {
                    vscode.window.showWarningMessage('No saved environments found for this service.');
                    return;
                }
                const selected = await vscode.window.showQuickPick(environments, {
                    placeHolder: 'Select environment',
                    canPickMany: false
                });
                if (selected) {
                    await this.context.globalState.update('j2magicwand.lastEnvironment', selected);
                    // Load the YAML config for this service/environment
                    const configForEnv = allConfigs.find((c: { serviceName: string; environment: string; yamlPaths: string[] }) =>
                        c.serviceName === serviceName && c.environment === selected);
                    if (configForEnv) {
                        const config = vscode.workspace.getConfiguration('j2magicwand');
                        await config.update('yamlPaths', configForEnv.yamlPaths, true);
                        vscode.window.showInformationMessage('Loaded YAML paths: ' + configForEnv.yamlPaths.join(', '));
                        // Force diagnostics update for all open J2 documents
                        await vscode.commands.executeCommand('j2magicwand.forceDiagnostics');
                    } else {
                        vscode.window.showWarningMessage('No YAML config found for this service/environment.');
                    }
                    // Refresh the webview with the active J2 document or last used J2 document
                    if (this.panel) {
                        let doc: vscode.TextDocument | undefined;
                        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'j2') {
                            doc = vscode.window.activeTextEditor.document;
                        } else if (this.lastJ2DocumentUri) {
                            doc = await vscode.workspace.openTextDocument(this.lastJ2DocumentUri);
                        }
                        if (doc) {
                            this.updateRenderView(doc);
                        }
                    }
                }
            }
        });
    }

    /**
     * Updates the webview content with the latest rendered output.
     * @param document The J2 template document.
     */
    public updateRenderView(document: vscode.TextDocument): void {
        this.lastJ2DocumentUri = document.uri;
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

        // Get YAML files list and current service/environment
        const config = vscode.workspace.getConfiguration('j2magicwand');
        const yamlPaths = config.get('yamlPaths', []) as string[];
        // Get service name and environment from globalState if available
        let serviceName = '';
        let environment = '';
        if (this.context.globalState) {
            serviceName = this.context.globalState.get('j2magicwand.lastService', '');
            environment = this.context.globalState.get('j2magicwand.lastEnvironment', '');
        }
        // Fallbacks if not set
        if (!serviceName) {
            serviceName = 'unknown';
        }
        if (!environment) {
            environment = 'local';
        }
        // Check if there is a saved config for this service/environment
        const globalStoragePath = this.context.globalStorageUri.fsPath;
        const saveFile = path.join(globalStoragePath, 'j2magicwand-yaml-configs.json');
        let hasConfig = false;
        if (fs.existsSync(saveFile)) {
            try {
                const allConfigs = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
                hasConfig = allConfigs.some((c: { serviceName: string; environment: string }) =>
                    c.serviceName === serviceName && c.environment === environment);
            } catch {}
        }
        if (!hasConfig) {
            serviceName = 'unknown';
        }
        const serviceEnvHtml = `<div class="service-env-bar"><b>Service:</b> ${this.escapeHtml(serviceName)} &nbsp; <b>Environment:</b> ${this.escapeHtml(environment)}</div>`;
        const yamlFilesHtml = yamlPaths.map(path => `
            <div class="yaml-file">
                <span class="yaml-file-icon">-</span>
                <span>${this.escapeHtml(path)}</span>
            </div>
        `).join('') || '<div class="yaml-file">No YAML files configured</div>';

        // Load the HTML template
        const templatePath = this.context.asAbsolutePath('media/webviewTemplate.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        // Replace placeholders
        html = html.replace('{{syntaxClass}}', isValid ? 'syntax-valid' : 'syntax-invalid')
                   .replace('{{validationMessage}}', validationMessage)
                   .replace('{{lineNumbersHtml}}', lineNumbersHtml)
                   .replace('{{codeLinesHtml}}', codeLinesHtml)
                   .replace('{{yamlFilesHtml}}', serviceEnvHtml + yamlFilesHtml);

        return html;
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
