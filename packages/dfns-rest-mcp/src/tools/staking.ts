/**
 * Staking tool - staking operations
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DfnsConfig } from '../config.ts';
import { getClient } from '../client.ts';
import { formatSuccess, formatError, toMcpContent, missingParameter, summarizeList } from '../types.ts';

export function registerStakingTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'staking',
    'View DFNS staking positions and rewards.',
    {
      action: z.enum(['list', 'getRewards']).describe('Staking operation'),
      stakeId: z.string().optional().describe('Stake ID'),
      limit: z.number().optional().describe('Max results'),
      pageToken: z.string().optional().describe('Pagination token'),
    },
    async (params) => {
      try {
        const client = getClient(config);
        const { action } = params;

        switch (action) {
          case 'list': {
            const result = await client.staking.listStakes({
              query: { limit: params.limit?.toString(), paginationToken: params.pageToken } as any,
            });
            const stakes = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(stakes, 'stake'), { stakes }, {
                pagination: { hasMore: !!result.nextPageToken, nextPageToken: result.nextPageToken },
              })
            );
          }

          case 'getRewards': {
            if (!params.stakeId) return toMcpContent(missingParameter('stakeId', 'getRewards'));
            const rewards = await client.staking.getStakeRewards({ stakeId: params.stakeId });
            return toMcpContent(formatSuccess(`Rewards for stake ${params.stakeId}`, rewards));
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
