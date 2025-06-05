# Updating J2 Magic Wand Settings Externally

## Overview
J2 Magic Wand allows external applications to update YAML paths and manage saved configurations through VS Code's command-line interface using the `code` command.

## Methods to Update Settings

### 1. Update YAML Paths Only

#### Direct JSON array:
```bash
# Update YAML paths from command line
code --command "j2magicwand.updateYamlPaths" "[\"C:\\path\\to\\file1.yaml\", \"C:\\path\\to\\file2.yaml\"]"
```

#### From JSON file (recommended for many paths):
```bash
# Create a JSON file with paths
echo ["C:\\configs\\base.yaml", "C:\\configs\\env.yaml", "C:\\configs\\override.yaml"] > paths.json

# Update using the file
code --command "j2magicwand.updateYamlPaths" "C:\\temp\\paths.json"
```

### 2. From PowerShell

```powershell
# PowerShell example
$yamlPaths = @("C:\configs\local.yaml", "C:\configs\override.yaml")
$json = $yamlPaths | ConvertTo-Json -Compress
code --command "j2magicwand.updateYamlPaths" $json
```

### 2. Set YAML Configuration (Service + Environment)

#### Direct JSON object:
```bash
# Set YAML configuration for a specific service and environment
code --command "j2magicwand.setYamlConfiguration" "{\"serviceName\":\"myapp\",\"environment\":\"dev\",\"yamlPaths\":[\"C:\\configs\\base.yaml\",\"C:\\configs\\dev.yaml\"]}"
```

#### From JSON file (recommended for complex configurations):
```bash
# Create a configuration file
cat > config.json << EOF
{
  "serviceName": "myapp",
  "environment": "production",
  "yamlPaths": [
    "C:\\configs\\global\\base.yaml",
    "C:\\configs\\global\\security.yaml",
    "C:\\configs\\services\\myapp\\base.yaml",
    "C:\\configs\\services\\myapp\\production.yaml",
    "C:\\configs\\overrides\\production-hotfix.yaml"
  ]
}
EOF

# Set configuration using the file
code --command "j2magicwand.setYamlConfiguration" "C:\\temp\\config.json"
```

This command will:
- Save the configuration for the specified service and environment
- Update the current YAML paths
- Remember the service and environment for future use

### 3. From PowerShell

#### Update YAML Paths Only:
```powershell
# Direct approach
$yamlPaths = @("C:\configs\local.yaml", "C:\configs\override.yaml")
$json = $yamlPaths | ConvertTo-Json -Compress
code --command "j2magicwand.updateYamlPaths" $json

# Using a file (for many paths)
$yamlPaths = @(
    "C:\configs\global\base.yaml",
    "C:\configs\global\security.yaml",
    "C:\configs\services\myapp\base.yaml",
    # ... many more paths
)
$yamlPaths | ConvertTo-Json | Out-File "C:\temp\paths.json"
code --command "j2magicwand.updateYamlPaths" "C:\temp\paths.json"
```

#### Set Configuration:
```powershell
# Direct approach
$config = @{
    serviceName = "myapp"
    environment = "test"
    yamlPaths = @("C:\configs\base.yaml", "C:\configs\test.yaml")
}
$json = $config | ConvertTo-Json -Compress
code --command "j2magicwand.setYamlConfiguration" $json

# Using a file (for complex configurations)
$config = @{
    serviceName = "myapp"
    environment = "production"
    yamlPaths = @(
        "C:\configs\global\base.yaml",
        "C:\configs\global\security.yaml",
        "C:\configs\services\myapp\base.yaml",
        "C:\configs\services\myapp\production.yaml",
        "C:\configs\overrides\production-hotfix.yaml"
    )
}
$config | ConvertTo-Json | Out-File "C:\temp\config.json"
code --command "j2magicwand.setYamlConfiguration" "C:\temp\config.json"
```

### 4. From C# Application

