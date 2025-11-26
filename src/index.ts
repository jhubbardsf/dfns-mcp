#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join } from "node:path";
import { DocumentIndex } from "./indexer.js";

// Paths to documentation (relative to this file's location)
const BASE_DIR = join(import.meta.dirname, "..");
const DOCS_DIR = join(BASE_DIR, "dfns-api-docs");
const SDK_DIR = join(BASE_DIR, "dfns-sdk-ts");

// Supported blockchains with their SDK packages
const SUPPORTED_BLOCKCHAINS = {
  algorand: { package: "lib-algorand", networks: ["Algorand", "AlgorandTestnet"] },
  aptos: { package: "lib-aptos", networks: ["Aptos", "AptosTestnet"] },
  bitcoin: { package: "lib-bitcoinjs", networks: ["Bitcoin", "BitcoinTestnet3"] },
  cardano: { package: "lib-meshsdk", networks: ["Cardano", "CardanoPreprod"] },
  cosmos: { package: "lib-cosmjs", networks: ["Various Cosmos appchains"] },
  ethereum: { package: "lib-ethersjs6", networks: ["Ethereum", "EthereumSepolia", "Polygon", "Arbitrum", "Base", "Optimism", "BSC", "Avalanche"] },
  hedera: { package: "lib-hedera", networks: ["Hedera", "HederaTestnet"] },
  iota: { package: "lib-iota", networks: ["IOTA", "IOTATestnet"] },
  kaspa: { package: "lib-kaspa", networks: ["Kaspa", "KaspaTestnet"] },
  near: { package: "lib-near", networks: ["NEAR", "NEARTestnet"] },
  polkadot: { package: "lib-polkadot", networks: ["Polkadot", "Westend"] },
  polymesh: { package: "lib-polymesh", networks: ["Polymesh", "PolymeshTestnet"] },
  solana: { package: "lib-solana", networks: ["Solana", "SolanaDevnet"] },
  stellar: { package: "lib-stellar", networks: ["Stellar", "StellarTestnet"] },
  sui: { package: "lib-sui", networks: ["Sui", "SuiTestnet"] },
  tezos: { package: "lib-taquito", networks: ["Tezos", "TezosGhostnet"] },
  ton: { package: "lib-ton", networks: ["TON", "TONTestnet"] },
  tron: { package: "lib-tron", networks: ["Tron", "TronNile"] },
  vechain: { package: "lib-vechain", networks: ["VeChain", "VeChainTestnet"] },
  viem: { package: "lib-viem", networks: ["All EVM chains (alternative to ethers)"] },
  xrp: { package: "lib-xrpl", networks: ["XRPLedger", "XRPLedgerTestnet"] },
};

// Initialize the document index
const docIndex = new DocumentIndex(DOCS_DIR, SDK_DIR);

// Create the MCP server
const server = new McpServer({
  name: "dfns-docs",
  version: "1.1.0",
});

// ============================================================================
// TOOLS
// ============================================================================

// Tool: Search documentation
server.tool(
  "search_docs",
  "Search across all DFNS documentation and SDK files. Returns relevant matches with snippets.",
  {
    query: z.string().describe("Search query (e.g., 'create wallet', 'authentication', 'ethereum signing')"),
    limit: z.number().optional().default(10).describe("Maximum number of results to return"),
  },
  async ({ query, limit }) => {
    const results = docIndex.search(query, limit);

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No results found for "${query}". Try different keywords or browse categories with list_docs.`,
          },
        ],
      };
    }

    const formatted = results
      .map(
        (r, i) =>
          `${i + 1}. **${r.title}** [${r.category}]\n   Path: ${r.path}\n   ${r.snippet}`
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} results for "${query}":\n\n${formatted}`,
        },
      ],
    };
  }
);

// Tool: Get specific document
server.tool(
  "get_doc",
  "Retrieve the full content of a specific documentation file. Use search_docs first to find the right path.",
  {
    path: z.string().describe("Document path (e.g., 'docs/api-docs/wallets/create-wallet/README.md' or partial match like 'create-wallet')"),
  },
  async ({ path }) => {
    // 1. Try exact match
    const exactDoc = docIndex.getDocument(path);
    if (exactDoc) {
      return {
        content: [
          {
            type: "text",
            text: `# ${exactDoc.title}\n**Path:** ${exactDoc.relativePath}\n**Category:** ${exactDoc.category}\n\n---\n\n${exactDoc.content}`,
          },
        ],
      };
    }

    // 2. Try fuzzy match
    const candidates = docIndex.findDocuments(path);
    
    if (candidates.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Document not found: ${path}\n\nUse search_docs or list_docs to find available documents.`,
          },
        ],
      };
    }

    if (candidates.length === 1) {
      const doc = candidates[0];
      return {
        content: [
          {
            type: "text",
            text: `# ${doc.title}\n**Path:** ${doc.relativePath}\n**Category:** ${doc.category}\n\n---\n\n${doc.content}`,
          },
        ],
      };
    }

    // 3. Ambiguous match
    const list = candidates.map((d) => `- ${d.title} (Path: ${d.relativePath})`).join("\n");
    return {
      content: [
        {
          type: "text",
          text: `Multiple documents found for "${path}". Did you mean?\n\n${list}\n\nPlease use the full path to retrieve the document.`,
        },
      ],
    };
  }
);

