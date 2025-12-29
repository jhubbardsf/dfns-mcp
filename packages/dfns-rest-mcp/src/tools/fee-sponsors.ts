/**
 * Fee Sponsors tool - gas sponsorship management
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

export function registerFeeSponsorsTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'fee_sponsors',
    'Manage DFNS fee sponsors for gas sponsorship.',
    {
      action: z.enum(['list', 'get', 'activate', 'deactivate', 'delete']).describe('Fee sponsor operation'),
      feeSponsorId: z.string().optional().describe('Fee sponsor ID'),
      limit: z.number().optional().describe('Max results'),
      pageToken: z.string().optional().describe('Pagination token'),
    },
    async (params) => {
      try {
        const client = getClient(config);
        const { action } = params;

        switch (action) {
          case 'list': {
            const result = await client.feeSponsors.listFeeSponsors({
              query: { limit: params.limit?.toString(), paginationToken: params.pageToken },
            });
            const sponsors = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(sponsors, 'fee sponsor'), { feeSponsors: sponsors }, {
                pagination: { hasMore: !!result.nextPageToken, nextPageToken: result.nextPageToken },
              })
            );
          }

          case 'get': {
            if (!params.feeSponsorId) return toMcpContent(missingParameter('feeSponsorId', 'get'));
            const sponsor = await client.feeSponsors.getFeeSponsor({ feeSponsorId: params.feeSponsorId });
            return toMcpContent(formatSuccess(`Fee sponsor ${params.feeSponsorId}`, sponsor));
          }

          case 'activate': {
            if (!hasWriteCredentials(config)) return toMcpContent(writeCredentialsRequired());
            if (!params.feeSponsorId) return toMcpContent(missingParameter('feeSponsorId', 'activate'));
            const sponsor = await client.feeSponsors.activateFeeSponsor({ feeSponsorId: params.feeSponsorId });
            return toMcpContent(formatSuccess(`Activated fee sponsor ${params.feeSponsorId}`, sponsor));
          }

          case 'deactivate': {
            if (!hasWriteCredentials(config)) return toMcpContent(writeCredentialsRequired());
            if (!params.feeSponsorId) return toMcpContent(missingParameter('feeSponsorId', 'deactivate'));
            const sponsor = await client.feeSponsors.deactivateFeeSponsor({ feeSponsorId: params.feeSponsorId });
            return toMcpContent(formatSuccess(`Deactivated fee sponsor ${params.feeSponsorId}`, sponsor));
          }

          case 'delete': {
            if (!hasWriteCredentials(config)) return toMcpContent(writeCredentialsRequired());
            if (!params.feeSponsorId) return toMcpContent(missingParameter('feeSponsorId', 'delete'));
            await client.feeSponsors.deleteFeeSponsor({ feeSponsorId: params.feeSponsorId });
            return toMcpContent(formatSuccess(`Deleted fee sponsor ${params.feeSponsorId}`, { feeSponsorId: params.feeSponsorId }));
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
