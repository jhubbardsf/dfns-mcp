/**
 * Permissions tool - RBAC management
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

export function registerPermissionsTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'permissions',
    'Manage DFNS permissions and assignments.',
    {
      action: z.enum(['list', 'get', 'create']).describe('Permission operation'),
      permissionId: z.string().optional().describe('Permission ID'),
      name: z.string().optional().describe('Permission name'),
      operations: z.array(z.string()).optional().describe('Allowed operations'),
      limit: z.number().optional().describe('Max results'),
      pageToken: z.string().optional().describe('Pagination token'),
    },
    async (params) => {
      try {
        const client = getClient(config);
        const { action } = params;

        switch (action) {
          case 'list': {
            const result = await client.permissions.listPermissions({
              query: { limit: params.limit?.toString(), paginationToken: params.pageToken },
            });
            const permissions = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(permissions, 'permission'), { permissions }, {
                pagination: { hasMore: !!result.nextPageToken, nextPageToken: result.nextPageToken },
              })
            );
          }

          case 'get': {
            if (!params.permissionId) return toMcpContent(missingParameter('permissionId', 'get'));
            const permission = await client.permissions.getPermission({ permissionId: params.permissionId });
            return toMcpContent(formatSuccess(`Permission ${params.permissionId}`, permission));
          }

          case 'create': {
            if (!hasWriteCredentials(config)) return toMcpContent(writeCredentialsRequired());
            if (!params.name) return toMcpContent(missingParameter('name', 'create'));
            if (!params.operations) return toMcpContent(missingParameter('operations', 'create'));
            const permission = await client.permissions.createPermission({
              body: { name: params.name, operations: params.operations as string[] } as Parameters<typeof client.permissions.createPermission>[0]['body'],
            });
            return toMcpContent(formatSuccess(`Created permission: ${params.name}`, permission));
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
