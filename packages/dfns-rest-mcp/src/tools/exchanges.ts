/**
 * Exchanges tool - exchange integration management
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DfnsConfig } from '../config.ts';
import { hasWriteCredentials } from '../config.ts';
import { getClient } from '../client.ts';
import {
  formatSuccess, formatError, toMcpContent,
  writeCredentialsRequired, missingParameter, summarizeList,
} from '../types.ts';

export function registerExchangesTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'exchanges',
    'Manage DFNS exchange integrations.',
    {
      action: z.enum(['list', 'get', 'delete']).describe('Exchange operation'),
      exchangeId: z.string().optional().describe('Exchange ID'),
      limit: z.number().optional().describe('Max results'),
      pageToken: z.string().optional().describe('Pagination token'),
    },
    async (params) => {
      try {
        const client = getClient(config);
        const { action } = params;

        switch (action) {
          case 'list': {
            const result = await client.exchanges.listExchanges({
              query: { limit: params.limit?.toString(), paginationToken: params.pageToken } as any,
            });
            const exchanges = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(exchanges, 'exchange'), { exchanges }, {
                pagination: { hasMore: !!result.nextPageToken, nextPageToken: result.nextPageToken },
              })
            );
          }

          case 'get': {
            if (!params.exchangeId) return toMcpContent(missingParameter('exchangeId', 'get'));
            const exchange = await client.exchanges.getExchange({ exchangeId: params.exchangeId });
            return toMcpContent(formatSuccess(`Exchange ${params.exchangeId}`, exchange));
          }

          case 'delete': {
            if (!hasWriteCredentials(config)) return toMcpContent(writeCredentialsRequired());
            if (!params.exchangeId) return toMcpContent(missingParameter('exchangeId', 'delete'));
            await client.exchanges.deleteExchange({ exchangeId: params.exchangeId });
            return toMcpContent(formatSuccess(`Deleted exchange ${params.exchangeId}`, { exchangeId: params.exchangeId }));
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
