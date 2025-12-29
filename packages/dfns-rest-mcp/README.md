# DFNS REST MCP Server

MCP (Model Context Protocol) server that enables AI agents to interact with the DFNS REST API for wallet management, key operations, and organization administration.

## Features

- **Full DFNS API Access**: 12 domain-based tools covering wallets, keys, policies, permissions, and more
- **Read/Write Support**: Optional write operations with User Action Signing
- **Environment-Based Config**: Simple setup via environment variables
- **Testnet Default**: Safe defaults for development; easily switch to mainnet

## Installation

```bash
cd packages/dfns-rest-mcp
bun install
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DFNS_ORG_ID` | Yes | Your DFNS organization ID |
| `DFNS_AUTH_TOKEN` | Yes | Authentication token (PAT or service account) |
| `DFNS_API_URL` | No | API URL (default: `https://api.dfns.ninja` for testnet) |
| `DFNS_APP_ID` | No | Application ID (default: `dfns-rest-mcp`) |
| `DFNS_CRED_ID` | No* | Credential ID for write operations |
| `DFNS_PRIVATE_KEY` | No* | Private key (PEM format) for signing |

\* Required for write operations (creating wallets, transferring assets, etc.)

### Example `.env` File

```bash
# Required
DFNS_ORG_ID=or-xxxxx-xxxxx
DFNS_AUTH_TOKEN=eyJhbGciOiJS...

# Optional: For mainnet
# DFNS_API_URL=https://api.dfns.io

# Optional: For write operations
DFNS_CRED_ID=cr-xxxxx-xxxxx
DFNS_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----
...
-----END EC PRIVATE KEY-----"
```

## Usage

### Running the Server

```bash
# Start the MCP server
bun run start

# Development with watch mode
bun run dev

# Inspect with MCP Inspector
bun run inspect
```