```csharp
using System.Diagnostics;
using System.Text.Json;

// Update YAML paths only (direct)
public void UpdateJ2YamlPaths(string[] yamlPaths)
{
    var json = JsonSerializer.Serialize(yamlPaths);
    var process = new Process
    {
        StartInfo = new ProcessStartInfo
        {
            FileName = "code",
            Arguments = $"--command \"j2magicwand.updateYamlPaths\" \"{json.Replace("\"", "\\\"")}\"",
            UseShellExecute = false,
            CreateNoWindow = true
        }
    };
    process.Start();
    process.WaitForExit();
}

// Update YAML paths from file (for large configurations)
public void UpdateJ2YamlPathsFromFile(string[] yamlPaths)
{
    // Save paths to a temporary file
    var tempFile = Path.Combine(Path.GetTempPath(), $"j2paths_{Guid.NewGuid()}.json");
    File.WriteAllText(tempFile, JsonSerializer.Serialize(yamlPaths));
    
    try
    {
        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "code",
                Arguments = $"--command \"j2magicwand.updateYamlPaths\" \"{tempFile}\"",
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };
        process.Start();
        process.WaitForExit();
    }
    finally
    {
        // Clean up temp file
        if (File.Exists(tempFile))
            File.Delete(tempFile);
    }
}

// Set YAML configuration with service and environment (direct)
public void SetJ2YamlConfiguration(string serviceName, string environment, string[] yamlPaths)
{
    var config = new 
    {
        serviceName = serviceName,
        environment = environment,
        yamlPaths = yamlPaths
    };
    var json = JsonSerializer.Serialize(config);
    var process = new Process
    {
        StartInfo = new ProcessStartInfo
        {
            FileName = "code",
            Arguments = $"--command \"j2magicwand.setYamlConfiguration\" \"{json.Replace("\"", "\\\"")}\"",
            UseShellExecute = false,
            CreateNoWindow = true
        }
    };
    process.Start();
    process.WaitForExit();
}

// Set YAML configuration from file (for large configurations)
public void SetJ2YamlConfigurationFromFile(string serviceName, string environment, string[] yamlPaths)
{
    var config = new 
    {
        serviceName = serviceName,
        environment = environment,
        yamlPaths = yamlPaths
    };
    
    // Save configuration to a temporary file
    var tempFile = Path.Combine(Path.GetTempPath(), $"j2config_{Guid.NewGuid()}.json");
    File.WriteAllText(tempFile, JsonSerializer.Serialize(config));
    
    try
    {
        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "code",
                Arguments = $"--command \"j2magicwand.setYamlConfiguration\" \"{tempFile}\"",
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };
        process.Start();
        process.WaitForExit();
    }
    finally
    {
        // Clean up temp file
        if (File.Exists(tempFile))
            File.Delete(tempFile);
    }
}
```

### 4. Direct Settings File Modification

You can also directly modify VS Code's settings.json file:

**User Settings Location:**
- Windows: `%APPDATA%\Code\User\settings.json`
- macOS: `~/Library/Application Support/Code/User/settings.json`
- Linux: `~/.config/Code/User/settings.json`

**Workspace Settings Location:**
- `.vscode/settings.json` in your workspace root

**Example settings.json:**
```json
{
    "j2magicwand.yamlPaths": [
        "C:\\configs\\base.yaml",
        "C:\\configs\\environment.yaml",
        "C:\\configs\\overrides.yaml"
    ]
}
```

After modifying the settings file, VS Code will automatically detect the changes and update the extension.

## Auto-Update Configuration

To enable silent auto-updates for the extension, add these settings:

```json
{
    "j2magicwand.autoUpdate": true,
    "j2magicwand.silentUpdate": true
}
```

With `silentUpdate` enabled, the extension will:
- Install updates automatically without prompting
- Show a notification that the update was installed
- Automatically reload VS Code after 3 seconds

## Return Values

When using the command API, it returns:

**Success:**
```json
{
    "success": true,
    "yamlPaths": ["path1.yaml", "path2.yaml"]
}
```

**Error:**
```json
{
    "success": false,
    "error": "Error message"
}
```

## Notes

1. **Path Order Matters**: YAML files are loaded in order, with later files overriding values from earlier ones.
2. **Maximum 5 Paths**: The extension supports a maximum of 5 YAML paths.
3. **Real-time Updates**: Changes are applied immediately to all open J2 template files.
4. **Diagnostics Update**: All diagnostics (error squiggles) are refreshed when paths change.
5. **Render View Update**: If the render view is open, it will be refreshed automatically.

## Troubleshooting

- Ensure VS Code's `code` command is available in your system PATH
- On Windows, paths should use double backslashes (`\\`) or forward slashes (`/`)
- Check VS Code's Output panel (View > Output > J2 Magic Wand) for error messages