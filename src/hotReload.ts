import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger, withTimeout } from './utils';
import { safeParseJson } from './parsing';

export class HotReload {
    private disposables: vscode.Disposable[] = [];
    private extensionPath: string = '';
    private extension: vscode.Extension<{ activate(): Promise<void> }> | undefined;
    private stateFile: string = '';
    private isReloading: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        // Only enable hot reload in development mode
        if (context.extensionMode !== vscode.ExtensionMode.Development) {
            logger.info('Hot reload disabled in production mode');
            return;
        }

        this.extensionPath = context.extensionPath;
        this.extension = vscode.extensions.getExtension('j2magicwand.j2magicwand');
        this.stateFile = path.join(context.globalStorageUri.fsPath, 'hot-reload-state.json');
        this.startWatching();
        this.restoreWorkspaceState();
        logger.info('Hot reload enabled in development mode');
    }

    private async saveWorkspaceState(): Promise<void> {
        try {
            // Create directory if it doesn't exist
            await fs.promises.mkdir(path.dirname(this.stateFile), { recursive: true });

            const state = {
                activeEditor: vscode.window.activeTextEditor?.document.uri.fsPath,
                visibleEditors: vscode.window.visibleTextEditors.map(editor => ({
                    uri: editor.document.uri.fsPath,
                    viewColumn: editor.viewColumn
                }))
            };

            await fs.promises.writeFile(this.stateFile, JSON.stringify(state, null, 2));
            logger.info('Workspace state saved');
        } catch (error: unknown) {
            logger.error('Failed to save workspace state:', error);
        }
    }

    private async restoreWorkspaceState(): Promise<void> {
        try {
            if (!fs.existsSync(this.stateFile)) {
                return;
            }

            const data = await fs.promises.readFile(this.stateFile, 'utf8');
            const state = safeParseJson<{ activeEditor?: string; visibleEditors?: Array<{ uri: string; viewColumn: number }> }>(data, 'hot-reload-state.json');
            if (!state) {
                return;
            }

            // Restore visible editors
            for (const editor of state.visibleEditors || []) {
                try {
                    if (fs.existsSync(editor.uri)) {
                        const doc = await vscode.workspace.openTextDocument(editor.uri);
                        await vscode.window.showTextDocument(doc, editor.viewColumn);
                    }
                } catch (openError) {
                    logger.warn(`Failed to restore editor ${editor.uri}:`, openError);
                }
            }

            // Restore active editor
            if (state.activeEditor && fs.existsSync(state.activeEditor)) {
                try {
                    const doc = await vscode.workspace.openTextDocument(state.activeEditor);
                    await vscode.window.showTextDocument(doc);
                } catch (activeError) {
                    logger.warn(`Failed to restore active editor ${state.activeEditor}:`, activeError);
                }
            }

            logger.info('Workspace state restored');
        } catch (error: unknown) {
            logger.error('Failed to restore workspace state:', error);
        }
    }

    private startWatching(): void {
        try {
            // Watch for changes in the extension's source files
            const watcher = fs.watch(this.extensionPath, { recursive: true }, async (eventType, filename) => {
                if (!filename) {return;}

                // Only watch TypeScript files
                if (!filename.endsWith('.ts')) {return;}

                // Ignore changes in node_modules and out directories
                if (filename.includes('node_modules') || filename.includes('out')) {return;}

                logger.info(`File changed: ${filename}`);

                // Save workspace state before reloading
                await this.saveWorkspaceState();

                // Reload the extension
                await this.reloadExtension();
            });

            this.disposables.push({ dispose: () => watcher.close() });
        } catch (error: unknown) {
            logger.error('Failed to start file watcher:', error);
        }
    }

    private handleFileChange(uri: vscode.Uri): void {
        if (uri.fsPath.endsWith('.ts')) {
            this.reloadExtension();
        }
    }

    private handleFileDelete(uri: vscode.Uri): void {
        if (uri.fsPath.endsWith('.ts')) {
            this.reloadExtension();
        }
    }

    private handleFileCreate(uri: vscode.Uri): void {
        if (uri.fsPath.endsWith('.ts')) {
            this.reloadExtension();
        }
    }

    private async reloadExtension(): Promise<void> {
        if (this.isReloading) {
            return;
        }

        if (!this.extension) {
            return;
        }

        try {
            this.isReloading = true;
            await withTimeout(
                Promise.resolve(vscode.commands.executeCommand('workbench.action.reloadWindow')),
                5000, // 5 second timeout
                'Window reload timed out'
            );
        } catch (error: unknown) {
            logger.error('Failed to reload extension:', error);
        } finally {
            this.isReloading = false;
        }
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
