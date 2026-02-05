import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

export interface DocEntry {
  path: string;
  relativePath: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
}

// ============================================================================
// TypeScript Type Indexing
// ============================================================================

export interface TypeEntry {
  /** The type/interface/class name */
  name: string;
  /** Kind of definition: 'type', 'interface', or 'class' */
  kind: "type" | "interface" | "class";
  /** Full definition including JSDoc comments */
  definition: string;
  /** The npm package to import from (e.g., '@dfns/sdk', '@dfns/sdk-browser') */
  importPackage: string;
  /** The subpath import if needed (e.g., '@dfns/sdk/generated/wallets') */
  importPath: string;
  /** Category (wallets, auth, keys, etc.) */
  category: string;
  /** JSDoc description if available */
  description: string;
  /** Source file path */
  sourceFile: string;
}

export interface SearchResult {
  path: string;
  title: string;
  category: string;
  snippet: string;
  score: number;
}

export interface ApiEndpoint {
  method: string;
  path: string;
  docPath: string;
}

/**
 * Parse TypeScript file and extract type/interface/class definitions
 */
function parseTypeScriptTypes(content: string, filePath: string): Array<{
  name: string;
  kind: "type" | "interface" | "class";
  definition: string;
  description: string;
}> {
  const results: Array<{
    name: string;
    kind: "type" | "interface" | "class";
    definition: string;
    description: string;
  }> = [];

  // Match exported type aliases: export type Name = ...
  // This regex handles nested braces and complex union types
  const typeRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+type\s+(\w+)(?:<[^>]+>)?\s*=\s*)/g;
  let match;

  while ((match = typeRegex.exec(content)) !== null) {
    const startIndex = match.index;
    const name = match[2];
    const afterEquals = content.slice(match.index + match[0].length);

    // Find the end of the type definition (handle nested braces and semicolons)
    const endIndex = findTypeDefinitionEnd(afterEquals);
    const typeBody = afterEquals.slice(0, endIndex);

    // Extract JSDoc if present
    const jsDocMatch = content.slice(Math.max(0, startIndex - 500), startIndex).match(/\/\*\*[\s\S]*?\*\/\s*$/);
    const jsDoc = jsDocMatch ? jsDocMatch[0] : "";
    const description = extractJSDocDescription(jsDoc);

    const fullDefinition = jsDoc + match[1] + typeBody;

    results.push({
      name,
      kind: "type",
      definition: fullDefinition.trim(),
      description,
    });
  }

  // Match exported interfaces: export interface Name { ... }
  const interfaceRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+interface\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+[^{]+)?\s*\{)/g;

  while ((match = interfaceRegex.exec(content)) !== null) {
    const startIndex = match.index;
    const name = match[2];
    const afterBrace = content.slice(match.index + match[0].length);

    // Find matching closing brace
    const endIndex = findMatchingBrace(afterBrace);
    const interfaceBody = afterBrace.slice(0, endIndex);

    // Extract JSDoc if present
    const jsDocMatch = content.slice(Math.max(0, startIndex - 500), startIndex).match(/\/\*\*[\s\S]*?\*\/\s*$/);
    const jsDoc = jsDocMatch ? jsDocMatch[0] : "";
    const description = extractJSDocDescription(jsDoc);

    const fullDefinition = jsDoc + match[1] + interfaceBody + "}";

    results.push({
      name,
      kind: "interface",
      definition: fullDefinition.trim(),
      description,
    });
  }

  // Match exported classes: export class Name { ... }
  const classRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+class\s+(\w+)(?:<[^>]+>)?(?:\s+(?:extends|implements)\s+[^{]+)?\s*\{)/g;

  while ((match = classRegex.exec(content)) !== null) {
    const startIndex = match.index;
    const name = match[2];
    const afterBrace = content.slice(match.index + match[0].length);

    // Find matching closing brace
    const endIndex = findMatchingBrace(afterBrace);
    const classBody = afterBrace.slice(0, endIndex);

    // Extract JSDoc if present
    const jsDocMatch = content.slice(Math.max(0, startIndex - 500), startIndex).match(/\/\*\*[\s\S]*?\*\/\s*$/);
    const jsDoc = jsDocMatch ? jsDocMatch[0] : "";
    const description = extractJSDocDescription(jsDoc);

    const fullDefinition = jsDoc + match[1] + classBody + "}";

    results.push({
      name,
      kind: "class",
      definition: fullDefinition.trim(),
      description,
    });
  }

  return results;
}

