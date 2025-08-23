/**
 * Central Settings Loader for J2 Magic Wand
 * Loads YAML paths from central configuration folder
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils';
import { safeParseJson } from './parsing';

interface ServiceConfig {
    serviceName: string;
    environment: string;
    yamlPaths: string[];
}

export class CentralSettingsLoader {
    /**
     * Extracts service name from folder name using C# rules
     * @param folderName The folder name to process
     * @returns The processed service name
     */
    public static extractServiceName(folderName: string): string {
        return folderName
            .replace(/_/g, '-')
            .replace(/\//g, '-')
            .replace(/\./g, '-')
            .toLowerCase();
    }

    /**
     * Creates service configurations for all services and environments
     * @param centralPath The path to the central settings folder
     * @returns Array of service configurations
     */
    public static createServiceConfigurations(centralPath: string): ServiceConfig[] {
        if (!centralPath || !fs.existsSync(centralPath)) {
            logger.warn(`Central settings path does not exist: ${centralPath}`);
            return [];
        }

        logger.info(`Scanning central settings folder: ${centralPath}`);
        const configs: ServiceConfig[] = [];
        const environments = new Set<string>();
        const services = new Set<string>();
        
        // Find all environments from root application-{env}.yml files
        const rootFiles = fs.readdirSync(centralPath);
        logger.info(`Found ${rootFiles.length} files/folders in root`);
        
        for (const file of rootFiles) {
            if (file === 'application.yml' || file === 'application.yaml') {
                logger.info(`Found global base config: ${file}`);
                continue; // Skip base file
            }
            const match = file.match(/^application-(.+)\.(yml|yaml)$/);
            if (match) {
                environments.add(match[1]);
                logger.info(`Found environment: ${match[1]}`);
            }
        }

        // Find all services (directories with YAML files)
        const entries = fs.readdirSync(centralPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const serviceDir = path.join(centralPath, entry.name);
                logger.info(`Checking directory: ${entry.name}`);
                
                try {
                    const serviceFiles = fs.readdirSync(serviceDir);
                    logger.info(`  Found ${serviceFiles.length} files in ${entry.name}`);
                    
                    // Check if directory has any YAML files
                    const hasYaml = serviceFiles.some(f => f.endsWith('.yml') || f.endsWith('.yaml'));
                    if (hasYaml) {
                        services.add(entry.name);
                        logger.info(`  Added service: ${entry.name}`);
                        
                        // Check for service-specific environment files
                        // Pattern: {service-name}-{env}.yml or {service-name}-{env}.yaml
                        for (const file of serviceFiles) {
                            // First check for application-{env} pattern
                            let match = file.match(/^application-(.+)\.(yml|yaml)$/);
                            if (!match) {
                                // Then check for {service-name}-{env} pattern
                                const serviceNamePattern = new RegExp(`^${entry.name}-(.+)\\.(yml|yaml)$`);
                                match = file.match(serviceNamePattern);
                            }
                            if (match) {
                                environments.add(match[1]);
                                logger.info(`  Found service environment: ${match[1]}`);
                            }
                        }
                    } else {
                        logger.info(`  No YAML files found in ${entry.name}, skipping`);
                    }
                } catch (error) {
                    logger.warn(`  Error reading directory ${entry.name}: ${error}`);
                }
            }
        }
        
        logger.info(`Total services found: ${services.size}`);
        logger.info(`Total environments found: ${environments.size}`);

        // Create separate configurations for each service-environment combination
        const globalBase = path.join(centralPath, 'application.yml');
        
        // If we have services, create configs for each service-environment combination
        if (services.size > 0) {
            for (const service of services) {
                for (const env of environments) {
                    const yamlPaths: string[] = [];
                    
                    // 1. Global base
                    if (fs.existsSync(globalBase)) {
                        yamlPaths.push(globalBase);
                    }

                    // 2. Service base - try both patterns
                    // First try: {service-name}.yml
                    let serviceBase = path.join(centralPath, service, `${service}.yml`);
                    if (fs.existsSync(serviceBase)) {
                        yamlPaths.push(serviceBase);
                    } else {
                        // Fallback to: application.yml
                        serviceBase = path.join(centralPath, service, 'application.yml');
                        if (fs.existsSync(serviceBase)) {
                            yamlPaths.push(serviceBase);
                        }
                    }

                    // 3. Global environment file for this specific environment
                    const globalEnv = path.join(centralPath, `application-${env}.yml`);
                    if (fs.existsSync(globalEnv)) {
                        yamlPaths.push(globalEnv);
                    }

                    // 4. Service environment file for this specific environment
                    // First try: {service-name}-{env}.yml
                    let serviceEnv = path.join(centralPath, service, `${service}-${env}.yml`);
                    if (fs.existsSync(serviceEnv)) {
                        yamlPaths.push(serviceEnv);
                    } else {
                        // Fallback to: application-{env}.yml
                        serviceEnv = path.join(centralPath, service, `application-${env}.yml`);
                        if (fs.existsSync(serviceEnv)) {
                            yamlPaths.push(serviceEnv);
                        }
                    }

                    // Add configuration for this service-environment combination
                    if (yamlPaths.length > 0) {
                        configs.push({
                            serviceName: service,
                            environment: env,
                            yamlPaths: yamlPaths
                        });
                        logger.info(`Created config for ${service}-${env} with ${yamlPaths.length} files`);
                    }
                }
            }
        } else {
            // No services found, just create global configs for each environment
            for (const env of environments) {
                const yamlPaths: string[] = [];
                
                // Add global base
                if (fs.existsSync(globalBase)) {
                    yamlPaths.push(globalBase);
                }
                
                // Add global environment file
                const globalEnv = path.join(centralPath, `application-${env}.yml`);
                if (fs.existsSync(globalEnv)) {
                    yamlPaths.push(globalEnv);
                }
                
                if (yamlPaths.length > 0) {
                    configs.push({
                        serviceName: 'global',
                        environment: env,
                        yamlPaths: yamlPaths
                    });
                    logger.info(`Created global config for environment ${env} with ${yamlPaths.length} files`);
                }
            }
        }

        logger.info(`Total configurations created: ${configs.length}`);
        return configs;
    }

    /**
     * Shows a quick pick to select central settings folder
     * @returns The selected path or undefined if cancelled
     */
    public static async promptForCentralPath(): Promise<string | undefined> {
        // Prompt for central settings folder
        const folderUris = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Select Central Settings Folder',
            title: 'Select the root folder containing all service settings'
        });

        if (!folderUris || folderUris.length === 0) {
            return undefined;
        }

        return folderUris[0].fsPath;
    }

    /**
     * Loads service configurations from central settings and saves them
     */
    public static async loadFromCentralSettings(context: vscode.ExtensionContext): Promise<void> {
        const centralPath = await this.promptForCentralPath();
        if (!centralPath) {
            return;
        }

        const configs = this.createServiceConfigurations(centralPath);

        if (configs.length === 0) {
            vscode.window.showWarningMessage('No service configurations found in the central settings folder');
            return;
        }

        // Save configurations to the global storage file
        const saveFile = vscode.Uri.joinPath(context.globalStorageUri, 'j2magicwand-yaml-configs.json').fsPath;
        
        try {
            // Load existing configs if any
            let existingConfigs: ServiceConfig[] = [];
            if (fs.existsSync(saveFile)) {
                const data = fs.readFileSync(saveFile, 'utf8');
                existingConfigs = safeParseJson<ServiceConfig[]>(data, 'j2magicwand-yaml-configs.json') || [];
            }

            // Merge with new configs (new ones override existing)
            const configMap = new Map<string, ServiceConfig>();
            
            // First add existing
            for (const config of existingConfigs) {
                const key = `${config.serviceName}-${config.environment}`;
                configMap.set(key, config);
            }
            
            // Then add/override with new ones
            for (const config of configs) {
                const key = `${config.serviceName}-${config.environment}`;
                configMap.set(key, config);
            }

            // Save all configs
            const allConfigs = Array.from(configMap.values());
            fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
            fs.writeFileSync(saveFile, JSON.stringify(allConfigs, null, 2));

            // Store the central path for future use
            const config = vscode.workspace.getConfiguration('j2magicwand');
            await config.update('centralSettingsPath', centralPath, vscode.ConfigurationTarget.Workspace);

            vscode.window.showInformationMessage(
                `Loaded ${configs.length} service-environment configurations from central settings`
            );
        } catch (error: unknown) {
            logger.error('Failed to save configurations:', error);
            vscode.window.showErrorMessage(`Failed to save configurations: ${error}`);
        }
    }

    /**
     * Loads configuration for a specific J2 file based on its parent folder
     * @param j2FilePath The path to the J2 file
     * @param context The extension context
     * @returns The loaded YAML paths or undefined
     */
    public static async loadConfigurationForFile(j2FilePath: string, context: vscode.ExtensionContext): Promise<string[] | undefined> {
        // Extract service name from parent folder
        const parentFolder = path.basename(path.dirname(j2FilePath));
        const serviceName = this.extractServiceName(parentFolder);
        
        // Get the preferred environment (from last used or default)
        const environment = context.globalState.get('j2magicwand.lastEnvironment', 'dev') as string;
        
        // Load saved configurations
        const saveFile = vscode.Uri.joinPath(context.globalStorageUri, 'j2magicwand-yaml-configs.json').fsPath;
        
        try {
            if (!fs.existsSync(saveFile)) {
                return undefined;
            }
            
            const data = fs.readFileSync(saveFile, 'utf8');
            const configs = safeParseJson<ServiceConfig[]>(data, 'j2magicwand-yaml-configs.json') || [];
            
            // Find configuration for this service and environment
            let config = configs.find(c => 
                c.serviceName === serviceName && c.environment === environment
            );
            
            // If not found for the preferred environment, try to find any config for this service
            if (!config) {
                config = configs.find(c => c.serviceName === serviceName);
                if (config) {
                    logger.info(`No config found for ${serviceName}-${environment}, using ${serviceName}-${config.environment}`);
                }
            }
            
            if (config) {
                logger.info(`Auto-loaded configuration for service: ${serviceName}-${config.environment}`);
                // Update the last environment to what we actually loaded
                await context.globalState.update('j2magicwand.lastEnvironment', config.environment);
                return config.yamlPaths;
            }
        } catch (error: unknown) {
            logger.error('Failed to load configuration for file:', error);
        }
        
        return undefined;
    }
}