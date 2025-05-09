// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { logger, parseVsixVersion, compareVersions, getConfig, isJ2Template } from './utils';
import { J2Diagnostics } from './diagnostics';
import { J2PlaceholderProvider } from './placeholderProvider';
import { J2RenderView } from './renderView';

let diagnostics: J2Diagnostics;
let placeholderProvider: J2PlaceholderProvider;
let renderView: J2RenderView;
const statusBarItems: vscode.StatusBarItem[] = [];

/**
 * This method is called when your extension is activated.
 * It sets up all core features: diagnostics, CodeLens, completion, commands, and status bar items.
 * @param context The extension context provided by VS Code
 */
export function activate(context: vscode.ExtensionContext): void {
	logger.info('Extension activated');

	// Initialize diagnostics, placeholder provider, and render view
	diagnostics = new J2Diagnostics();
	placeholderProvider = new J2PlaceholderProvider();
	renderView = new J2RenderView();

	// Check for VSIX updates in the configured folder
	checkForVsixUpdate();

	// On activation, update diagnostics for all already-open J2 documents
	vscode.workspace.textDocuments.forEach(document => {
		if (isJ2Template(document)) {
			diagnostics.updateDiagnostics(document);
		}
	});

	// Register all extension commands
	context.subscriptions.push(
		// Command to set YAML file paths for placeholder definitions
		vscode.commands.registerCommand('j2magicwand.setYamlPath', async () => {
			logger.info('Setting YAML paths...');
			const config = vscode.workspace.getConfiguration('j2magicwand');
			const currentPaths = config.get('yamlPaths', []) as string[];

			// Create quick pick items for existing paths
			const quickPickItems: vscode.QuickPickItem[] = currentPaths.map((path, index) => ({
				label: `Path ${index + 1}: ${path}`,
				description: 'Click to edit',
				detail: path
			}));

			quickPickItems.push({
				label: 'Add new path',
				description: 'Add a new YAML file path'
			});

			if (currentPaths.length > 0) {
				quickPickItems.push({
					label: 'Remove path',
					description: 'Remove an existing YAML file path'
				});
			}

			const selected = await vscode.window.showQuickPick(quickPickItems, {
				placeHolder: 'Select a path to edit, add new path, or remove path'
			});

			if (!selected) {
				logger.info('Path selection cancelled');
				return;
			}

			if (selected.label === 'Remove path') {
				const removeItems = currentPaths.map((path, index) => ({
					label: `Path ${index + 1}: ${path}`,
					description: 'Click to remove',
					detail: path
				}));

				const pathToRemove = await vscode.window.showQuickPick(removeItems, {
					placeHolder: 'Select a path to remove'
				});

				if (pathToRemove) {
					const pathIndex = removeItems.indexOf(pathToRemove);
					const newPaths = [...currentPaths];
					newPaths.splice(pathIndex, 1);
					await config.update('yamlPaths', newPaths, true);
					vscode.window.showInformationMessage(`YAML path removed: ${pathToRemove.detail}`);
				}
				return;
			}

			let newPath: string | undefined;
			if (selected.label === 'Add new path') {
				if (currentPaths.length >= 5) {
					vscode.window.showErrorMessage('Maximum of 5 YAML paths allowed');
					return;
				}
				newPath = await vscode.window.showInputBox({
					prompt: 'Enter the path to your YAML file containing placeholder definitions',
					placeHolder: 'e.g., /path/to/placeholders.yaml'
				});
			} else {
				const pathIndex = quickPickItems.indexOf(selected);
				const currentPath = currentPaths[pathIndex];
				newPath = await vscode.window.showInputBox({
					value: currentPath,
					prompt: 'Enter the path to your YAML file containing placeholder definitions',
					placeHolder: 'e.g., /path/to/placeholders.yaml'
				});
			}

			if (newPath) {
				const newPaths = [...currentPaths];
				if (selected.label === 'Add new path') {
					newPaths.push(newPath);
				} else {
					const pathIndex = quickPickItems.indexOf(selected);
					newPaths[pathIndex] = newPath;
				}

				await config.update('yamlPaths', newPaths, true);
				vscode.window.showInformationMessage(`YAML paths updated: ${newPaths.join(', ')}`);
			}
		}),

		// Command to jump to the definition of a variable in YAML
		vscode.commands.registerCommand('j2magicwand.goToDefinition', async (variable: string) => {
			const config = vscode.workspace.getConfiguration('j2magicwand');
			const yamlPaths = config.get('yamlPaths', []) as string[];

			for (let i = yamlPaths.length - 1; i >= 0; i--) {
				const yamlPath = yamlPaths[i];
				try {
					const yamlContent = fs.readFileSync(yamlPath, 'utf8');
					const placeholders = yaml.load(yamlContent) as Record<string, unknown>;

					if (variable in placeholders) {
						const doc = await vscode.workspace.openTextDocument(yamlPath);
						const editor = await vscode.window.showTextDocument(doc);

						const text = doc.getText();
						const lines = text.split('\n');
						for (let i = 0; i < lines.length; i++) {
							if (lines[i].includes(`${variable}:`)) {
								const position = new vscode.Position(i, 0);
								editor.selection = new vscode.Selection(position, position);
								editor.revealRange(
									new vscode.Range(position, position),
									vscode.TextEditorRevealType.InCenter
								);
								break;
							}
						}
						return;
					}
				} catch (error) {
					logger.error(`Error reading YAML file ${yamlPath}:`, error);
				}
			}

			vscode.window.showErrorMessage(`Variable "${variable}" not found in any YAML files`);
		}),

		// Command to set the CodeLens title for placeholders
		vscode.commands.registerCommand('j2magicwand.setCodeLensTitle', async () => {
			logger.info('Setting CodeLens title...');
			const config = vscode.workspace.getConfiguration('j2magicwand');
			const currentTitle = config.get('codeLensTitle', 'To YAML!!!');

			const quickPickItems: vscode.QuickPickItem[] = [
				{ label: 'To YAML!!!', description: 'Default title' },
				{ label: 'Go to {variable}', description: 'Include variable name' },
				{ label: 'Edit {variable}', description: 'Simple edit action' },
				{ label: '✨ Edit {variable} ✨', description: 'Sparkle edit' },
				{ label: '🎯 Jump to {variable}', description: 'Target jump' },
				{ label: '🔍 Find {variable}', description: 'Search action' },
				{ label: '⚡ Quick edit {variable}', description: 'Lightning fast' },
				{ label: '🚀 Launch {variable}', description: 'Rocket launch' },
				{ label: '💫 Magic {variable}', description: 'Magical touch' },
				{ label: '🎨 Style {variable}', description: 'Artistic touch' },
				{ label: '⚙️ Configure {variable}', description: 'Technical setup' },
				{ label: '📝 Edit {variable}', description: 'Note taking' },
				{ label: '🔧 Fix {variable}', description: 'Maintenance' },
				{ label: '🎮 Play with {variable}', description: 'Fun interaction' },
				{ label: 'Custom...', description: 'Enter your own title' }
			];

			const selected = await vscode.window.showQuickPick(quickPickItems, {
				placeHolder: 'Select a title or enter custom one'
			});

			if (!selected) {
				logger.info('Title selection cancelled');
				return;
			}

			let newTitle: string | undefined;
			if (selected.label === 'Custom...') {
				newTitle = await vscode.window.showInputBox({
					value: currentTitle,
					prompt: 'Enter the CodeLens title (use {variable} to include the variable name)',
					placeHolder: 'e.g., Go to {variable} definition'
				});
			} else {
				newTitle = selected.label;
			}

			if (newTitle) {
				await config.update('codeLensTitle', newTitle, true);
				vscode.window.showInformationMessage(`CodeLens title set to: ${newTitle}`);
			}
		}),

		// Command to show the rendered template in a webview
		vscode.commands.registerCommand('j2magicwand.renderView', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'j2') {
				vscode.window.showErrorMessage('Please open a J2 template file first');
				return;
			}
			renderView.showRenderView(editor.document);
		})
	);

	// Register CodeLens and completion providers for J2 templates
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			{ pattern: '**/*.j2' },
			placeholderProvider
		),
		vscode.languages.registerCompletionItemProvider(
			{ pattern: '**/*.j2' },
			placeholderProvider
		)
	);

	// Register diagnostics update listeners for J2 templates
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(e => {
			if (isJ2Template(e.document)) {
				diagnostics.updateDiagnostics(e.document);
			}
		}),
		vscode.workspace.onDidOpenTextDocument(document => {
			if (isJ2Template(document)) {
				diagnostics.updateDiagnostics(document);
			}
		}),
		vscode.workspace.onDidCloseTextDocument(document => {
			if (isJ2Template(document)) {
				diagnostics.clearDiagnostics();
			}
		})
	);

	// Create and register status bar items for quick access to extension features
	const yamlPathButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	yamlPathButton.text = "$(file-code) J2 YAML Paths";
	yamlPathButton.tooltip = "Set YAML Paths";
	yamlPathButton.command = 'j2magicwand.setYamlPath';
	statusBarItems.push(yamlPathButton);

	const codeLensButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
	codeLensButton.text = "$(symbol-color) J2 CodeLens";
	codeLensButton.tooltip = "Set CodeLens Title";
	codeLensButton.command = 'j2magicwand.setCodeLensTitle';
	statusBarItems.push(codeLensButton);

	const renderButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
	renderButton.text = "$(preview) J2 Render";
	renderButton.tooltip = "Show rendered template";
	renderButton.command = 'j2magicwand.renderView';
	statusBarItems.push(renderButton);

	const languageButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);
	languageButton.text = "$(symbol-color) J2 Language";
	languageButton.tooltip = "Change render view language";
	languageButton.command = 'j2magicwand.changeRenderLanguage';
	statusBarItems.push(languageButton);

	// Show/hide status bar items based on active editor
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor && editor.document.languageId === 'j2') {
				statusBarItems.forEach(item => item.show());
			} else {
				statusBarItems.forEach(item => item.hide());
			}
		})
	);

	// Show status bar items if initial editor is J2
	if (vscode.window.activeTextEditor?.document.languageId === 'j2') {
		statusBarItems.forEach(item => item.show());
	}
}

