#!/usr/bin/env bun

/**
 * DFNS REST MCP Server
 *
 * MCP server that enables AI agents to interact with the DFNS REST API
 * for wallet management, transaction signing, and organization operations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, hasWriteCredentials, getEnvironmentName } from './config.ts';
import { registerAllTools } from './tools/index.ts';

async function main() {
  // Load and validate configuration
  const config = loadConfig();

  // Create the MCP server
  const server = new McpServer({
    name: 'dfns-rest',
    version: '1.0.0',
  });

  // Register all domain tools
  registerAllTools(server, config);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup info to stderr (stdout is for MCP protocol)
  console.error('═══════════════════════════════════════════════════════════');
  console.error('  DFNS REST MCP Server v1.0.0');
  console.error('═══════════════════════════════════════════════════════════');
  console.error(`  API URL:      ${config.baseUrl}`);
  console.error(`  Environment:  ${getEnvironmentName(config)}`);
  console.error(`  Org ID:       ${config.orgId}`);
  console.error(`  Write Ops:    ${hasWriteCredentials(config) ? 'enabled' : 'disabled (read-only)'}`);
  console.error('═══════════════════════════════════════════════════════════');
  console.error('  Server running. Waiting for MCP connections...');
  console.error('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Fatal error starting DFNS REST MCP server:', err);
  process.exit(1);
});
