/**
 * DFNS SDK client initialization and management
 */

import { DfnsApiClient } from '@dfns/sdk';
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner';
import type { DfnsConfig } from './config.ts';
import { hasWriteCredentials } from './config.ts';

let clientInstance: DfnsApiClient | null = null;
let currentConfig: DfnsConfig | null = null;

/**
 * Initialize or get the DFNS API client singleton
 *
 * The client is lazily initialized and reused across all tool calls.
 * If write credentials are provided (credId + privateKey), the client
 * will be configured with an AsymmetricKeySigner for User Action Signing.
 */
export function getClient(config: DfnsConfig): DfnsApiClient {
  // Return existing client if config hasn't changed
  if (clientInstance && currentConfig === config) {
    return clientInstance;
  }

  // Create signer if write credentials are available
  let signer: AsymmetricKeySigner | undefined;

  if (hasWriteCredentials(config)) {
    signer = new AsymmetricKeySigner({
      credId: config.credId!,
      privateKey: config.privateKey!,
    });
  }

  // Create the client
  // Note: Using 'as any' because SDK types don't include appId even though it's valid
  clientInstance = new DfnsApiClient({
    baseUrl: config.baseUrl,
    appId: config.appId ?? 'dfns-rest-mcp',
    authToken: config.authToken,
    signer,
  } as any);

  currentConfig = config;

  return clientInstance;
}

/**
 * Reset the client singleton (useful for testing or config changes)
 */
export function resetClient(): void {
  clientInstance = null;
  currentConfig = null;
}

/**
 * Check if a client has been initialized
 */
export function hasClient(): boolean {
  return clientInstance !== null;
}