/**
 * This method is called when your extension is deactivated.
 * It disposes all resources and cleans up.
 */
export function deactivate(): void {
	logger.info('Extension deactivating...');
	diagnostics.dispose();
	placeholderProvider.dispose();
	renderView.dispose();
	statusBarItems.forEach(item => item.dispose());
	logger.info('All components disposed');
}

/**
 * Checks for a newer VSIX version in the configured folder and prompts the user to update if found.
 */
async function checkForVsixUpdate(): Promise<void> {
	const scanFolder = getConfig('vsixScanFolder', 'c:\\soft\\.dotnet-tools');
	let files: string[] = [];
	try {
		files = fs.readdirSync(scanFolder);
	} catch (e) {
		return;
	}
	const vsixFiles = files
		.map(f => ({ file: f, version: parseVsixVersion(f) }))
		.filter(f => f.version)
		.sort((a, b) => compareVersions(b.version!, a.version!));

	if (vsixFiles.length === 0) {return;}

	const latest = vsixFiles[0];
	const ext = vscode.extensions.getExtension('j2magicwand.j2magicwand');
	const installedVersion = ext?.packageJSON.version;

	if (installedVersion && compareVersions(latest.version!, installedVersion) > 0) {
		const fullPath = path.join(scanFolder, latest.file);
		const result = await vscode.window.showInformationMessage(
			`A newer version (${latest.version}) of J2 Magic Wand is available. Update now?`,
			'Update'
		);
		if (result === 'Update') {
			await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(fullPath));
		}
	}
}

