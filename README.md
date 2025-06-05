# J2 Magic Wand VS Code Extension

A powerful Visual Studio Code extension for working with Jinja2 (J2) template files and YAML-based placeholder definitions. It provides diagnostics, CodeLens, completion, a live render view, and automatic VSIX update checks for a seamless templating workflow.

## Features

- **Diagnostics**: Instantly highlights invalid or missing placeholders in your J2 templates with red squiggly underlines and error messages.
- **CodeLens**: Adds clickable actions above each placeholder to quickly jump to its definition in your YAML files.
- **Completion**: Suggests variable names and values from your YAML as you type inside placeholders.
- **Render View**: Renders your J2 template with placeholder values, with syntax highlighting, line numbers, and validation for JSON, YAML, XML, or C#.
- **YAML Integration**: Supports multiple YAML files for placeholder definitions. Later files override earlier ones.
- **VSIX Update Check**: On activation, scans a configurable folder for newer `.vsix` extension packages and prompts you to update if a newer version is found.

## Installation

1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Press `F5` in VS Code to launch an Extension Development Host.
4. Or, build a VSIX package and install it manually:
   ```sh
   npm run package
   code --install-extension j2magicwand-<version>.vsix
   ```

## Usage

- Open a `.j2` or `.j2a` template file.
- Set your YAML placeholder file(s) via the status bar or command palette (`J2 Magic Wand: Set YAML Path`).
- Hover over placeholders for quick info, or use CodeLens to jump to definitions.
- Use the status bar to open the Render View and see your template rendered with real values.
- Diagnostics and completion work automatically as you type.

## Configuration

- **YAML Paths**: Configure one or more YAML files in settings (`j2magicwand.yamlPaths`).
- **VSIX Scan Folder**: Set the folder to scan for VSIX updates (`j2magicwand.vsixScanFolder`).
- **CodeLens Title**: Customize the CodeLens action text (`j2magicwand.codeLensTitle`).
- **Auto Update**: Enable automatic VSIX updates (`j2magicwand.autoUpdate`).
- **Silent Update**: Install updates silently and auto-reload (`j2magicwand.silentUpdate`).

## External Integration

You can update YAML paths from external applications using VS Code's command-line interface:

```bash
code --command "j2magicwand.updateYamlPaths" "[\"C:\\path\\to\\file1.yaml\", \"C:\\path\\to\\file2.yaml\"]"
```

See [EXTERNAL_UPDATE.md](EXTERNAL_UPDATE.md) for detailed integration instructions.

## Development

- See `.gitignore` for files and folders excluded from version control.
- Main source files:
  - `src/extension.ts` – Extension activation, command registration, and main logic
  - `src/diagnostics.ts` – Diagnostics and error highlighting
  - `src/placeholderProvider.ts` – CodeLens and completion
  - `src/renderView.ts` – Render view webview
  - `src/utils.ts` – Utility functions and logging
- Run tests and linting as needed.

## Contributing

Contributions are welcome! Please open issues or pull requests for bug fixes, new features, or improvements.

---

© 2024 J2 Magic Wand Contributors 