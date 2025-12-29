# DFNS MCP Server

A Model Context Protocol (MCP) server that provides AI agents with access to the [DFNS](https://dfns.co) documentation, API reference, and SDK code.

## Features

- **Full-Text Search**: Instantly search across all DFNS guides, API docs, and SDK source code
- **TypeScript Type Intelligence**: Search and retrieve SDK type definitions with import paths
- **Auto-Updating Docs**: Documentation is fetched from GitHub on first run and cached locally
- **Context Initialization**: Dedicated `init` tool to enforce documentation-first behavior
- **Smart Context**: Retrieve specific documents, code examples, and API endpoint definitions
- **SDK Intelligence**: Mapped knowledge of supported blockchains and their SDK packages

## Requirements

This MCP server requires [Bun](https://bun.sh) - a fast JavaScript runtime.

**Linux/macOS:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows (PowerShell):**
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

## Quick Start

### Claude Code (Recommended)

```bash
claude mcp add -s user dfns-mcp -- bunx dfns-mcp@latest
```

The `-s user` flag installs to the user so it's available in all your projects.

### Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "dfns-mcp": {
      "command": "bunx",
      "args": ["dfns-mcp@latest"]
    }
  }
}
```

### Codex

```bash
codex mcp add dfns-mcp -- bunx dfns-mcp@latest
```

### Gemini CLI

Add to your Gemini CLI config (`~/.gemini/settings.json`):

```json
{
  "mcpServers": {
    "dfns-mcp": {
      "command": "bunx",
      "args": ["dfns-mcp@latest"]
    }
  }
}
```

### Global Installation

If you prefer to install globally instead of using `bunx`:

```bash
bun install -g dfns-mcp

# Then reference as just "dfns-mcp" in your MCP config
```

## Agent Instructions (Recommended)

Add this to your global `~/.claude/CLAUDE.md` (or `~/AGENTS.md` for other agents) to ensure your AI always uses up-to-date DFNS documentation:

```markdown
## DFNS Development

When working with DFNS (wallet infrastructure, key management, blockchain integrations):

1. **Always** call `mcp__dfns-mcp__init` at the start of any DFNS-related task
2. **Never** rely on training data for DFNS APIs - always use `search_docs` and `get_doc` to verify
3. Use `search_types` and `get_type` to get accurate TypeScript type definitions
4. DFNS APIs and SDKs change frequently - the MCP server has the latest documentation
```

This prevents agents from hallucinating outdated API signatures or SDK patterns.

## How It Works

On first run, the server automatically downloads the latest DFNS documentation from GitHub and caches it locally in `~/.cache/dfns-mcp/`. The cache is refreshed every 24 hours automatically, or you can force an update using the `update_docs` tool.

## Available Tools

### Documentation Tools

| Tool | Description |
|------|-------------|
| **`init`** | **CALL THIS FIRST.** Initializes the session and mandates strict documentation adherence |
| `search_docs` | Search all documentation and SDK files |
| `get_doc` | Retrieve the full content of a specific document |
| `list_docs` | List available documents by category |
| `get_code_examples` | Extract code snippets for a specific topic |
| `browse_api_structure` | View hierarchical API endpoint structure |
| `get_api_endpoint` | Get details for a specific API endpoint (e.g., `POST /wallets`) |
| `get_blockchain_info` | Get SDK package info for a specific chain (e.g., `Solana`) |
| `list_blockchains` | List all supported blockchains with their SDK packages |

### TypeScript Type Tools

| Tool | Description |
|------|-------------|
| `search_types` | Search SDK types by name (e.g., "Wallet", "Signer", "Transaction") |
| `get_type` | Get full type definition, import path, and usage |
| `list_types` | List all types by category |

### Cache Management

| Tool | Description |
|------|-------------|
| `update_docs` | Force update the documentation cache from GitHub |
| `cache_info` | Get information about the cache (location, last update, etc.) |

## Resources

The server also exposes these quick-reference resources:

| Resource URI | Description |
|--------------|-------------|
| `dfns://quickref/authentication` | Authentication patterns and code samples |
| `dfns://quickref/sdk-setup` | Package installation and setup guide |
| `dfns://quickref/networks` | All supported blockchain networks |

## Best Practices for Agents

When using this server, agents should follow this workflow:

1. **Initialize**: Call `init` immediately to establish the "Documentation First" protocol
2. **Search**: Use `search_docs` to find relevant information before answering ANY question
3. **Read**: Use `get_doc` to read the actual source material
4. **Answer**: Formulate responses based *only* on the retrieved context

## Development

```bash
# Clone the repo
git clone https://github.com/jmaddington/dfns-mcp.git
cd dfns-mcp

# Install dependencies
bun install

# Run in development mode with auto-reload
bun run dev

# Test with MCP Inspector
bun run inspect
```

## License

MIT
