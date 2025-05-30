/**
 * Utility functions and logging for the J2 Magic Wand extension.
 */
import * as vscode from 'vscode';
import * as path from 'path';

let outputChannel: vscode.OutputChannel;

/**
 * Logging utility for consistent extension output.
 */
export const logger = {
    info: (message: string): void => {
        if (!outputChannel) {
            outputChannel = vscode.window.createOutputChannel('J2 Magic Wand');
        }
        outputChannel.appendLine(`[INFO] ${message}`);
    },
    error: (message: string, error?: unknown): void => {
        if (!outputChannel) {
            outputChannel = vscode.window.createOutputChannel('J2 Magic Wand');
        }
        outputChannel.appendLine(`[ERROR] ${message}`);
        if (error) {
            outputChannel.appendLine(error.toString());
        }
    },
    debug: (message: string): void => {
        if (!outputChannel) {
            outputChannel = vscode.window.createOutputChannel('J2 Magic Wand');
        }
        outputChannel.appendLine(`[DEBUG] ${message}`);
    }
};

/**
 * Parses a version string from a VSIX filename.
 * @param filename The VSIX filename.
 * @returns The version string, or undefined if not found.
 */
export function parseVsixVersion(filename: string): string | undefined {
    const match = filename.match(/^j2magicwand-(\d+\.\d+\.\d+)\.vsix$/);
    return match ? match[1] : undefined;
}

/**
 * Compares two semantic version strings.
 * @param a First version string.
 * @param b Second version string.
 * @returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) {
            return 1;
        }
        if (na < nb) {
            return -1;
        }
    }
    return 0;
}

/**
 * Escapes HTML special characters for safe rendering.
 * @param unsafe The string to escape.
 * @returns The escaped string.
 */
export function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Gets a configuration value for the extension.
 * @param key The configuration key.
 * @param defaultValue The default value if not set.
 * @returns The configuration value.
 */
export function getConfig<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration('j2magicwand').get(key, defaultValue);
}

/**
 * Checks if a document is a J2 template.
 * @param document The document to check.
 * @returns Promise that resolves to true if the file is a J2 template.
 */
export async function isJ2Template(document: vscode.TextDocument): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('j2magicwand');
    const filePatterns = config.get('filePatterns', ['**/*.j2']) as string[];

    // If no workspace folder is open, fall back to simple extension check
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return document.fileName.endsWith('.j2');
    }

    // Check if the file matches any of the configured patterns
    const _relativePath = path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, document.uri.fsPath);
    for (const pattern of filePatterns) {
        const globPattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], pattern);
        const files = await vscode.workspace.findFiles(globPattern);
        if (files.some(file => file.fsPath === document.uri.fsPath)) {
            return true;
        }
    }
    return false;
}

/**
 * Gets the exact text of a document (no normalization).
 * @param document The document.
 * @returns The raw text.
 */
export function getDocumentText(document: vscode.TextDocument): string {
    return document.getText(); // Do NOT normalize line endings for diagnostics!
}
