/**
 * Swaps tool - token swap operations
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DfnsConfig } from '../config.ts';
import { getClient } from '../client.ts';
import { formatSuccess, formatError, toMcpContent, missingParameter, summarizeList } from '../types.ts';

export function registerSwapsTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'swaps',
    'View DFNS token swap history.',
    {
      action: z.enum(['list', 'get']).describe('Swap operation'),
      swapId: z.string().optional().describe('Swap ID'),
      limit: z.number().optional().describe('Max results'),
      pageToken: z.string().optional().describe('Pagination token'),
    },
    async (params) => {
      try {
        const client = getClient(config);
        const { action } = params;

        switch (action) {
          case 'list': {
            const result = await client.swaps.listSwaps({
              query: { limit: params.limit?.toString(), paginationToken: params.pageToken } as any,
            });
            const swaps = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(swaps, 'swap'), { swaps }, {
                pagination: { hasMore: !!result.nextPageToken, nextPageToken: result.nextPageToken },
              })
            );
          }

          case 'get': {
            if (!params.swapId) return toMcpContent(missingParameter('swapId', 'get'));
            const swap = await client.swaps.getSwap({ swapId: params.swapId });
            return toMcpContent(formatSuccess(`Swap ${params.swapId}`, swap));
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
