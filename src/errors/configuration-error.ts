/**
 * ConfigurationError — thrown when required configuration is missing or invalid.
 *
 * Used for missing environment variables, invalid API URLs, or incomplete
 * instance context. Includes an optional hint to guide the user toward
 * a resolution.
 */
export class ConfigurationError extends Error {
  constructor(message: string, hint?: string) {
    super(hint ? `${message}. ${hint}` : message);
    this.name = 'ConfigurationError';
  }
}
