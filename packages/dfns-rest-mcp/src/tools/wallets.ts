/**
 * Wallets tool - wallet management, transfers, and transactions
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DfnsConfig } from '../config.ts';
import { hasWriteCredentials, isMainnet } from '../config.ts';
import { getClient } from '../client.ts';
import {
  formatSuccess,
  formatError,
  toMcpContent,
  writeCredentialsRequired,
  missingParameter,
  getTransferWarnings,
  summarizeList,
} from '../types.ts';

/**
 * Register the wallets tool
 */
export function registerWalletsTool(server: McpServer, config: DfnsConfig): void {
  server.tool(
    'wallets',
    'Manage DFNS wallets: create, list, transfer assets, broadcast transactions, and view balances. Use action parameter to select operation.',
    {
      action: z
        .enum([
          'list',
          'get',
          'create',
          'update',
          'transfer',
          'getAssets',
          'getHistory',
          'getNfts',
          'getTransfer',
          'listTransfers',
          'broadcast',
          'getTransaction',
          'listTransactions',
        ])
        .describe('The wallet operation to perform'),

      // Common parameters
      walletId: z
        .string()
        .optional()
        .describe('Wallet ID (required for get, update, transfer, getAssets, etc.)'),

      // Create parameters
      network: z
        .string()
        .optional()
        .describe('Blockchain network for new wallet (e.g., "EthereumSepolia", "Solana")'),
      name: z
        .string()
        .optional()
        .describe('Human-readable name for the wallet'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Tags for organizing wallets'),

      // Transfer parameters
      to: z
        .string()
        .optional()
        .describe('Destination address for transfer'),
      amount: z
        .string()
        .optional()
        .describe('Amount to transfer (in smallest unit, e.g., Wei for ETH)'),
      kind: z
        .enum(['Native', 'Erc20', 'Erc721', 'Erc1155', 'Spl', 'Tep74', 'Asa', 'Sep41'])
        .optional()
        .describe('Asset type for transfer. "Native" for native token.'),
      contract: z
        .string()
        .optional()
        .describe('Token contract address (for ERC-20, ERC-721, etc.)'),
      tokenId: z
        .string()
        .optional()
        .describe('Token ID for NFT transfers (ERC-721, ERC-1155)'),
      memo: z
        .string()
        .optional()
        .describe('Memo/destination tag (for Stellar, XRP, etc.)'),
      priority: z
        .enum(['Slow', 'Standard', 'Fast'])
        .optional()
        .describe('Transaction priority (for EVM/Bitcoin)'),

      // Transaction broadcast parameters (simplified)
      transaction: z
        .unknown()
        .optional()
        .describe('Raw transaction object to broadcast (blockchain-specific)'),

      // Reference IDs
      transferId: z
        .string()
        .optional()
        .describe('Transfer ID for getTransfer'),
      transactionId: z
        .string()
        .optional()
        .describe('Transaction ID for getTransaction'),

      // Pagination
      limit: z
        .number()
        .optional()
        .describe('Max results per page (default: 50)'),
      pageToken: z
        .string()
        .optional()
        .describe('Pagination token from previous response'),
    },
    async (params) => {
      try {
        const client = getClient(config);
        const { action } = params;

        switch (action) {
          // ============================================================
          // READ OPERATIONS
          // ============================================================

          case 'list': {
            const result = await client.wallets.listWallets({
              query: {
                limit: params.limit?.toString(),
                paginationToken: params.pageToken,
              },
            });

            const wallets = result.items ?? [];
            const networks = [...new Set(wallets.map((w) => w.network))];

            return toMcpContent(
              formatSuccess(
                summarizeList(wallets, 'wallet', networks.join(', ')),
                {
                  wallets: wallets.map((w) => ({
                    id: w.id,
                    network: w.network,
                    address: w.address,
                    name: w.name,
                    status: w.status,
                    custodial: w.custodial,
                    dateCreated: w.dateCreated,
                    tags: w.tags,
                  })),
                },
                {
                  pagination: {
                    hasMore: !!result.nextPageToken,
                    nextPageToken: result.nextPageToken,
                  },
                  nextSteps: [
                    'Use wallets({ action: "get", walletId: "..." }) for details',
                    'Use wallets({ action: "getAssets", walletId: "..." }) for balances',
                  ],
                }
              )
            );
          }

          case 'get': {
            if (!params.walletId) {
              return toMcpContent(missingParameter('walletId', 'get'));
            }

            const wallet = await client.wallets.getWallet({
              walletId: params.walletId,
            });

            return toMcpContent(
              formatSuccess(`Wallet ${wallet.name || wallet.id} on ${wallet.network}`, wallet, {
                nextSteps: [
                  'Use wallets({ action: "getAssets", walletId: "..." }) for token balances',
                  'Use wallets({ action: "transfer", walletId: "...", ... }) to send assets',
                  'Use wallets({ action: "getHistory", walletId: "..." }) for transaction history',
                ],
              })
            );
          }

          case 'getAssets': {
            if (!params.walletId) {
              return toMcpContent(missingParameter('walletId', 'getAssets'));
            }

            const result = await client.wallets.getWalletAssets({
              walletId: params.walletId,
            });

            const assets = result.assets ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(assets, 'asset'), {
                walletId: params.walletId,
                assets: assets.map((a: Record<string, unknown>) => ({
                  kind: a.kind,
                  symbol: a.symbol,
                  balance: a.balance,
                  decimals: a.decimals,
                  verified: a.verified,
                  contract: a.contract,
                })),
              })
            );
          }

          case 'getHistory': {
            if (!params.walletId) {
              return toMcpContent(missingParameter('walletId', 'getHistory'));
            }

            const result = await client.wallets.getWalletHistory({
              walletId: params.walletId,
              query: {
                limit: params.limit?.toString(),
                paginationToken: params.pageToken,
              },
            }) as { items?: unknown[]; nextPageToken?: string };

            const history = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(history, 'transaction'), {
                walletId: params.walletId,
                transactions: history,
              }, {
                pagination: {
                  hasMore: !!result.nextPageToken,
                  nextPageToken: result.nextPageToken,
                },
              })
            );
          }

          case 'getNfts': {
            if (!params.walletId) {
              return toMcpContent(missingParameter('walletId', 'getNfts'));
            }

            const result = await client.wallets.getWalletNfts({
              walletId: params.walletId,
            }) as { items?: unknown[]; nextPageToken?: string };

            const nfts = result.items ?? (Array.isArray(result) ? result : []);
            return toMcpContent(
              formatSuccess(summarizeList(nfts, 'NFT'), {
                walletId: params.walletId,
                nfts,
              }, {
                pagination: {
                  hasMore: !!result.nextPageToken,
                  nextPageToken: result.nextPageToken,
                },
              })
            );
          }

          case 'getTransfer': {
            if (!params.walletId) {
              return toMcpContent(missingParameter('walletId', 'getTransfer'));
            }
            if (!params.transferId) {
              return toMcpContent(missingParameter('transferId', 'getTransfer'));
            }

            const transfer = await client.wallets.getTransfer({
              walletId: params.walletId,
              transferId: params.transferId,
            });

            return toMcpContent(
              formatSuccess(`Transfer ${transfer.id} - ${transfer.status}`, transfer)
            );
          }

          case 'listTransfers': {
            if (!params.walletId) {
              return toMcpContent(missingParameter('walletId', 'listTransfers'));
            }

            const result = await client.wallets.listTransfers({
              walletId: params.walletId,
              query: {
                limit: params.limit?.toString(),
                paginationToken: params.pageToken,
              },
            });

            const transfers = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(transfers, 'transfer'), {
                walletId: params.walletId,
                transfers,
              }, {
                pagination: {
                  hasMore: !!result.nextPageToken,
                  nextPageToken: result.nextPageToken,
                },
              })
            );
          }

          case 'getTransaction': {
            if (!params.walletId) {
              return toMcpContent(missingParameter('walletId', 'getTransaction'));
            }
            if (!params.transactionId) {
              return toMcpContent(missingParameter('transactionId', 'getTransaction'));
            }

            const tx = await client.wallets.getTransaction({
              walletId: params.walletId,
              transactionId: params.transactionId,
            });

            return toMcpContent(
              formatSuccess(`Transaction ${tx.id} - ${tx.status}`, tx)
            );
          }

          case 'listTransactions': {
            if (!params.walletId) {
              return toMcpContent(missingParameter('walletId', 'listTransactions'));
            }

            const result = await client.wallets.listTransactions({
              walletId: params.walletId,
              query: {
                limit: params.limit?.toString(),
                paginationToken: params.pageToken,
              },
            });

            const transactions = result.items ?? [];
            return toMcpContent(
              formatSuccess(summarizeList(transactions, 'transaction'), {
                walletId: params.walletId,
                transactions,
              }, {
                pagination: {
                  hasMore: !!result.nextPageToken,
                  nextPageToken: result.nextPageToken,
                },
              })
            );
          }

          // ============================================================
          // WRITE OPERATIONS (require credentials)
          // ============================================================

          case 'create': {
            if (!hasWriteCredentials(config)) {
              return toMcpContent(writeCredentialsRequired());
            }
            if (!params.network) {
              return toMcpContent(missingParameter('network', 'create'));
            }

            const wallet = await client.wallets.createWallet({
              body: {
                network: params.network,
                name: params.name,
                tags: params.tags,
              } as Parameters<typeof client.wallets.createWallet>[0]['body'],
            });

            return toMcpContent(
              formatSuccess(
                `Created wallet on ${wallet.network}: ${wallet.address}`,
                wallet,
                {
                  nextSteps: [
                    `Fund this wallet by sending assets to: ${wallet.address}`,
                    'Use wallets({ action: "getAssets", walletId: "..." }) to check balances',
                  ],
                }
              )
            );
          }

          case 'update': {
            if (!hasWriteCredentials(config)) {
              return toMcpContent(writeCredentialsRequired());
            }
            if (!params.walletId) {
              return toMcpContent(missingParameter('walletId', 'update'));
            }

            const wallet = await client.wallets.updateWallet({
              walletId: params.walletId,
              body: {
                name: params.name,
              },
            });

            return toMcpContent(
              formatSuccess(`Updated wallet ${wallet.id}`, wallet)
            );
          }

          case 'transfer': {
            if (!hasWriteCredentials(config)) {
              return toMcpContent(writeCredentialsRequired());
            }
            if (!params.walletId) {
              return toMcpContent(missingParameter('walletId', 'transfer'));
            }
            if (!params.to) {
              return toMcpContent(missingParameter('to', 'transfer'));
            }
            if (!params.amount) {
              return toMcpContent(missingParameter('amount', 'transfer'));
            }

            // Build transfer body
            const body: Record<string, unknown> = {
              kind: params.kind || 'Native',
              to: params.to,
              amount: params.amount,
            };

            if (params.contract) body.contract = params.contract;
            if (params.tokenId) body.tokenId = params.tokenId;
            if (params.memo) body.memo = params.memo;
            if (params.priority) body.priority = params.priority;

            const transfer = await client.wallets.transferAsset({
              walletId: params.walletId,
              body: body as Parameters<typeof client.wallets.transferAsset>[0]['body'],
            });

            return toMcpContent(
              formatSuccess(`Transfer initiated: ${transfer.id} - ${transfer.status}`, transfer, {
                warnings: getTransferWarnings(isMainnet(config)),
                nextSteps: [
                  `Track status: wallets({ action: "getTransfer", walletId: "${params.walletId}", transferId: "${transfer.id}" })`,
                ],
              })
            );
          }

          case 'broadcast': {
            if (!hasWriteCredentials(config)) {
              return toMcpContent(writeCredentialsRequired());
            }
            if (!params.walletId) {
              return toMcpContent(missingParameter('walletId', 'broadcast'));
            }
            if (!params.transaction) {
              return toMcpContent(missingParameter('transaction', 'broadcast'));
            }

            const tx = await client.wallets.broadcastTransaction({
              walletId: params.walletId,
              body: params.transaction as Parameters<typeof client.wallets.broadcastTransaction>[0]['body'],
            });

            return toMcpContent(
              formatSuccess(`Transaction broadcast: ${tx.id} - ${tx.status}`, tx, {
                warnings: getTransferWarnings(isMainnet(config)),
                nextSteps: [
                  `Track status: wallets({ action: "getTransaction", walletId: "${params.walletId}", transactionId: "${tx.id}" })`,
                ],
              })
            );
          }

          default:
            return toMcpContent(
              formatError(new Error(`Unknown action: ${action}`))
            );
        }
      } catch (error) {
        return toMcpContent(formatError(error));
      }
    }
  );
}