// Tool: Get code examples
server.tool(
  "get_code_examples",
  "Extract code blocks/examples from documentation based on a query. useful for getting syntax quickly.",
  {
    query: z.string().describe("Query to find examples for (e.g. 'create wallet', 'sign transaction')"),
    limit: z.number().optional().default(3).describe("Max number of examples to return"),
  },
  async ({ query, limit }) => {
    const examples = docIndex.getCodeExamples(query, limit);

    if (examples.length === 0) {
      return {
        content: [{ type: "text", text: `No code examples found for "${query}".` }],
      };
    }

    let output = `Found ${examples.length} code examples for "${query}":\n\n`;
    
    examples.forEach((ex, i) => {
      output += `### Example ${i + 1}: ${ex.title}\n`;
      output += `\`\`\`${ex.language}\n${ex.code}\n\`\`\`\n\n`;
    });

    return {
      content: [{ type: "text", text: output }],
    };
  }
);

// Tool: Browse API structure
server.tool(
  "browse_api_structure",
  "Returns a hierarchical tree of available API endpoints to help explore capabilities.",
  {
    category: z.string().optional().describe("Filter by category (e.g. 'Wallets')"),
  },
  async ({ category }) => {
    const endpoints = docIndex.getAllEndpoints();
    
    // Group by Doc Path (which usually corresponds to a resource group)
    const grouped: Record<string, string[]> = {};
    
    for (const ep of endpoints) {
        // Simplify doc path to a group name
        // e.g. docs/api-docs/wallets/create-wallet/README.md -> Wallets
        const parts = ep.docPath.split('/');
        let group = "General";
        if (parts.includes('api-docs')) {
            const idx = parts.indexOf('api-docs');
            if (parts[idx+1]) group = parts[idx+1].charAt(0).toUpperCase() + parts[idx+1].slice(1);
        }
        
        if (category && !group.toLowerCase().includes(category.toLowerCase())) continue;

        if (!grouped[group]) grouped[group] = [];
        grouped[group].push(`${ep.method} ${ep.path}`);
    }

    if (Object.keys(grouped).length === 0) {
        return { content: [{ type: "text", text: "No endpoints found." }] };
    }

    let output = "# API Structure\n\n";
    for (const [group, eps] of Object.entries(grouped)) {
        output += `## ${group}\n`;
        for (const ep of eps.sort()) {
            output += `- ${ep}\n`;
        }
        output += "\n";
    }

    return { content: [{ type: "text", text: output }] };
  }
);

// Tool: List documents by category
server.tool(
  "list_docs",
  "List all available documentation files, optionally filtered by category.",
  {
    category: z.string().optional().describe("Filter by category (e.g., 'Wallets API', 'Authentication', 'SDK')"),
  },
  async ({ category }) => {
    const docs = docIndex.listDocuments(category);

    if (docs.length === 0) {
      const categories = docIndex.getCategories();
      return {
        content: [
          {
            type: "text",
            text: `No documents found${category ? ` for category "${category}"` : ""}.\n\nAvailable categories:\n${categories.map((c) => `- ${c}`).join("\n")}`,
          },
        ],
      };
    }

    // Group by category
    const grouped: Record<string, typeof docs> = {};
    for (const doc of docs) {
      if (!grouped[doc.category]) {
        grouped[doc.category] = [];
      }
      grouped[doc.category].push(doc);
    }

    let output = `Found ${docs.length} documents${category ? ` in "${category}"` : ""}:\n\n`;

    for (const [cat, catDocs] of Object.entries(grouped)) {
      output += `## ${cat}\n`;
      for (const doc of catDocs) {
        output += `- ${doc.title} (${doc.path})\n`;
      }
      output += "\n";
    }

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  }
);

