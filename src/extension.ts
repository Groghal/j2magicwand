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
import { HotReload } from './hotReload';

let diagnostics: J2Diagnostics;
let placeholderProvider: J2PlaceholderProvider;
let renderView: J2RenderView;
let hotReload: HotReload;
const statusBarItems: vscode.StatusBarItem[] = [];

/**
 * This method is called when your extension is activated.
 * It sets up all core features: diagnostics, CodeLens, completion, commands, and status bar items.
 * @param context The extension context provided by VS Code
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	logger.info('Extension activated');

	// Initialize hot reload (will only activate in development mode)
	hotReload = new HotReload(context);
	context.subscriptions.push(hotReload);

	// Initialize diagnostics, placeholder provider, and render view
	diagnostics = new J2Diagnostics();
	placeholderProvider = new J2PlaceholderProvider();
	renderView = new J2RenderView(context);

	// Check for VSIX updates in the configured folder
	checkForVsixUpdate();

	// On activation, update diagnostics for all already-open J2 documents
	for (const document of vscode.workspace.textDocuments) {
		if (await isJ2Template(document)) {
			diagnostics.updateDiagnostics(document);
		}
	}

	// Register all extension commands
	context.subscriptions.push(
		// Command to set YAML file paths for placeholder definitions
		vscode.commands.registerCommand('j2magicwand.setYamlPath', async () => {
			const config = vscode.workspace.getConfiguration('j2magicwand');
			let currentPaths = config.get('yamlPaths', []) as string[];
			const environments = ['local', 'dev', 'test', 'lt', 'preprod', 'prod'];
			const saveFile = vscode.Uri.joinPath(context.globalStorageUri, 'j2magicwand-yaml-configs.json').fsPath;

			// Helper to get default service name
			function getDefaultServiceName(): string {
				let serviceName = context.globalState.get('j2magicwand.lastService', '');
				if (serviceName) {
					return serviceName;
				}

				// Try to use the last J2 document from renderView
				if (renderView && renderView.lastJ2DocumentUri) {
					const filePath = renderView.lastJ2DocumentUri.fsPath;
					serviceName = path.basename(path.dirname(filePath));
					return serviceName;
				}

				// Fallback to active editor
				const editor = vscode.window.activeTextEditor;
				if (editor && editor.document.languageId === 'j2') {
					const filePath = editor.document.uri.fsPath;
					serviceName = path.basename(path.dirname(filePath));
					return serviceName;
				}

				return 'default';
			}

			// Helper to load all saved configs
			function loadAllConfigs(): Array<{ serviceName: string; environment: string; yamlPaths: string[] }> {
				if (fs.existsSync(saveFile)) {
					try {
						return JSON.parse(fs.readFileSync(saveFile, 'utf8'));
					} catch {
						return [];
					}
				}
				return [];
			}

			// Helper to save all configs
			function saveAllConfigs(configs: Array<{ serviceName: string; environment: string; yamlPaths: string[] }>): void {
				fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
				fs.writeFileSync(saveFile, JSON.stringify(configs, null, 2));
			}

			// Helper to refresh the webview after yamlPaths changes
			function refreshJ2Webview(): void {
				const updateAllJ2Diagnostics = (): void => {
					vscode.workspace.textDocuments.forEach(doc => {
						if (doc.languageId === 'j2' && diagnostics) {
							diagnostics.updateDiagnostics(doc);
						}
					});
				};
				const editor = vscode.window.activeTextEditor;
				if (editor && editor.document.languageId === 'j2' && renderView) {
					renderView.updateRenderView(editor.document);
					updateAllJ2Diagnostics();
				} else if (renderView && renderView.lastJ2DocumentUri) {
					vscode.workspace.openTextDocument(renderView.lastJ2DocumentUri).then(doc => {
						renderView.updateRenderView(doc);
						updateAllJ2Diagnostics();
					});
				}
			}

			while (true) {
				const fileItems = currentPaths.map((path, idx) => ({
					label: path,
					description: [
						idx > 0 ? '↑ Move Up' : '',
						idx < currentPaths.length - 1 ? '↓ Move Down' : '',
						'✎ Edit',
						'✖ Remove'
					].filter(Boolean).join(' | ')
				}));

				fileItems.push({ label: '$(file-add) Choose YAML file', description: '' });
				fileItems.push({ label: '$(cloud-upload) Save', description: 'Save current YAML config' });
				fileItems.push({ label: '$(cloud-download) Load', description: 'Load a saved YAML config' });

				const selected = await vscode.window.showQuickPick(fileItems, {
					placeHolder: 'Select a YAML file to manage, save, or load'
				});
				if (!selected) {return;}

				if (selected.label === '$(file-add) Choose YAML file') {
					if (currentPaths.length >= 5) {
						vscode.window.showErrorMessage('Maximum of 5 YAML paths allowed');
						continue;
					}
					const uris = await vscode.window.showOpenDialog({
						canSelectFiles: true,
						canSelectFolders: false,
						canSelectMany: false,
						openLabel: 'Select YAML file',
						filters: {
							'YAML files': ['yaml', 'yml']
						}
					});
					if (uris && uris.length > 0) {
						currentPaths.push(uris[0].fsPath);
						await config.update('yamlPaths', currentPaths, true);
						refreshJ2Webview();
						continue;
					}
				}
				if (selected.label === '$(cloud-upload) Save') {
					// Prompt for service name
					const defaultService = getDefaultServiceName();
					const serviceName = await vscode.window.showInputBox({
						prompt: 'Enter service name',
						value: defaultService
					}) || defaultService;
					// Prompt for environment
					const environment = await vscode.window.showQuickPick(environments, {
						placeHolder: 'Select environment',
						canPickMany: false
					}) || 'test';
					// Save config
					const allConfigs = loadAllConfigs();
					// Remove existing config for this service/env
					const filtered = allConfigs.filter((c: { serviceName: string; environment: string; yamlPaths: string[] }) =>
						!(c.serviceName === serviceName && c.environment === environment));
					filtered.push({ serviceName, environment, yamlPaths: currentPaths });
					saveAllConfigs(filtered);
					// Store last used environment
					context.globalState.update('j2magicwand.lastEnvironment', environment);
					context.globalState.update('j2magicwand.lastService', serviceName);
					refreshJ2Webview();
					continue;
				}
				if (selected.label === '$(cloud-download) Load') {
					const allConfigs = loadAllConfigs();
					if (allConfigs.length === 0) {
						vscode.window.showWarningMessage('No saved YAML configs found.');
						continue;
					}
					// Try to preselect current service/env
					const defaultService = getDefaultServiceName();
					const defaultEnv = 'test';
					const items = allConfigs.map((c: { serviceName: string; environment: string; yamlPaths: string[] }) => ({
						label: `${c.serviceName} (${c.environment})`,
						description: c.yamlPaths.join(', '),
						config: c
					}));
					let preselectIdx = items.findIndex(i => i.config.serviceName === defaultService && i.config.environment === defaultEnv);
					if (preselectIdx === -1) {
						preselectIdx = 0;
					}
					const selectedConfig = await vscode.window.showQuickPick(items, {
						placeHolder: 'Select a config to load',
						canPickMany: false
					});
					if (selectedConfig) {
						currentPaths = selectedConfig.config.yamlPaths;
						await config.update('yamlPaths', currentPaths, true);
						context.globalState.update('j2magicwand.lastEnvironment', selectedConfig.config.environment);
						context.globalState.update('j2magicwand.lastService', selectedConfig.config.serviceName);
						refreshJ2Webview();
					}
					continue;
				}

				const idx = currentPaths.indexOf(selected.label);
				const actions: vscode.QuickPickItem[] = [];
				if (idx > 0) {actions.push({ label: '↑ Move Up' });}
				if (idx < currentPaths.length - 1) {actions.push({ label: '↓ Move Down' });}
				actions.push({ label: '✎ Edit' });
				actions.push({ label: '✖ Remove' });
				actions.push({ label: 'Cancel' });

				const action = await vscode.window.showQuickPick(actions, {
					placeHolder: `Action for: ${selected.label}`
				});
				if (!action || action.label === 'Cancel') {continue;}

				if (action.label === '↑ Move Up') {
					[currentPaths[idx - 1], currentPaths[idx]] = [currentPaths[idx], currentPaths[idx - 1]];
				} else if (action.label === '↓ Move Down') {
					[currentPaths[idx + 1], currentPaths[idx]] = [currentPaths[idx], currentPaths[idx + 1]];
				} else if (action.label === '✎ Edit') {
					const newPath = await vscode.window.showInputBox({ value: currentPaths[idx], prompt: 'Edit YAML file path' });
					if (newPath) {currentPaths[idx] = newPath;}
				} else if (action.label === '✖ Remove') {
					currentPaths.splice(idx, 1);
				}
				await config.update('yamlPaths', currentPaths, true);
				refreshJ2Webview();
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
		}),

		// Command to handle multiple variables on a line
		vscode.commands.registerCommand('j2magicwand.showVariableQuickPick', async (variables: string[]) => {
			const selected = await vscode.window.showQuickPick(variables, {
				placeHolder: 'Select variable to go to definition'
			});

			if (selected) {
				vscode.commands.executeCommand('j2magicwand.goToDefinition', selected);
			}
		}),

		// Command to change render language
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

			if (selected && renderView) {
				renderView.changeLanguage(selected.value);
			}
		}),

		// Command to view and change current service name
		vscode.commands.registerCommand('j2magicwand.manageService', async () => {
			const currentService = context.globalState.get('j2magicwand.lastService', '');

			// Get all services from saved configs
			const saveFile = vscode.Uri.joinPath(context.globalStorageUri, 'j2magicwand-yaml-configs.json').fsPath;
			let services: string[] = [];

			if (fs.existsSync(saveFile)) {
				try {
					const allConfigs = JSON.parse(fs.readFileSync(saveFile, 'utf8')) as Array<{ serviceName: string; environment: string; yamlPaths: string[] }>;
					// Get unique service names
					services = [...new Set(allConfigs.map(c => c.serviceName))];
				} catch {}
			}

			// Add options to list
			const items: vscode.QuickPickItem[] = [
				{
					label: `$(pencil) Set Service Name`,
					description: currentService ? `Current: ${currentService}` : 'No service name set'
				},
				{
					label: `$(list-tree) Show All Saved Configurations`,
					description: "List all services and environments"
				}
			];

			// Add existing services if available
			if (services.length > 0) {
				items.push({ label: 'Switch to existing service:', kind: vscode.QuickPickItemKind.Separator });
				services.forEach(service => {
					items.push({
						label: service,
						description: service === currentService ? 'Current' : '',
						picked: service === currentService
					});
				});
			}

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: 'Manage service settings'
			});

			if (!selected) {
				return;
			}

			if (selected.label === `$(list-tree) Show All Saved Configurations`) {
				// Show all configurations
				if (fs.existsSync(saveFile)) {
					try {
						const allConfigs = JSON.parse(fs.readFileSync(saveFile, 'utf8')) as Array<{ serviceName: string; environment: string; yamlPaths: string[] }>;
						if (allConfigs.length === 0) {
							vscode.window.showInformationMessage("No saved configurations found.");
							return;
						}

						// Group by service name
						const groupedConfigs = new Map<string, Array<string>>();
						allConfigs.forEach(config => {
							if (!groupedConfigs.has(config.serviceName)) {
								groupedConfigs.set(config.serviceName, []);
							}
							groupedConfigs.get(config.serviceName)?.push(config.environment);
						});

						// Create markdown content for the webview
						let content = "# Saved Service Configurations\n\n";
						groupedConfigs.forEach((environments, service) => {
							content += `## Service: ${service}\n\n`;
							content += "Environments:\n";
							environments.forEach(env => {
								content += `- ${env}\n`;
							});
							content += "\n";
						});

						// Create and show the webview
						const panel = vscode.window.createWebviewPanel(
							'j2magicwand.configList',
							'J2 Magic Wand Configurations',
							vscode.ViewColumn.One,
							{}
						);

						panel.webview.html = `
							<!DOCTYPE html>
							<html lang="en">
							<head>
								<meta charset="UTF-8">
								<meta name="viewport" content="width=device-width, initial-scale=1.0">
								<title>J2 Magic Wand Configurations</title>
								<style>
									body { font-family: var(--vscode-font-family); padding: 10px; }
									h1 { color: var(--vscode-editor-foreground); }
									h2 { color: var(--vscode-textLink-foreground); }
									ul { padding-left: 20px; }
								</style>
							</head>
							<body>
								${content.replace(/\n/g, '<br>')}
							</body>
							</html>
						`;
					} catch (error) {
						vscode.window.showErrorMessage(`Error reading configurations: ${error}`);
					}
				} else {
					vscode.window.showInformationMessage("No saved configurations file found.");
				}
				return;
			}

			if (selected.label === `$(pencil) Set Service Name`) {
				const defaultValue = currentService || (renderView && renderView.lastJ2DocumentUri ?
					path.basename(path.dirname(renderView.lastJ2DocumentUri.fsPath)) : 'default');

				const serviceName = await vscode.window.showInputBox({
					prompt: 'Enter service name',
					value: defaultValue
				});

				if (serviceName) {
					await context.globalState.update('j2magicwand.lastService', serviceName);
					vscode.window.showInformationMessage(`Service name set to: ${serviceName}`);

					// Refresh any open views
					if (renderView && renderView.lastJ2DocumentUri) {
						vscode.workspace.openTextDocument(renderView.lastJ2DocumentUri).then(doc => {
							renderView.updateRenderView(doc);
						});
					}
				}
			} else if (services.includes(selected.label)) {
				// User selected an existing service
				await context.globalState.update('j2magicwand.lastService', selected.label);
				vscode.window.showInformationMessage(`Switched to service: ${selected.label}`);

				// Refresh any open views
				if (renderView && renderView.lastJ2DocumentUri) {
					vscode.workspace.openTextDocument(renderView.lastJ2DocumentUri).then(doc => {
						renderView.updateRenderView(doc);
					});
				}
			}
		}),

		// Register a command to force diagnostics update for all open J2 documents
		vscode.commands.registerCommand('j2magicwand.forceDiagnostics', () => {
			vscode.workspace.textDocuments.forEach(doc => {
				if (doc.languageId === 'j2' && diagnostics) {
					diagnostics.updateDiagnostics(doc);
				}
			});
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

	// Register document change handler
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(async event => {
			if (await isJ2Template(event.document)) {
				diagnostics.updateDiagnostics(event.document);
			}
		})
	);

	// Register document open handler
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(async document => {
			if (await isJ2Template(document)) {
				diagnostics.updateDiagnostics(document);
			}
		})
	);

	// Create and register status bar items for quick access to extension features
	const yamlPathButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	yamlPathButton.text = "$(file-code) J2 YAML Paths";
	yamlPathButton.tooltip = "Set YAML Paths";
	yamlPathButton.command = 'j2magicwand.setYamlPath';
	statusBarItems.push(yamlPathButton);

	const serviceButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
	serviceButton.text = "$(server) J2 Service";
	serviceButton.tooltip = "Manage Current Service";
	serviceButton.command = 'j2magicwand.manageService';
	statusBarItems.push(serviceButton);

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
	hotReload?.dispose();
	statusBarItems.forEach(item => item.dispose());
	logger.info('All components disposed');
}

/**
 * Checks for a newer VSIX version in the configured folder and prompts the user to update if found.
 */
