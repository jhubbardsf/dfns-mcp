/**
 * Environment variable configuration for DFNS REST MCP server
 */

export interface DfnsConfig {
  /** DFNS API URL - defaults to testnet */
  baseUrl: string;
  /** Organization ID (format: or-xxxxx-xxxxx-xxxxx) */
  orgId: string;
  /** Service account or PAT auth token */
  authToken: string;
  /** Credential ID for signing (required for write operations) */
  credId: string | undefined;
  /** PEM-encoded private key (required for write operations) */
  privateKey: string | undefined;
  /** App ID (optional) */
  appId: string | undefined;
}

/**
 * Check if the config has write credentials (credId + privateKey)
 */
export function hasWriteCredentials(config: DfnsConfig): boolean {
  return !!(config.credId && config.privateKey);
}

/**
 * Load configuration from environment variables
 * @throws Error if required variables are missing
 */
export function loadConfig(): DfnsConfig {
  const baseUrl = process.env.DFNS_API_URL || 'https://api.dfns.ninja';
  const orgId = process.env.DFNS_ORG_ID;
  const authToken = process.env.DFNS_AUTH_TOKEN;
  const credId = process.env.DFNS_CRED_ID;
  const privateKey = process.env.DFNS_PRIVATE_KEY;
  const appId = process.env.DFNS_APP_ID;

  // Validate required fields
  const errors: string[] = [];

  if (!orgId) {
    errors.push('DFNS_ORG_ID is required (format: or-xxxxx-xxxxx-xxxxx)');
  }

  if (!authToken) {
    errors.push('DFNS_AUTH_TOKEN is required (service account or PAT token)');
  }

  if (errors.length > 0) {
    throw new Error(`DFNS configuration error:\n${errors.join('\n')}`);
  }

  return {
    baseUrl,
    orgId: orgId!,
    authToken: authToken!,
    credId,
    privateKey,
    appId,
  };
}

/**
 * Check if the API URL points to mainnet (production)
 */
export function isMainnet(config: DfnsConfig): boolean {
  return config.baseUrl.includes('api.dfns.io');
}

/**
 * Get environment name from config
 */
export function getEnvironmentName(config: DfnsConfig): string {
  if (config.baseUrl.includes('api.dfns.io')) {
    return 'mainnet';
  }
  if (config.baseUrl.includes('api.dfns.ninja')) {
    return 'testnet';
  }
  return 'custom';
}
