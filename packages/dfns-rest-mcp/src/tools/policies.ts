/**
 * Policies tool - policy engine and approvals
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

export function registerPoliciesTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'policies',
    'Manage DFNS policies and approval workflows.',
    {
      action: z.enum(['list', 'get', 'listApprovals', 'getApproval', 'decide']).describe('Policy operation'),
      policyId: z.string().optional().describe('Policy ID'),
      approvalId: z.string().optional().describe('Approval ID'),
      decision: z.enum(['Approved', 'Denied']).optional().describe('Approval decision'),
      reason: z.string().optional().describe('Decision reason'),
      limit: z.number().optional().describe('Max results'),
      pageToken: z.string().optional().describe('Pagination token'),
    },
    async (params) => {
      try {
        const client = getClient(config);
        const { action } = params;

        switch (action) {
          case 'list': {
            const result = await client.policies.listPolicies({
              query: { limit: params.limit?.toString(), paginationToken: params.pageToken },
            });
            const policies = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(policies, 'policy'), { policies }, {
                pagination: { hasMore: !!result.nextPageToken, nextPageToken: result.nextPageToken },
              })
            );
          }

          case 'get': {
            if (!params.policyId) return toMcpContent(missingParameter('policyId', 'get'));
            const policy = await client.policies.getPolicy({ policyId: params.policyId });
            return toMcpContent(formatSuccess(`Policy ${params.policyId}`, policy));
          }

          case 'listApprovals': {
            const result = await client.policies.listApprovals({
              query: { limit: params.limit?.toString(), paginationToken: params.pageToken },
            });
            const approvals = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(approvals, 'approval'), { approvals }, {
                pagination: { hasMore: !!result.nextPageToken, nextPageToken: result.nextPageToken },
              })
            );
          }

          case 'getApproval': {
            if (!params.approvalId) return toMcpContent(missingParameter('approvalId', 'getApproval'));
            const approval = await client.policies.getApproval({ approvalId: params.approvalId });
            return toMcpContent(formatSuccess(`Approval ${params.approvalId}`, approval));
          }

          case 'decide': {
            if (!hasWriteCredentials(config)) return toMcpContent(writeCredentialsRequired());
            if (!params.approvalId) return toMcpContent(missingParameter('approvalId', 'decide'));
            if (!params.decision) return toMcpContent(missingParameter('decision', 'decide'));
            const result = await client.policies.createApprovalDecision({
              approvalId: params.approvalId,
              body: { value: params.decision, reason: params.reason },
            });
            return toMcpContent(formatSuccess(`Decision: ${params.decision}`, result));
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
