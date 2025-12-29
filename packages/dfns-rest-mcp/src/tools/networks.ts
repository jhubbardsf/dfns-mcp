/**
 * Networks tool - blockchain network information
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DfnsConfig } from '../config.ts';
import { getClient } from '../client.ts';
import { formatSuccess, formatError, toMcpContent, missingParameter } from '../types.ts';

const SUPPORTED_NETWORKS = {
  Ethereum: { chain: 'EVM', testnet: false },
  EthereumSepolia: { chain: 'EVM', testnet: true },
  Polygon: { chain: 'EVM', testnet: false },
  PolygonAmoy: { chain: 'EVM', testnet: true },
  Arbitrum: { chain: 'EVM', testnet: false },
  Base: { chain: 'EVM', testnet: false },
  Optimism: { chain: 'EVM', testnet: false },
  Solana: { chain: 'Solana', testnet: false },
  SolanaDevnet: { chain: 'Solana', testnet: true },
  Bitcoin: { chain: 'Bitcoin', testnet: false },
  BitcoinTestnet3: { chain: 'Bitcoin', testnet: true },
} as const;

export function registerNetworksTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'networks',
    'Get information about supported blockchain networks and fee estimates.',
    {
      action: z.enum(['list', 'getFees']).describe('The network operation'),
      network: z.string().optional().describe('Network name for getFees'),
      testnetsOnly: z.boolean().optional().describe('Filter to testnets only'),
      mainnetsOnly: z.boolean().optional().describe('Filter to mainnets only'),
    },
    async (params) => {
      try {
        const client = getClient(config);
        const { action } = params;

        switch (action) {
          case 'list': {
            let networks = Object.entries(SUPPORTED_NETWORKS).map(([name, info]) => ({
              name, chain: info.chain, isTestnet: info.testnet,
            }));
            if (params.testnetsOnly) networks = networks.filter(n => n.isTestnet);
            if (params.mainnetsOnly) networks = networks.filter(n => !n.isTestnet);
            return toMcpContent(
              formatSuccess(`${networks.length} networks available`, { networks }, {
                nextSteps: ['Use networks({ action: "getFees", network: "..." }) for fee estimates'],
              })
            );
          }

          case 'getFees': {
            if (!params.network) return toMcpContent(missingParameter('network', 'getFees'));
            // Use the networks client to read fee info
            const result = await (client.networks as { readContract: (params: unknown) => Promise<unknown> }).readContract({
              network: params.network,
              body: { kind: 'FeeEstimate' } as unknown,
            }).catch(() => ({ message: 'Fee estimation not available for this network' }));
            return toMcpContent(formatSuccess(`Fee info for ${params.network}`, result));
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
