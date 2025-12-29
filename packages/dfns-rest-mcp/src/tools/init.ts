/**
 * Init tool - connection verification and capability discovery
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DfnsConfig } from '../config.ts';
import { hasWriteCredentials, getEnvironmentName, isMainnet } from '../config.ts';
import { getClient } from '../client.ts';
import { formatSuccess, formatError, toMcpContent } from '../types.ts';

/**
 * Register the init tool
 */
export function registerInitTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'init',
    'Initialize DFNS connection and verify credentials. Call this first to confirm API access and discover available capabilities.',
    {},
    async () => {
      try {
        const client = getClient(config);

        // Try to list wallets as a connectivity test (read-only, low overhead)
        let connectionStatus = 'connected';
        let walletCount = 0;

        try {
          const wallets = await client.wallets.listWallets({ query: { limit: '1' } });
          walletCount = wallets.items?.length ?? 0;
          // If we got here, connection works
          connectionStatus = 'verified';
        } catch (err) {
          // Connection failed - might be auth issue
          connectionStatus = 'auth_error';
          return toMcpContent(
            formatError(err, 'Check DFNS_AUTH_TOKEN and DFNS_ORG_ID are correct')
          );
        }

        const canWrite = hasWriteCredentials(config);
        const environment = getEnvironmentName(config);

        const response = formatSuccess(
          `Connected to DFNS ${environment} as org ${config.orgId}`,
          {
            connection: {
              status: connectionStatus,
              apiUrl: config.baseUrl,
              environment,
              orgId: config.orgId,
            },
            capabilities: {
              readOperations: true,
              writeOperations: canWrite,
              writeNote: canWrite
                ? 'Full read/write access enabled'
                : 'Read-only mode. Set DFNS_CRED_ID and DFNS_PRIVATE_KEY for write access.',
            },
            availableTools: {
              wallets:
                'Create, list, transfer, broadcast transactions, get assets/history',
              keys: 'Create, list, sign, derive, import/export keys',
              policies: 'Manage approval policies and pending approvals',
              permissions: 'Manage RBAC permissions and assignments',
              networks: 'List networks, get fee estimates, read contracts',
              auth: 'Manage users and service accounts',
              webhooks: 'Manage webhook subscriptions',
              exchanges: 'Exchange integrations (deposits/withdrawals)',
              staking: 'Staking operations',
              swaps: 'Token swap operations',
              fee_sponsors: 'Fee sponsorship management',
            },
          },
          {
            nextSteps: [
              'Use wallets({ action: "list" }) to see your wallets',
              'Use networks({ action: "list" }) to see supported blockchains',
              'Use keys({ action: "list" }) to see your signing keys',
            ],
            warnings: isMainnet(config)
              ? ['MAINNET: You are connected to production. Transactions will use real assets.']
              : ['TESTNET: Using test environment. No real assets at risk.'],
          }
        );

        return toMcpContent(response);
      } catch (error) {
        return toMcpContent(
          formatError(error, 'Check your DFNS environment variables')
        );
      }
    }
  );
}
