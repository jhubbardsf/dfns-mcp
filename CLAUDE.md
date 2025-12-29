# DFNS MCP Server

MCP (Model Context Protocol) server that provides AI agents with access to DFNS documentation and SDK reference.

## Project Structure

```
dfns-mcp/
├── src/
│   ├── index.ts         # Main MCP server - tools, resources, startup
│   ├── indexer.ts       # Document indexing and search logic
│   └── docs-fetcher.ts  # Downloads and caches docs from GitHub
├── package.json
├── README.md
└── LICENSE
```

**Note**: The `dfns-api-docs/` and `dfns-sdk-ts/` directories are NOT part of the repo. They are automatically downloaded to `~/.cache/dfns-mcp/` on first run.

## Running the Server

```bash
# Start the server
bun run start

# Development with watch mode
bun run dev

# Inspect with MCP Inspector
bun run inspect
```

## Publishing

```bash
# Publish to npm
npm publish

# Users install with:
bunx dfns-mcp@latest
```

## Architecture Overview

### Documentation Fetching

The server automatically downloads DFNS docs from GitHub on first startup:

1. **Cache Location**: `~/.cache/dfns-mcp/`
2. **Repos Fetched**:
   - `dfns/dfns-api-docs` (branch: `m`)
   - `dfns/dfns-sdk-ts` (branch: `m`)
3. **Update Strategy**: Auto-checks every 24 hours, or manual via `update_docs` tool
4. **Mechanism**: Downloads GitHub tarballs (faster than git clone)

### Indexing

- **In-memory index**: Documents and types indexed at startup
- **Document scoring**: Title (100pts), phrase (30pts), keyword (5pts)
- **Type indexer**: Parses TypeScript for `type`, `interface`, `class` definitions
- **Categories**: Auto-detected from file paths

## MCP Tools Provided

### Documentation Tools

| Tool | Description |
|------|-------------|
| `init` | Initialize DFNS MCP context and establish documentation requirements |
| `search_docs` | Full-text search across all documentation |
| `get_doc` | Retrieve specific document by path |
| `list_docs` | List documents, optionally by category |
| `get_code_examples` | Extract code blocks from documentation |
| `browse_api_structure` | Hierarchical view of API endpoints |
| `get_blockchain_info` | Get SDK info for a specific blockchain |
| `list_blockchains` | List all supported blockchains |
| `get_api_endpoint` | Get documentation for specific API endpoint |

### TypeScript Type Tools

| Tool | Description |
|------|-------------|
| `search_types` | Search SDK types by name |
| `get_type` | Get full type definition and import path |
| `list_types` | List all types by category |

### Cache Management Tools

| Tool | Description |
|------|-------------|
| `update_docs` | Force refresh documentation from GitHub |
| `cache_info` | Show cache location, last update, commit SHAs |

## MCP Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Auth Quick Reference | `dfns://quickref/authentication` | Authentication patterns |
| SDK Setup Guide | `dfns://quickref/sdk-setup` | Package installation |
| Networks Reference | `dfns://quickref/networks` | Supported blockchain networks |

## Adding to Claude Desktop

```json
{
  "mcpServers": {
    "dfns-docs": {
      "command": "bunx",
      "args": ["dfns-mcp@latest"]
    }
  }
}
```

## Development Preferences

- Use Bun exclusively (not Node.js or npm)
- TypeScript with strict types
- Use type guards instead of type casting (`as Type`)
- DFNS repos use `m` as their default branch (not `main`)