/**
 * Find the end of a type definition (handles nested braces, arrays, unions)
 */
function findTypeDefinitionEnd(content: string): number {
  let braceCount = 0;
  let parenCount = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : "";

    // Handle string literals
    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === "{") braceCount++;
    if (char === "}") braceCount--;
    if (char === "(") parenCount++;
    if (char === ")") parenCount--;

    // Type definition ends at semicolon or newline when not inside braces/parens
    if (braceCount === 0 && parenCount === 0) {
      if (char === ";") return i + 1;
      // Also end at double newline (next export statement)
      if (char === "\n" && content[i + 1] === "\n" && content.slice(i + 2, i + 8) === "export") {
        return i;
      }
    }
  }

  return content.length;
}

/**
 * Find matching closing brace
 */
function findMatchingBrace(content: string): number {
  let braceCount = 1;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : "";

    // Handle string literals
    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === "{") braceCount++;
    if (char === "}") {
      braceCount--;
      if (braceCount === 0) return i;
    }
  }

  return content.length;
}

/**
 * Extract description from JSDoc comment
 */
function extractJSDocDescription(jsDoc: string): string {
  if (!jsDoc) return "";

  // Remove /** and */ and * prefixes
  const cleaned = jsDoc
    .replace(/^\/\*\*\s*/, "")
    .replace(/\s*\*\/$/, "")
    .split("\n")
    .map(line => line.replace(/^\s*\*\s?/, ""))
    .filter(line => !line.startsWith("@"))
    .join(" ")
    .trim();

  return cleaned;
}

/**
 * Determine package name from file path
 */
function determinePackageName(filePath: string): { importPackage: string; importPath: string } {
  // Extract package info from path like:
  // dfns-sdk-ts/packages/sdk/generated/wallets/types.ts -> @dfns/sdk, @dfns/sdk/generated/wallets
  // dfns-sdk-ts/packages/sdk-browser/signers/webauthn.ts -> @dfns/sdk-browser
  // dfns-sdk-ts/packages/lib-ethersjs6/index.ts -> @dfns/lib-ethersjs6

  const packagesMatch = filePath.match(/packages\/([^/]+)/);
  if (!packagesMatch) {
    return { importPackage: "@dfns/sdk", importPath: "@dfns/sdk" };
  }

  const packageDir = packagesMatch[1];
  const importPackage = `@dfns/${packageDir}`;

  // For generated types, include the subpath
  const afterPackage = filePath.slice(filePath.indexOf(packageDir) + packageDir.length + 1);
  if (afterPackage.startsWith("generated/")) {
    // e.g., generated/wallets/types.ts -> @dfns/sdk/generated/wallets
    const subPath = afterPackage.replace(/\/types\.ts$/, "").replace(/\/index\.ts$/, "");
    return { importPackage, importPath: `${importPackage}/${subPath}` };
  }

  // For types/ directory
  if (afterPackage.startsWith("types/")) {
    const subPath = afterPackage.replace(/\.ts$/, "");
    return { importPackage, importPath: `${importPackage}/${subPath}` };
  }

  return { importPackage, importPath: importPackage };
}

/**
 * Determine type category from file path
 */
function determineTypeCategory(filePath: string): string {
  const categoryPatterns: Record<string, string> = {
    "generated/wallets": "Wallets",
    "generated/auth": "Authentication",
    "generated/keys": "Keys",
    "generated/policies": "Policies",
    "generated/permissions": "Permissions",
    "generated/networks": "Networks",
    "generated/webhooks": "Webhooks",
    "generated/staking": "Staking",
    "generated/exchanges": "Exchanges",
    "generated/feeSponsors": "Fee Sponsors",
    "generated/signers": "Signers",
    "generated/swaps": "Swaps",
    "generated/agreements": "Agreements",
    "generated/allocations": "Allocations",
    "types/wallets": "Wallets",
    "types/auth": "Authentication",
    "sdk-browser": "Browser SDK",
    "sdk-keysigner": "Key Signer",
    "sdk-react-native": "React Native SDK",
    "lib-ethersjs": "Ethereum (ethers.js)",
    "lib-viem": "Ethereum (viem)",
    "lib-solana": "Solana",
    "lib-bitcoin": "Bitcoin",
  };

  for (const [pattern, category] of Object.entries(categoryPatterns)) {
    if (filePath.includes(pattern)) {
      return category;
    }
  }

  return "Core SDK";
}