### Adding to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dfns-rest": {
      "command": "bun",
      "args": ["run", "/path/to/dfns-mcp/packages/dfns-rest-mcp/src/index.ts"],
      "env": {
        "DFNS_ORG_ID": "or-xxxxx-xxxxx",
        "DFNS_AUTH_TOKEN": "your-auth-token"
      }
    }
  }
}
```

## Available Tools

### `init`
Initialize connection and verify credentials. Call first to confirm API access.

```
init()
```

### `wallets`
Manage DFNS wallets: create, list, transfer assets, broadcast transactions.

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `list` | List all wallets | - |
| `get` | Get wallet details | `walletId` |
| `create` | Create new wallet | `network` |
| `update` | Update wallet name | `walletId`, `name` |
| `transfer` | Transfer assets | `walletId`, `to`, `amount`, `kind` |
| `getAssets` | Get wallet assets | `walletId` |
| `getHistory` | Get transaction history | `walletId` |
| `getNfts` | Get wallet NFTs | `walletId` |
| `broadcast` | Broadcast transaction | `walletId`, `txHash` or `signedTx` |
| `getTransaction` | Get transaction details | `walletId`, `txId` |
| `listTransactions` | List wallet transactions | `walletId` |
| `getTransfer` | Get transfer details | `walletId`, `transferId` |
| `listTransfers` | List wallet transfers | `walletId` |

### `keys`
Manage cryptographic keys: create, sign data, list signatures.

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `list` | List all keys | - |
| `get` | Get key details | `keyId` |
| `create` | Create new key | `network` |
| `sign` | Sign hash | `keyId`, `hash` |
| `getSignature` | Get signature | `keyId`, `signatureId` |
| `listSignatures` | List key signatures | `keyId` |

### `networks`
Get blockchain network information and fee estimates.

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `list` | List supported networks | - |
| `get` | Get network details | `network` |
| `getFees` | Get fee estimates | `network` |
| `readContract` | Read smart contract | `network`, `contract`, `method` |

### `policies`
Manage approval policies and pending approvals.

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `list` | List policies | - |
| `get` | Get policy details | `policyId` |
| `listApprovals` | List pending approvals | - |
| `getApproval` | Get approval details | `approvalId` |
| `approve` | Approve request | `approvalId` |
| `reject` | Reject request | `approvalId` |

### `permissions`
Manage RBAC permissions and assignments.

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `list` | List permissions | - |
| `get` | Get permission details | `permissionId` |
| `listAssignments` | List assignments | - |
| `getAssignment` | Get assignment | `assignmentId` |

### `auth`
View users, service accounts, and credentials.

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `listUsers` | List org users | - |
| `getUser` | Get user details | `userId` |
| `listServiceAccounts` | List service accounts | - |
| `listCredentials` | List credentials | - |

### `webhooks`
Manage webhook subscriptions for events.

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `list` | List webhooks | - |
| `get` | Get webhook details | `webhookId` |
| `create` | Create webhook | `url`, `events` |
| `delete` | Delete webhook | `webhookId` |

### `exchanges`
Manage exchange integrations.

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `list` | List exchanges | - |
| `get` | Get exchange details | `exchangeId` |
| `delete` | Delete exchange | `exchangeId` |

### `staking`
View staking positions and rewards.

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `list` | List stakes | - |
| `getRewards` | Get stake rewards | `stakeId` |

### `swaps`
View token swap history.

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `list` | List swaps | - |
| `get` | Get swap details | `swapId` |

### `fee_sponsors`
Manage gas fee sponsorship.

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `list` | List fee sponsors | - |
| `get` | Get sponsor details | `feeSponsorId` |
| `activate` | Activate sponsor | `feeSponsorId` |
| `deactivate` | Deactivate sponsor | `feeSponsorId` |
| `delete` | Delete sponsor | `feeSponsorId` |

## Response Format

All tools return consistent JSON responses:

```json
{
  "success": true,
  "summary": "Found 3 wallets",
  "data": {
    "wallets": [...]
  },
  "meta": {
    "nextSteps": ["Use wallets({ action: 'get', walletId: '...' }) for details"],
    "pagination": { "hasMore": true, "nextPageToken": "..." }
  }
}
```

Error responses:

```json
{
  "success": false,
  "summary": "Authentication failed",
  "error": {
    "message": "Invalid auth token",
    "code": "UNAUTHORIZED",
    "hint": "Check DFNS_AUTH_TOKEN is correct"
  }
}
```

## Read-Only vs Write Mode

By default, the server runs in **read-only mode**. To enable write operations (creating wallets, transferring assets, signing), provide:

- `DFNS_CRED_ID`: Your credential ID
- `DFNS_PRIVATE_KEY`: Your signing private key (PEM format)

The `init` tool will report your current capabilities:

```json
{
  "capabilities": {
    "readOperations": true,
    "writeOperations": true,
    "writeNote": "Full read/write access enabled"
  }
}
```

## Security Notes

- **Testnet Default**: The server defaults to `api.dfns.ninja` (testnet). Set `DFNS_API_URL=https://api.dfns.io` for mainnet.
- **Mainnet Warnings**: When connected to mainnet, tools will include warnings about real asset transactions.
- **Private Keys**: Store private keys securely. Never commit them to version control.

## Development

```bash
# Type checking
bun run typecheck

# Run with inspector
bun run inspect
```

## Architecture

```
packages/dfns-rest-mcp/
├── src/
│   ├── index.ts        # MCP server entry point
│   ├── config.ts       # Environment configuration
│   ├── client.ts       # DFNS SDK client singleton
│   ├── types.ts        # Response formatting utilities
│   └── tools/
│       ├── index.ts    # Tool registration
│       ├── init.ts     # Connection verification
│       ├── wallets.ts  # Wallet operations
│       ├── keys.ts     # Key management
│       ├── networks.ts # Network info
│       ├── policies.ts # Policy management
│       ├── permissions.ts
│       ├── auth.ts
│       ├── webhooks.ts
│       ├── exchanges.ts
│       ├── staking.ts
│       ├── swaps.ts
│       └── fee-sponsors.ts
└── package.json
```

## License

MIT