// Tool: Get blockchain/SDK info
server.tool(
  "get_blockchain_info",
  "Get information about DFNS SDK support for a specific blockchain, including package name and supported networks.",
  {
    blockchain: z.string().describe("Blockchain name (e.g., 'ethereum', 'solana', 'bitcoin')"),
  },
  async ({ blockchain }) => {
    const key = blockchain.toLowerCase();
    const info = SUPPORTED_BLOCKCHAINS[key as keyof typeof SUPPORTED_BLOCKCHAINS];

    if (!info) {
      const available = Object.keys(SUPPORTED_BLOCKCHAINS).join(", ");
      return {
        content: [
          {
            type: "text",
            text: `Unknown blockchain: ${blockchain}\n\nSupported blockchains: ${available}`,
          },
        ],
      };
    }

    // Try to get the README for this package
    const readmePath = `sdk/packages/${info.package}/README.md`;
    const doc = docIndex.getDocument(readmePath);

    let output = `# ${blockchain.charAt(0).toUpperCase() + blockchain.slice(1)} SDK Support\n\n`;
    output += `**Package:** @dfns/${info.package}\n`;
    output += `**Supported Networks:** ${info.networks.join(", ")}\n\n`;

    if (doc) {
      output += `## Package Documentation\n\n${doc.content}`;
    } else {
      output += `Use \`npm install @dfns/${info.package}\` to add this integration.\n`;
      output += `\nSearch for "${blockchain}" to find relevant documentation and examples.`;
    }

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  }
);

// Tool: List supported blockchains
server.tool(
  "list_blockchains",
  "List all blockchains supported by the DFNS SDK with their package names.",
  {},
  async () => {
    let output = "# Supported Blockchains\n\n";
    output += "| Blockchain | Package | Networks |\n";
    output += "|------------|---------|----------|\n";

    for (const [name, info] of Object.entries(SUPPORTED_BLOCKCHAINS)) {
      output += `| ${name} | @dfns/${info.package} | ${info.networks.slice(0, 2).join(", ")}${info.networks.length > 2 ? "..." : ""} |\n`;
    }

    output += "\n\nUse `get_blockchain_info` to get detailed information about a specific blockchain.";

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  }
);

// Tool: Get API endpoint details
server.tool(
  "get_api_endpoint",
  "Get documentation for a specific DFNS API endpoint by name or HTTP method/path.",
  {
    endpoint: z.string().describe("Endpoint identifier (e.g., 'create wallet', 'POST /wallets', 'listUsers')"),
  },
  async ({ endpoint }) => {
    // 1. Try exact endpoint match first (Optimized)
    const parts = endpoint.split(' ');
    if (parts.length === 2 && ['POST', 'GET', 'PUT', 'DELETE', 'PATCH'].includes(parts[0].toUpperCase())) {
        const exact = docIndex.getEndpoint(parts[0], parts[1]);
        if (exact) {
             const doc = docIndex.getDocument(exact.docPath);
             if (doc) {
                 return { content: [{ type: "text", text: doc.content }] };
             }
        }
    }

    // 2. Fallback to search
    const results = docIndex.search(endpoint, 5);

    // Filter to API docs
    const apiResults = results.filter(
      (r) =>
        r.category.includes("API") ||
        r.path.includes("api-docs") ||
        r.path.includes("api-reference")
    );

    if (apiResults.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No API documentation found for "${endpoint}".\n\nTry:\n- search_docs with different terms\n- browse_api_structure to see available endpoints`,
          },
        ],
      };
    }

    // Get the top match's full content
    const topMatch = apiResults[0];
    const doc = docIndex.getDocument(topMatch.path);

    if (!doc) {
      return {
        content: [
          {
            type: "text",
            text: `Found match but couldn't load content: ${topMatch.path}`,
          },
        ],
      };
    }

    let output = doc.content;

    // If there are other relevant results, mention them
    if (apiResults.length > 1) {
      output += "\n\n---\n## Related Endpoints\n";
      for (let i = 1; i < apiResults.length; i++) {
        output += `- ${apiResults[i].title} (${apiResults[i].path})\n`;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  }
);

// ============================================================================
// RESOURCES
// ============================================================================

// Resource: Quick reference for authentication
server.resource(
  "auth-quickref",
  "dfns://quickref/authentication",
  async () => {
    return {
      contents: [
        {
          uri: "dfns://quickref/authentication",
          mimeType: "text/markdown",
          text: `# DFNS Authentication Quick Reference

## Authentication Types

### 1. Service Account (Server-side)
- Long-lived tokens for backend services
- Uses \`AsymmetricKeySigner\` with private key
- Best for: Backend services, automated operations

\`\`\`typescript
import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'

const signer = new AsymmetricKeySigner({
  credId: 'your-credential-id',
  privateKey: process.env.DFNS_PRIVATE_KEY!,
})

const dfns = new DfnsApiClient({
  baseUrl: 'https://api.dfns.io',
  orgId: 'your-org-id',
  authToken: 'your-service-account-token',
  signer,
})
\`\`\`

### 2. Personal Access Token (PAT)
- Long-lived tokens for individual users
- Also uses \`AsymmetricKeySigner\`
- Best for: Development, testing, personal automation

### 3. User Login Token (Browser)
- Short-lived tokens from user login
- Uses \`WebAuthnSigner\` for passkey auth
- Best for: Web applications, user-facing apps

\`\`\`typescript
import { WebAuthnSigner } from '@dfns/sdk-browser'

const signer = new WebAuthnSigner({
  relyingParty: { id: 'yourdomain.com', name: 'Your App' }
})
\`\`\`

### 4. Delegated Authentication
- Server initiates, user signs
- Uses \`DfnsDelegatedApiClient\`
- Best for: Apps where server makes requests but user approves

## Key Concepts

- **Credentials**: Cryptographic keys (WebAuthn or asymmetric) registered with DFNS
- **User Action Signing**: All state-changing requests require cryptographic signature
- **Challenge-Response**: DFNS issues challenge, credential signs it, request proceeds
`,
        },
      ],
    };
  }
);