/**
 * Extracts title from markdown content
 */
function extractTitle(content: string, filePath: string): string {
  // Try to find first h1 heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].replace(/[*_`\[\]]/g, "").trim();
  }

  // Fall back to filename
  const fileName = filePath.split("/").pop() || "";
  return fileName.replace(/\.md$/, "").replace(/-/g, " ");
}

/**
 * Extracts keywords from markdown content
 */
function extractKeywords(content: string): string[] {
  const keywords: Set<string> = new Set();

  // Extract code identifiers (camelCase, PascalCase)
  const codeMatches = content.match(/`([A-Za-z][A-Za-z0-9]*(?:[A-Z][a-z0-9]*)*)`/g);
  if (codeMatches) {
    codeMatches.forEach((m) => keywords.add(m.replace(/`/g, "").toLowerCase()));
  }

  // Extract API endpoints
  const endpointMatches = content.match(/(GET|POST|PUT|DELETE|PATCH)\s+\/[^\s\n]+/g);
  if (endpointMatches) {
    endpointMatches.forEach((m) => keywords.add(m.toLowerCase()));
  }

  // Extract headings as keywords
  const headingMatches = content.match(/^#{1,3}\s+(.+)$/gm);
  if (headingMatches) {
    headingMatches.forEach((h) => {
      const text = h.replace(/^#+\s+/, "").toLowerCase();
      keywords.add(text);
    });
  }

  return Array.from(keywords);
}

/**
 * Determines category from file path using a configuration approach
 */
function determineCategory(filePath: string): string {
  const categoryMap: Record<string, string> = {
    // API reference docs (from docs.dfns.co)
    "api-reference/auth": "Authentication API",
    "api-reference/wallets": "Wallets API",
    "api-reference/keys": "Keys API",
    "api-reference/policies": "Policy Engine API",
    "api-reference/permissions": "Permissions API",
    "api-reference/webhooks": "Webhooks API",
    "api-reference/networks": "Networks API",
    "api-reference/fee-sponsors": "Fee Sponsors API",
    "api-reference/agreements": "Agreements API",
    "api-reference/allocations": "Allocations API",
    "api-reference/broadcast": "Broadcast API",
    "api-reference/staking": "Staking API",
    "api-reference/exchanges": "Exchange Integrations",
    "api-reference/swaps": "Swaps API",
    "api-reference/sign": "Signing API",
    "api-reference/signers": "Signers API",
    // Top-level sections (from docs.dfns.co)
    "core-concepts": "Core Concepts",
    "introduction": "Getting Started",
    "advanced": "Advanced Topics",
    "networks": "Networks",
    "sdks": "SDK",
    "solutions": "Solutions",
    "features": "Features",
    "integrations": "Integrations",
    "guides": "Guides",
    // SDK package patterns (from GitHub tarball)
    "lib-": "SDK Libraries",
    "sdk-": "SDK Core",
    "examples": "SDK Examples",
  };

  for (const [key, value] of Object.entries(categoryMap)) {
    if (filePath.includes(key)) {
      return value;
    }
  }

  return "General";
}

/**
 * Recursively finds all markdown files in a directory
 */
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

/**
 * Recursively finds all TypeScript files in SDK packages
 */
async function findTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          // Skip node_modules, dist, examples, and hidden directories
          if (entry.name === "node_modules" || entry.name === "dist" ||
              entry.name === "examples" || entry.name.startsWith(".")) {
            continue;
          }
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
          // Only include type definition files and main files
          const inSignersDir = currentDir.includes("/signers/") || currentDir.endsWith("/signers");
          const inTypesDir = currentDir.includes("/types/") || currentDir.endsWith("/types");

          if (entry.name === "types.ts" || entry.name === "index.ts" ||
              entry.name === "signer.ts" || inSignersDir ||
              inTypesDir || entry.name.includes("Client")) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      // Directory might not exist
    }
  }

  await walk(dir);
  return files;
}

export class DocumentIndex {
  private docs: Map<string, DocEntry> = new Map();
  private endpointIndex: Map<string, ApiEndpoint> = new Map();
  private typeIndex: Map<string, TypeEntry> = new Map();
  private docsDir: string;
  private sdkDir: string;

  constructor(docsDir: string, sdkDir: string) {
    this.docsDir = docsDir;
    this.sdkDir = sdkDir;
  }

  async build(): Promise<void> {
    console.error("Building document index...");

    // Index documentation
    const docFiles = await findMarkdownFiles(this.docsDir);
    await this.indexFiles(docFiles, this.docsDir, "docs");

    // Index SDK READMEs and key files
    const sdkFiles = await findMarkdownFiles(this.sdkDir);
    await this.indexFiles(sdkFiles, this.sdkDir, "sdk");

    // Index TypeScript types from SDK packages
    console.error("Building TypeScript type index...");
    const packagesDir = join(this.sdkDir, "packages");
    const tsFiles = await findTypeScriptFiles(packagesDir);
    await this.indexTypeScriptFiles(tsFiles);

    console.error(`Indexed ${this.docs.size} documents, ${this.endpointIndex.size} endpoints, and ${this.typeIndex.size} types`);
  }

  /**
   * Index TypeScript files for type definitions
   */
  private async indexTypeScriptFiles(files: string[]): Promise<void> {
    for (const filePath of files) {
      try {
        const content = await readFile(filePath, "utf-8");
        const types = parseTypeScriptTypes(content, filePath);
        const { importPackage, importPath } = determinePackageName(filePath);
        const category = determineTypeCategory(filePath);

        for (const typeInfo of types) {
          const entry: TypeEntry = {
            name: typeInfo.name,
            kind: typeInfo.kind,
            definition: typeInfo.definition,
            importPackage,
            importPath,
            category,
            description: typeInfo.description,
            sourceFile: filePath,
          };

          // Use lowercase name as key for case-insensitive lookup
          this.typeIndex.set(typeInfo.name.toLowerCase(), entry);
        }
      } catch (err) {
        console.error(`Failed to index types from ${filePath}:`, err);
      }
    }
  }

  private async indexFiles(files: string[], baseDir: string, prefix: string) {
    for (const filePath of files) {
      try {
        const content = await readFile(filePath, "utf-8");
        const relativePath = relative(baseDir, filePath);
        const fullRelativePath = `${prefix}/${relativePath}`;

        const entry: DocEntry = {
          path: filePath,
          relativePath: fullRelativePath,
          title: extractTitle(content, filePath),
          content,
          category: determineCategory(filePath),
          keywords: extractKeywords(content),
        };

        this.docs.set(fullRelativePath, entry);

        // Index endpoints found in this file
        this.extractEndpoints(content, fullRelativePath);
      } catch (err) {
        console.error(`Failed to index ${filePath}:`, err);
      }
    }
  }

  private extractEndpoints(content: string, docPath: string) {
    // Look for patterns like "POST /wallets" or "get /wallets/{id}"
    // Docs from docs.dfns.co use lowercase methods (e.g., "openapi.yaml post /wallets")
    const regex = /(GET|POST|PUT|DELETE|PATCH)\s+(\/[a-zA-Z0-9\-\/_{}]+)/gi;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const [fullMatch, method, path] = match;
      const key = `${method.toUpperCase()} ${path}`;
      
      // Only index if not already present (prioritize first occurrence which is usually definition)
      if (!this.endpointIndex.has(key)) {
        this.endpointIndex.set(key, {
          method: method.toUpperCase(),
          path,
          docPath
        });
      }
    }
  }

  /**
   * Search documents by query
   */
  search(query: string, limit: number = 10): SearchResult[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

    const results: SearchResult[] = [];

    for (const doc of this.docs.values()) {
      let score = 0;
      const contentLower = doc.content.toLowerCase();
      const titleLower = doc.title.toLowerCase();

      // Exact phrase match in title is highest value
      if (titleLower.includes(queryLower)) {
        score += 100;
      }

      // Exact phrase match in content
      if (contentLower.includes(queryLower)) {
        score += 30;
      }

      // Title matches individual terms
      for (const term of queryTerms) {
        if (titleLower.includes(term)) {
          score += 15;
        }
      }

      // Keyword matches
      for (const keyword of doc.keywords) {
        // Exact phrase match in keyword
        if (keyword.includes(queryLower)) {
          score += 20;
        }
        for (const term of queryTerms) {
          if (keyword.includes(term)) {
            score += 5;
          }
        }
      }

      // Content matches - but cap it to avoid long docs dominating
      for (const term of queryTerms) {
        const regex = new RegExp(term, "gi");
        const matches = contentLower.match(regex);
        if (matches) {
          // Cap at 10 matches per term to avoid SUMMARY.md type docs
          score += Math.min(matches.length, 10);
        }
      }

      // Penalize index/summary files that match everything
      if (doc.relativePath.includes("SUMMARY") || doc.relativePath.includes("README.md")) {
        score = Math.floor(score * 0.5);
      }

      if (score > 0) {
        // Extract relevant snippet
        const snippet = this.extractSmartSnippet(doc.content, queryTerms, queryLower);

        results.push({
          path: doc.relativePath,
          title: doc.title,
          category: doc.category,
          snippet,
          score,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * "Smart" snippet extraction:
   * - Tries to return full paragraphs or code blocks
   * - Avoids cutting off sentences
   */
  private extractSmartSnippet(content: string, queryTerms: string[], fullQuery: string): string {
    const contentLower = content.toLowerCase();
    
    // Find the best match position
    let idx = contentLower.indexOf(fullQuery);
    if (idx === -1) {
      for (const term of queryTerms) {
        idx = contentLower.indexOf(term);
        if (idx !== -1) break;
      }
    }

    if (idx === -1) {
      // Fallback to start of file
      return content.slice(0, 200).replace(/\n+/g, " ").trim() + "...";
    }

    // Expand to paragraph boundaries (double newlines)
    const startSearch = Math.max(0, idx - 500);
    const endSearch = Math.min(content.length, idx + 500);
    
    const preText = content.slice(startSearch, idx);
    const postText = content.slice(idx, endSearch);

    // Find start of paragraph (last \n\n before match)
    const paraStart = preText.lastIndexOf("\n\n");
    const start = paraStart !== -1 ? startSearch + paraStart + 2 : Math.max(0, idx - 100);

    // Find end of paragraph (first \n\n after match)
    const paraEnd = postText.indexOf("\n\n");
    const end = paraEnd !== -1 ? idx + paraEnd : Math.min(content.length, idx + 200);

    // Check if we are inside a code block
    // Simple heuristic: count backticks before match
    const backticksBefore = (content.slice(0, idx).match(/```/g) || []).length;
    if (backticksBefore % 2 !== 0) {
        // We are likely inside a code block. Try to capture the whole block.
        const blockStart = content.lastIndexOf("```", idx);
        const blockEnd = content.indexOf("```", idx);
        if (blockStart !== -1 && blockEnd !== -1) {
            return content.slice(blockStart, blockEnd + 3);
        }
    }

    let snippet = content.slice(start, end).trim();
    if (start > 0) snippet = "..." + snippet;
    if (end < content.length) snippet = snippet + "...";

    return snippet;
  }

  /**
   * Get a specific document by path
   */
  getDocument(path: string): DocEntry | undefined {
    // Try exact match first
    if (this.docs.has(path)) {
      return this.docs.get(path);
    }
    return undefined;
  }

  /**
   * Find potential matches for a partial path
   */
  findDocuments(partialPath: string): DocEntry[] {
    const matches: DocEntry[] = [];
    for (const [key, doc] of this.docs) {
      if (key.includes(partialPath) || partialPath.includes(key)) {
        matches.push(doc);
      }
    }
    return matches;
  }

  /**
   * Get endpoint details directly
   */
  getEndpoint(method: string, path: string): ApiEndpoint | undefined {
    const key = `${method.toUpperCase()} ${path}`;
    return this.endpointIndex.get(key);
  }

  /**
   * Get all indexed endpoints
   */
  getAllEndpoints(): ApiEndpoint[] {
    return Array.from(this.endpointIndex.values());
  }

  /**
   * Extract code examples related to a query
   */
  getCodeExamples(query: string, limit: number = 5): Array<{ title: string; language: string; code: string }> {
    // First find relevant docs
    const docs = this.search(query, limit);
    const examples: Array<{ title: string; language: string; code: string }> = [];

    for (const res of docs) {
      const doc = this.docs.get(res.path);
      if (!doc) continue;

      // Extract code blocks
      const regex = /```(\w+)?\n([\s\S]*?)```/g;
      let match;
      while ((match = regex.exec(doc.content)) !== null) {
        const [_, language, code] = match;
        if (code.length > 20) { // Filter out tiny snippets
             examples.push({
                title: doc.title,
                language: language || "text",
                code: code.trim()
             });
        }
        if (examples.length >= limit) break;
      }
      if (examples.length >= limit) break;
    }

    return examples;
  }

  /**
   * List all documents, optionally filtered by category
   */
  listDocuments(category?: string): Array<{ path: string; title: string; category: string }> {
    const results: Array<{ path: string; title: string; category: string }> = [];

    for (const doc of this.docs.values()) {
      if (!category || doc.category.toLowerCase().includes(category.toLowerCase())) {
        results.push({
          path: doc.relativePath,
          title: doc.title,
          category: doc.category,
        });
      }
    }

    return results.sort((a, b) => a.category.localeCompare(b.category));
  }

  /**
   * Get all unique categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const doc of this.docs.values()) {
      categories.add(doc.category);
    }
    return Array.from(categories).sort();
  }

  // ============================================================================
  // Type Index Methods
  // ============================================================================

  /**
   * Get a type by exact name (case-insensitive)
   */
  getType(name: string): TypeEntry | undefined {
    return this.typeIndex.get(name.toLowerCase());
  }

  /**
   * Search types by name pattern
   */
  searchTypes(query: string, limit: number = 20): TypeEntry[] {
    const queryLower = query.toLowerCase();
    const results: Array<{ entry: TypeEntry; score: number }> = [];

    for (const entry of this.typeIndex.values()) {
      const nameLower = entry.name.toLowerCase();
      let score = 0;

      // Exact match is highest
      if (nameLower === queryLower) {
        score = 1000;
      }
      // Starts with query
      else if (nameLower.startsWith(queryLower)) {
        score = 500;
      }
      // Contains query
      else if (nameLower.includes(queryLower)) {
        score = 100;
      }
      // Word boundary match (e.g., "Wallet" matches "CreateWalletRequest")
      else {
        // Split camelCase/PascalCase into words
        const words = entry.name.split(/(?=[A-Z])/).map(w => w.toLowerCase());
        for (const word of words) {
          if (word === queryLower) {
            score = 200;
            break;
          }
          if (word.startsWith(queryLower)) {
            score = Math.max(score, 50);
          }
        }
      }

      // Also check description
      if (score === 0 && entry.description.toLowerCase().includes(queryLower)) {
        score = 25;
      }

      if (score > 0) {
        results.push({ entry, score });
      }
    }

    // Sort by score descending, then by name length (prefer shorter names)
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.entry.name.length - b.entry.name.length;
    });

    return results.slice(0, limit).map(r => r.entry);
  }

  /**
   * List all types, optionally filtered by category
   */
  listTypes(category?: string): Array<{ name: string; kind: string; category: string; importPath: string }> {
    const results: Array<{ name: string; kind: string; category: string; importPath: string }> = [];

    for (const entry of this.typeIndex.values()) {
      if (!category || entry.category.toLowerCase().includes(category.toLowerCase())) {
        results.push({
          name: entry.name,
          kind: entry.kind,
          category: entry.category,
          importPath: entry.importPath,
        });
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get all unique type categories
   */
  getTypeCategories(): string[] {
    const categories = new Set<string>();
    for (const entry of this.typeIndex.values()) {
      categories.add(entry.category);
    }
    return Array.from(categories).sort();
  }

  /**
   * Get total type count
   */
  getTypeCount(): number {
    return this.typeIndex.size;
  }
}
