import * as assert from 'assert';
import * as vscode from 'vscode';
import { J2PlaceholderProvider } from '../placeholderProvider';

suite('PlaceholderProvider Test Suite', () => {
    let provider: J2PlaceholderProvider;
    let testDocument: vscode.TextDocument;

    suiteSetup(async () => {
        provider = new J2PlaceholderProvider();
        // Create a test document
        testDocument = await vscode.workspace.openTextDocument({
            content: '{{ test_variable }}',
            language: 'j2'
        });
    });

    test('Should provide CodeLens for placeholders', async () => {
        const codeLenses = provider.provideCodeLenses(testDocument);
        assert.ok(Array.isArray(codeLenses));
        assert.ok(codeLenses.length > 0);
        assert.strictEqual(codeLenses[0].command?.command, 'j2magicwand.goToDefinition');
    });

    test('Should provide completion items', async () => {
        const position = new vscode.Position(0, 3); // Position inside the placeholder
        const completionItems = provider.provideCompletionItems(testDocument, position);
        assert.ok(Array.isArray(completionItems));
    });

    test('Should resolve CodeLens', () => {
        const codeLens = new vscode.CodeLens(
            new vscode.Range(0, 0, 0, 20),
            {
                title: 'Test',
                command: 'j2magicwand.goToDefinition',
                arguments: ['test_variable']
            }
        );
        const resolvedCodeLens = provider.resolveCodeLens(codeLens);
        assert.strictEqual(resolvedCodeLens.command?.command, 'j2magicwand.goToDefinition');
    });
});
