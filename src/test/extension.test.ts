import * as assert from 'assert';
import * as vscode from 'vscode';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('j2magicwand.j2magicwand'));
	});

	test('Extension should activate', async () => {
		const ext = vscode.extensions.getExtension('j2magicwand.j2magicwand');
		assert.ok(ext);
		await ext?.activate();
		assert.strictEqual(ext?.isActive, true);
	});

	test('Should register commands', async () => {
		const commands = await vscode.commands.getCommands();
		assert.ok(commands.includes('j2magicwand.setYamlPath'));
		assert.ok(commands.includes('j2magicwand.goToDefinition'));
		assert.ok(commands.includes('j2magicwand.setCodeLensTitle'));
		assert.ok(commands.includes('j2magicwand.renderView'));
	});
});
