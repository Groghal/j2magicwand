import * as assert from 'assert';
import * as vscode from 'vscode';
import { getConfig, parseVsixVersion, compareVersions, escapeHtml } from '../utils';

suite('Utils Test Suite', () => {
    test('Should get configuration values', () => {
        const yamlPaths = getConfig<string[]>('yamlPaths', []);
        const codeLensTitle = getConfig<string>('codeLensTitle', 'To YAML!!!');

        assert.ok(Array.isArray(yamlPaths));
        assert.ok(typeof codeLensTitle === 'string');
    });

    test('Should handle configuration changes', async () => {
        // Get initial config
        const initialTitle = getConfig<string>('codeLensTitle', 'To YAML!!!');

        // Change configuration
        await vscode.workspace.getConfiguration('j2magicwand').update('codeLensTitle', 'New Title', true);

        // Get updated config
        const updatedTitle = getConfig<string>('codeLensTitle', 'To YAML!!!');
        assert.notStrictEqual(initialTitle, updatedTitle);
        assert.strictEqual(updatedTitle, 'New Title');

        // Reset configuration
        await vscode.workspace.getConfiguration('j2magicwand').update('codeLensTitle', 'To YAML!!!', true);
    });

    test('Should parse VSIX version', () => {
        const version = parseVsixVersion('j2magicwand-1.2.3.vsix');
        assert.strictEqual(version, '1.2.3');
        assert.strictEqual(parseVsixVersion('invalid.vsix'), undefined);
    });

    test('Should compare versions', () => {
        assert.strictEqual(compareVersions('1.2.3', '1.2.3'), 0);
        assert.strictEqual(compareVersions('1.2.4', '1.2.3'), 1);
        assert.strictEqual(compareVersions('1.2.3', '1.2.4'), -1);
    });

    test('Should escape HTML', () => {
        const unsafe = '<script>alert("xss")</script>';
        const safe = escapeHtml(unsafe);
        assert.strictEqual(safe, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
});