async function checkForVsixUpdate(): Promise<void> {
	const scanFolder = getConfig('vsixScanFolder', 'c:\\soft\\.dotnet-tools');

	// Helper to recursively collect all .vsix files
	function getAllVsixFiles(dir: string): string[] {
		let results: string[] = [];
		try {
			const list = fs.readdirSync(dir);
			for (const file of list) {
				const filePath = path.join(dir, file);
				const stat = fs.statSync(filePath);
				if (stat && stat.isDirectory()) {
					results = results.concat(getAllVsixFiles(filePath));
				} else if (filePath.toLowerCase().endsWith('.vsix')) {
					results.push(filePath);
				}
			}
		} catch (e) {
			// Ignore errors
		}
		return results;
	}

	const vsixFilePaths: string[] = getAllVsixFiles(scanFolder);
	const vsixFiles = vsixFilePaths
		.map(f => ({ file: f, version: parseVsixVersion(path.basename(f)) }))
		.filter(f => f.version)
		.sort((a, b) => compareVersions(b.version!, a.version!));

	if (vsixFiles.length === 0) {return;}

	const latest = vsixFiles[0];
	const ext = vscode.extensions.getExtension('j2magicwand.j2magicwand');
	const installedVersion = ext?.packageJSON.version;

	if (installedVersion && compareVersions(latest.version!, installedVersion) > 0) {
		const fullPath = latest.file;
		const result = await vscode.window.showInformationMessage(
			`A newer version (${latest.version}) of J2 Magic Wand is available. Update now?`,
			'Update'
		);
		if (result === 'Update') {
			await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(fullPath));
		}
	}
}

