/**
 * Safe parsing utilities for YAML and JSON with proper type checking
 */
import * as yaml from 'js-yaml';
import { logger } from './utils';

/**
 * Type guard to check if a value is a valid placeholder object
 */
export function isPlaceholderObject(value: unknown): value is Record<string, unknown> {
    return value !== null &&
           typeof value === 'object' &&
           !Array.isArray(value);
}

/**
 * Safely parse YAML content with validation
 * @param content The YAML content to parse
 * @param source Optional source identifier for error messages
 * @returns Parsed object or null if invalid
 */
export function safeParseYaml(content: string, source?: string): Record<string, unknown> | null {
    try {
        if (!content || content.trim() === '') {
            logger.debug(`Empty YAML content${source ? ` from ${source}` : ''}`);
            return null;
        }

        const parsed = yaml.load(content);

        if (!isPlaceholderObject(parsed)) {
            logger.error(`Invalid YAML structure${source ? ` in ${source}` : ''}: expected object, got ${typeof parsed}`);
            return null;
        }

        return parsed;
    } catch (error: unknown) {
        logger.error(`YAML parsing error${source ? ` in ${source}` : ''}:`, error);
        return null;
    }
}

/**
 * Safely parse JSON content with validation
 * @param content The JSON content to parse
 * @param source Optional source identifier for error messages
 * @returns Parsed value or null if invalid
 */
export function safeParseJson<T = unknown>(content: string, source?: string): T | null {
    try {
        if (!content || content.trim() === '') {
            logger.debug(`Empty JSON content${source ? ` from ${source}` : ''}`);
            return null;
        }

        return JSON.parse(content) as T;
    } catch (error: unknown) {
        logger.error(`JSON parsing error${source ? ` in ${source}` : ''}:`, error);
        return null;
    }
}

/**
 * Type guard to check if a value is an array of a specific type
 */
export function isArrayOf<T>(
    value: unknown,
    itemCheck: (item: unknown) => item is T
): value is T[] {
    return Array.isArray(value) && value.every(itemCheck);
}

/**
 * Type guard for configuration objects
 */
export interface YamlConfig {
    serviceName: string;
    environment: string;
    yamlPaths: string[];
}

export function isYamlConfig(value: unknown): value is YamlConfig {
    return isPlaceholderObject(value) &&
           typeof value.serviceName === 'string' &&
           typeof value.environment === 'string' &&
           Array.isArray(value.yamlPaths) &&
           value.yamlPaths.every(path => typeof path === 'string');
}

export function isYamlConfigArray(value: unknown): value is YamlConfig[] {
    return isArrayOf(value, isYamlConfig);
}