// Resource: SDK setup guide
server.resource(
  "sdk-setup",
  "dfns://quickref/sdk-setup",
  async () => {
    return {
      contents: [
        {
          uri: "dfns://quickref/sdk-setup",
          mimeType: "text/markdown",
          text: `# DFNS SDK Setup Guide

## Core Packages

\`\`\`bash
# Core SDK (required)
npm install @dfns/sdk

# For server-side key signing
npm install @dfns/sdk-keysigner

# For browser WebAuthn
npm install @dfns/sdk-browser

# For React Native
npm install @dfns/sdk-react-native
\`\`\`

## Blockchain-Specific Libraries

\`\`\`bash
# Ethereum/EVM (choose one)
npm install @dfns/lib-ethersjs6  # ethers.js v6
npm install @dfns/lib-ethersjs5  # ethers.js v5
npm install @dfns/lib-viem       # viem

# Other chains
npm install @dfns/lib-solana     # Solana
npm install @dfns/lib-bitcoinjs  # Bitcoin
npm install @dfns/lib-near       # NEAR
npm install @dfns/lib-aptos      # Aptos
npm install @dfns/lib-sui        # Sui
# ... and many more
\`\`\`

## Basic Setup Pattern

\`\`\`typescript
import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'

// 1. Create signer
const signer = new AsymmetricKeySigner({
  credId: process.env.DFNS_CRED_ID!,
  privateKey: process.env.DFNS_PRIVATE_KEY!,
})

// 2. Create client
const dfns = new DfnsApiClient({
  baseUrl: 'https://api.dfns.io',
  orgId: process.env.DFNS_ORG_ID!,
  authToken: process.env.DFNS_AUTH_TOKEN!,
  signer,
})

// 3. Use the API
const wallet = await dfns.wallets.createWallet({
  body: { network: 'EthereumSepolia' }
})
\`\`\`

## Environment Variables

\`\`\`bash
DFNS_API_URL=https://api.dfns.io
DFNS_ORG_ID=or-xxxxx-xxxxx-xxxxx
DFNS_AUTH_TOKEN=eyJ...
DFNS_CRED_ID=cr-xxxxx-xxxxx-xxxxx
DFNS_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----..."
\`\`\`
`,
        },
      ],
    };
  }
);

// Resource: Supported networks
server.resource(
  "networks",
  "dfns://quickref/networks",
  async () => {
    let networksText = "# DFNS Supported Networks\n\n";

    for (const [chain, info] of Object.entries(SUPPORTED_BLOCKCHAINS)) {
      networksText += `## ${chain.charAt(0).toUpperCase() + chain.slice(1)}\n`;
      networksText += `- Package: \`@dfns/${info.package}\`\n`;
      networksText += `- Networks: ${info.networks.join(", ")}\n\n`;
    }

    return {
      contents: [
        {
          uri: "dfns://quickref/networks",
          mimeType: "text/markdown",
          text: networksText,
        },
      ],
    };
  }
);

// Resource: Coding Conventions
server.resource(
  "coding-conventions",
  "dfns://guides/coding-conventions",
  async () => {
    return {
      contents: [
        {
          uri: "dfns://guides/coding-conventions",
          mimeType: "text/markdown",
          text: `# DFNS Coding Conventions & Best Practices

## Error Handling

Always wrap API calls in try-catch blocks. DFNS errors typically follow a structure that includes a context request ID.

\`\`\`typescript
try {
  await dfns.wallets.createWallet({ ... });
} catch (error: any) {
  if (error.context?.requestId) {
    console.error(\`Request failed with ID: \${error.context.requestId}\`);
  }
  console.error(error.message);
}
\`\`\`

## Async/Await

All SDK methods are asynchronous. Ensure you await them properly.

## Types

Use the types exported by the SDK to ensure type safety.

\`\`\`typescript
import { CreateWalletRequest } from '@dfns/sdk/types/wallets';

const request: CreateWalletRequest = {
  body: { network: 'EthereumSepolia' }
};
\`\`\`
`
        }
      ]
    };
  }
);


// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Build the document index before starting server
  await docIndex.build();

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("DFNS MCP Server running");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
