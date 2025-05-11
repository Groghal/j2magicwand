import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils';

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
        } catch (error) {
            logger.error('Failed to save workspace state:', error);
        }
    }

    private async restoreWorkspaceState(): Promise<void> {
        try {
            if (!fs.existsSync(this.stateFile)) {
                return;
            }

            const state = JSON.parse(await fs.promises.readFile(this.stateFile, 'utf8'));

            // Restore visible editors
            for (const editor of state.visibleEditors || []) {
                if (fs.existsSync(editor.uri)) {
                    const doc = await vscode.workspace.openTextDocument(editor.uri);
                    await vscode.window.showTextDocument(doc, editor.viewColumn);
                }
            }

            // Restore active editor
            if (state.activeEditor && fs.existsSync(state.activeEditor)) {
                const doc = await vscode.workspace.openTextDocument(state.activeEditor);
                await vscode.window.showTextDocument(doc);
            }

            logger.info('Workspace state restored');
        } catch (error) {
            logger.error('Failed to restore workspace state:', error);
        }
    }

    private startWatching(): void {
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
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        } catch (error) {
            logger.error('Failed to reload extension:', error);
        } finally {
            this.isReloading = false;
        }
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
