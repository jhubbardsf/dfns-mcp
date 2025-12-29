/**
 * Tool registration for DFNS REST MCP server
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DfnsConfig } from '../config.ts';
import { registerInitTool } from './init.ts';
import { registerWalletsTool } from './wallets.ts';
import { registerKeysTool } from './keys.ts';
import { registerNetworksTool } from './networks.ts';
import { registerPoliciesTool } from './policies.ts';
import { registerPermissionsTool } from './permissions.ts';
import { registerAuthTool } from './auth.ts';
import { registerWebhooksTool } from './webhooks.ts';
import { registerExchangesTool } from './exchanges.ts';
import { registerStakingTool } from './staking.ts';
import { registerSwapsTool } from './swaps.ts';
import { registerFeeSponsorsTool } from './fee-sponsors.ts';

/**
 * Register all DFNS REST API tools on the MCP server
 */
export function registerAllTools(server: McpServer, config: DfnsConfig): void {
  // Core tool - initialization and status
  registerInitTool(server, config);

  // Primary domain tools
  registerWalletsTool(server, config);
  registerKeysTool(server, config);
  registerNetworksTool(server, config);

  // Governance tools
  registerPoliciesTool(server, config);
  registerPermissionsTool(server, config);
  registerAuthTool(server, config);

  // Integration tools
  registerWebhooksTool(server, config);
  registerExchangesTool(server, config);
  registerStakingTool(server, config);
  registerSwapsTool(server, config);
  registerFeeSponsorsTool(server, config);
}
