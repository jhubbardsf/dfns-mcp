/**
 * Webhooks tool - event subscription management
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

export function registerWebhooksTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'webhooks',
    'Manage DFNS webhook subscriptions.',
    {
      action: z.enum(['list', 'get', 'create', 'delete']).describe('Webhook operation'),
      webhookId: z.string().optional().describe('Webhook ID'),
      url: z.string().optional().describe('Webhook URL'),
      events: z.array(z.string()).optional().describe('Event types to subscribe'),
      description: z.string().optional().describe('Description'),
      limit: z.number().optional().describe('Max results'),
      pageToken: z.string().optional().describe('Pagination token'),
    },
    async (params) => {
      try {
        const client = getClient(config);
        const { action } = params;

        switch (action) {
          case 'list': {
            const result = await client.webhooks.listWebhooks({
              query: { limit: params.limit?.toString(), paginationToken: params.pageToken } as any,
            });
            const webhooks = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(webhooks, 'webhook'), { webhooks }, {
                pagination: { hasMore: !!result.nextPageToken, nextPageToken: result.nextPageToken },
              })
            );
          }

          case 'get': {
            if (!params.webhookId) return toMcpContent(missingParameter('webhookId', 'get'));
            const webhook = await client.webhooks.getWebhook({ webhookId: params.webhookId });
            return toMcpContent(formatSuccess(`Webhook ${params.webhookId}`, webhook));
          }

          case 'create': {
            if (!hasWriteCredentials(config)) return toMcpContent(writeCredentialsRequired());
            if (!params.url) return toMcpContent(missingParameter('url', 'create'));
            if (!params.events) return toMcpContent(missingParameter('events', 'create'));
            const webhook = await client.webhooks.createWebhook({
              body: { url: params.url, events: params.events, description: params.description } as any,
            });
            return toMcpContent(formatSuccess(`Created webhook: ${webhook.id}`, webhook));
          }

          case 'delete': {
            if (!hasWriteCredentials(config)) return toMcpContent(writeCredentialsRequired());
            if (!params.webhookId) return toMcpContent(missingParameter('webhookId', 'delete'));
            await client.webhooks.deleteWebhook({ webhookId: params.webhookId });
            return toMcpContent(formatSuccess(`Deleted webhook ${params.webhookId}`, { webhookId: params.webhookId }));
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
