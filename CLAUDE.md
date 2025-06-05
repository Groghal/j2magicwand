# J2 Magic Wand - Project Overview

## Project Description
J2 Magic Wand is a VS Code extension that enhances support for Jinja2 (J2) template files with YAML-based placeholder definitions. It provides real-time diagnostics, code completion, CodeLens navigation, and a live render view.

## Key Components

### Main Files
- `src/extension.ts` - Extension entry point, command registration, and initialization
- `src/diagnostics.ts` - Real-time error checking for invalid/missing placeholders
- `src/placeholderProvider.ts` - CodeLens and completion provider for placeholders
- `src/renderView.ts` - Webview for live template rendering with syntax highlighting
- `src/utils.ts` - Utility functions, logging, and configuration helpers
- `src/hotReload.ts` - Development hot reload functionality

### Features
1. **Diagnostics** - Red squiggly lines for invalid placeholders with detailed error messages
2. **CodeLens** - Clickable actions above placeholders to jump to YAML definitions
3. **Completion** - IntelliSense for placeholder names and values from YAML files
4. **Render View** - Live preview of rendered templates with syntax highlighting
5. **YAML Path Management** - Support for multiple YAML files with override capability
6. **VSIX Auto-Update** - Scans configured folder for newer extension versions

## Commands
- `j2magicwand.setYamlPath` - Set/manage YAML file paths
- `j2magicwand.goToDefinition` - Jump to variable definition in YAML
- `j2magicwand.setCodeLensTitle` - Customize CodeLens action text
- `j2magicwand.renderView` - Show rendered template view
- `j2magicwand.changeRenderLanguage` - Change syntax highlighting language
- `j2magicwand.manageService` - Manage service configurations

## Testing & Linting
```bash
npm run lint          # Run ESLint
npm run compile       # Compile TypeScript
npm test             # Run tests
```

## Development Notes
- Extension activates on `.j2` files
- Supports configurable file patterns via `j2magicwand.filePatterns`
- YAML files are loaded in order with later files overriding earlier ones
- Maximum 5 YAML paths allowed
- Hot reload available in development mode