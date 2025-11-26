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
    "api-docs/authentication": "Authentication API",
    "api-docs/wallets": "Wallets API",
    "api-docs/keys": "Keys API",
    "api-docs/policy-engine": "Policy Engine API",
    "api-docs/permissions": "Permissions API",
    "api-docs/webhooks": "Webhooks API",
    "api-docs/networks": "Networks API",
    "api-docs/fee-sponsors": "Fee Sponsors API",
    "integrations/exchanges": "Exchange Integrations",
    "integrations/staking": "Staking",
    "integrations/swaps": "Swaps",
    "integrations": "Integrations",
    "getting-started": "Getting Started",
    "advanced-topics": "Advanced Topics",
    "guides": "Guides",
    "use-cases": "Use Cases",
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

export class DocumentIndex {
  private docs: Map<string, DocEntry> = new Map();
  private endpointIndex: Map<string, ApiEndpoint> = new Map();
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

    console.error(`Indexed ${this.docs.size} documents and ${this.endpointIndex.size} endpoints`);
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
    // Look for patterns like "POST /wallets" or "GET /wallets/{id}"
    // Common in headers or code blocks
    const regex = /(GET|POST|PUT|DELETE|PATCH)\s+(\/[a-zA-Z0-9\-\/_{}]+)/g;
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
}
