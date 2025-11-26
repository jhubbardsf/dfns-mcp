# DFNS MCP Server

MCP (Model Context Protocol) server that provides AI agents with access to DFNS documentation and SDK reference.

## Project Structure

```
dfns-mcp/
├── src/
│   ├── index.ts      # Main MCP server - tools, resources, startup
│   └── indexer.ts    # Document indexing and search logic
├── dfns-api-docs/    # DFNS API documentation (git submodule/copy)
├── dfns-sdk-ts/      # DFNS TypeScript SDK (git submodule/copy)
└── package.json
```

## Running the Server

```bash
# Start the server
bun run start

# Development with watch mode
bun run dev

# Inspect with MCP Inspector
bun run inspect
```

## MCP Tools Provided

| Tool | Description |
|------|-------------|
| `search_docs` | Full-text search across all documentation |
| `get_doc` | Retrieve specific document by path |
| `list_docs` | List documents, optionally by category |
| `get_blockchain_info` | Get SDK info for a specific blockchain |
| `list_blockchains` | List all supported blockchains |
| `get_api_endpoint` | Get documentation for specific API endpoint |

## MCP Resources Provided

| Resource | URI | Description |
|----------|-----|-------------|
| Auth Quick Reference | `dfns://quickref/authentication` | Authentication patterns and code samples |
| SDK Setup Guide | `dfns://quickref/sdk-setup` | Package installation and setup |
| Networks Reference | `dfns://quickref/networks` | All supported blockchain networks |

## Adding to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dfns-docs": {
      "command": "bun",
      "args": ["run", "/path/to/dfns-mcp/src/index.ts"]
    }
  }
}
```

## Architecture Notes

- **In-memory index**: Documents are indexed at startup for fast search
- **Scoring algorithm**: Title matches (10pts), keyword matches (5pts), content frequency (1pt)
- **Categories auto-detected**: Based on file paths in the documentation structure

## Development Preferences

- Use Bun exclusively (not Node.js or npm)
- TypeScript with strict types
- Use type guards instead of type casting (`as Type`)
