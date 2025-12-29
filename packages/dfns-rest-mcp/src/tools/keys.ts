/**
 * Keys tool - cryptographic key management and signing
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DfnsConfig } from '../config.ts';
import { hasWriteCredentials, isMainnet } from '../config.ts';
import { getClient } from '../client.ts';
import {
  formatSuccess,
  formatError,
  toMcpContent,
  writeCredentialsRequired,
  missingParameter,
  getTransferWarnings,
  summarizeList,
} from '../types.ts';

/**
 * Register the keys tool
 */
export function registerKeysTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'keys',
    'Manage DFNS signing keys: create, list, sign data, derive child keys. Use action parameter to select operation.',
    {
      action: z
        .enum(['list', 'get', 'create', 'sign', 'getSignature', 'listSignatures'])
        .describe('The key operation to perform'),

      keyId: z.string().optional().describe('Key ID'),
      signatureId: z.string().optional().describe('Signature request ID'),
      network: z.string().optional().describe('Network for key creation'),
      name: z.string().optional().describe('Key name'),
      curve: z.enum(['ed25519', 'secp256k1', 'stark']).optional().describe('Elliptic curve'),
      hash: z.string().optional().describe('Hash to sign (hex encoded)'),
      limit: z.number().optional().describe('Max results'),
      pageToken: z.string().optional().describe('Pagination token'),
    },
    async (params) => {
      try {
        const client = getClient(config);
        const { action } = params;

        switch (action) {
          case 'list': {
            const result = await client.keys.listKeys({
              query: { limit: params.limit?.toString(), paginationToken: params.pageToken },
            });
            const keys = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(keys, 'key'), { keys }, {
                pagination: { hasMore: !!result.nextPageToken, nextPageToken: result.nextPageToken },
              })
            );
          }

          case 'get': {
            if (!params.keyId) return toMcpContent(missingParameter('keyId', 'get'));
            const key = await client.keys.getKey({ keyId: params.keyId });
            return toMcpContent(formatSuccess(`Key ${params.keyId}`, key));
          }

          case 'getSignature': {
            if (!params.keyId) return toMcpContent(missingParameter('keyId', 'getSignature'));
            if (!params.signatureId) return toMcpContent(missingParameter('signatureId', 'getSignature'));
            const sig = await client.keys.getSignature({ keyId: params.keyId, signatureId: params.signatureId });
            return toMcpContent(formatSuccess(`Signature ${params.signatureId}`, sig));
          }

          case 'listSignatures': {
            if (!params.keyId) return toMcpContent(missingParameter('keyId', 'listSignatures'));
            const result = await client.keys.listSignatures({
              keyId: params.keyId,
              query: { limit: params.limit?.toString(), paginationToken: params.pageToken },
            });
            const signatures = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(signatures, 'signature'), { signatures }, {
                pagination: { hasMore: !!result.nextPageToken, nextPageToken: result.nextPageToken },
              })
            );
          }

          case 'create': {
            if (!hasWriteCredentials(config)) return toMcpContent(writeCredentialsRequired());
            if (!params.network) return toMcpContent(missingParameter('network', 'create'));
            const key = await client.keys.createKey({
              body: { network: params.network, name: params.name, curve: params.curve } as any,
            });
            return toMcpContent(formatSuccess(`Created key: ${key.id}`, key));
          }

          case 'sign': {
            if (!hasWriteCredentials(config)) return toMcpContent(writeCredentialsRequired());
            if (!params.keyId) return toMcpContent(missingParameter('keyId', 'sign'));
            if (!params.hash) return toMcpContent(missingParameter('hash', 'sign'));
            const signature = await client.keys.generateSignature({
              keyId: params.keyId,
              body: { kind: 'Hash', hash: params.hash } as Parameters<typeof client.keys.generateSignature>[0]['body'],
            });
            return toMcpContent(
              formatSuccess(`Signature generated`, signature, { warnings: getTransferWarnings(isMainnet(config)) })
            );
          }

          default:
            return toMcpContent(formatError(new Error(`Unknown action: ${action}`)));
        }
      } catch (error) {
        return toMcpContent(formatError(error));
      }
    }
  );
}
