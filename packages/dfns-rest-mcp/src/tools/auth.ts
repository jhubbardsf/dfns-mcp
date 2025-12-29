/**
 * Auth tool - user and service account management
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DfnsConfig } from '../config.ts';
import { getClient } from '../client.ts';
import { formatSuccess, formatError, toMcpContent, missingParameter, summarizeList } from '../types.ts';

export function registerAuthTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'auth',
    'View DFNS users, service accounts, and credentials.',
    {
      action: z.enum(['listUsers', 'getUser', 'listServiceAccounts', 'listCredentials']).describe('Auth operation'),
      userId: z.string().optional().describe('User ID'),
      serviceAccountId: z.string().optional().describe('Service account ID'),
      limit: z.number().optional().describe('Max results'),
      pageToken: z.string().optional().describe('Pagination token'),
    },
    async (params) => {
      try {
        const client = getClient(config);
        const { action } = params;

        switch (action) {
          case 'listUsers': {
            const result = await client.auth.listUsers({
              query: { limit: params.limit?.toString(), paginationToken: params.pageToken } as any,
            });
            const users = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(users, 'user'), {
                users: users.map((u: Record<string, unknown>) => ({
                  userId: u.userId,
                  username: u.username,
                  name: u.name,
                  kind: u.kind,
                  isActive: u.isActive,
                })),
              }, {
                pagination: { hasMore: !!result.nextPageToken, nextPageToken: result.nextPageToken },
              })
            );
          }

          case 'getUser': {
            if (!params.userId) return toMcpContent(missingParameter('userId', 'getUser'));
            const user = await client.auth.getUser({ userId: params.userId });
            return toMcpContent(formatSuccess(`User ${params.userId}`, user));
          }

          case 'listServiceAccounts': {
            const result = await (client.auth as any).listServiceAccounts() as { items?: unknown[] };
            const accounts = result.items ?? [];
            return toMcpContent(formatSuccess(summarizeList(accounts, 'service account'), { serviceAccounts: accounts }));
          }

          case 'listCredentials': {
            const result = await (client.auth as any).listCredentials() as { items?: unknown[] };
            const credentials = result.items ?? [];
            return toMcpContent(formatSuccess(summarizeList(credentials, 'credential'), { credentials }));
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
