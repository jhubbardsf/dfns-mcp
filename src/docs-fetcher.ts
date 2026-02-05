import { mkdir, stat, rm, readFile, writeFile, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { extract } from "tar";

// ============================================================================
// Configuration
// ============================================================================

const CACHE_DIR = join(homedir(), ".cache", "dfns-mcp");
const METADATA_FILE = join(CACHE_DIR, "metadata.json");

/** URL for the concatenated documentation file from docs.dfns.co */
const DOCS_SOURCE_URL = "https://docs.dfns.co/llms-full.txt";

/** GitHub config for the SDK repo (still available) */
const SDK_REPO = {
  owner: "dfns",
  repo: "dfns-sdk-ts",
  branch: "m", // DFNS uses 'm' as their default branch
};

// How often to check for updates (24 hours)
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface CacheMetadata {
  lastUpdated: number;
  repos: {
    [key: string]: {
      sha: string;
      fetchedAt: number;
    };
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readMetadata(): Promise<CacheMetadata | null> {
  try {
    const content = await readFile(METADATA_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeMetadata(metadata: CacheMetadata): Promise<void> {
  await writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2));
}

/**
 * Fetch the latest commit SHA for a branch
 */
async function getLatestSha(owner: string, repo: string, branch: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`,
      {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "dfns-mcp",
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch SHA: ${response.status}`);
      return null;
    }

    const data = await response.json() as { sha: string };
    return data.sha;
  } catch (err) {
    console.error(`Error fetching SHA:`, err);
    return null;
  }
}

// ============================================================================
// Documentation Fetching (from docs.dfns.co)
// ============================================================================

interface ParsedDocument {
  title: string;
  sourceUrl: string;
  content: string;
}

/**
 * Parse the concatenated llms-full.txt into individual documents.
 * Format: each document starts with "# Title\nSource: URL\n\nContent..."
 */
function parseDocuments(fullText: string): ParsedDocument[] {
  const documents: ParsedDocument[] = [];

  // Split on h1 headings that are followed by a Source: line
  const sections = fullText.split(/\n(?=# [^\n]+\nSource: )/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    // Extract title (first line starting with "# ")
    const titleMatch = trimmed.match(/^# (.+)$/m);
    if (!titleMatch) continue;

    // Extract Source URL
    const sourceMatch = trimmed.match(/^Source:\s*(https:\/\/[^\s]+)$/m);
    if (!sourceMatch) continue;

    const title = titleMatch[1].trim();
    const sourceUrl = sourceMatch[1].trim();

    // Content is everything after the Source: line
    const sourceLineEnd = trimmed.indexOf(sourceMatch[0]) + sourceMatch[0].length;
    const content = trimmed.slice(sourceLineEnd).trim();

    documents.push({ title, sourceUrl, content });
  }

  return documents;
}

/**
 * Download llms-full.txt from docs.dfns.co, split into individual markdown
 * files, and save to the cache directory.
 * Returns a SHA-256 content hash for cache invalidation.
 */
async function downloadAndSplitDocs(targetDir: string): Promise<string> {
  console.error("Downloading documentation from docs.dfns.co...");

  const response = await fetch(DOCS_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download docs: ${response.status} ${response.statusText}`);
  }

  const fullText = await response.text();

  // Compute content hash for cache invalidation
  const contentHash = createHash("sha256").update(fullText).digest("hex");

  // Split into individual documents
  const documents = parseDocuments(fullText);

  if (documents.length === 0) {
    throw new Error("No documents parsed from llms-full.txt — format may have changed");
  }

  // Write to temp directory, then atomic swap
  const tempDir = join(CACHE_DIR, `docs-temp-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  for (const doc of documents) {
    // Derive file path from Source URL
    // e.g. https://docs.dfns.co/api-reference/wallets/create-wallet -> api-reference/wallets/create-wallet.md
    let urlPath = doc.sourceUrl
      .replace("https://docs.dfns.co/", "")
      .replace(/\.md$/, ""); // Remove .md if present in URL

    const filePath = join(tempDir, `${urlPath}.md`);

    // Create parent directories
    await mkdir(dirname(filePath), { recursive: true });

    // Write the document with title as h1
    const fileContent = `# ${doc.title}\n\n${doc.content}`;
    await writeFile(filePath, fileContent);
  }

  // Atomic swap: remove old, rename temp
  if (await exists(targetDir)) {
    await rm(targetDir, { recursive: true });
  }
  await rename(tempDir, targetDir);

  console.error(`Split ${documents.length} documents to ${targetDir}`);
  return contentHash;
}

// ============================================================================
// SDK Fetching (from GitHub)
// ============================================================================

/**
 * Download and extract a GitHub repository tarball
 */
async function downloadAndExtractRepo(
  owner: string,
  repo: string,
  branch: string,
  targetDir: string
): Promise<void> {
  const url = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.tar.gz`;
  const tempDir = join(CACHE_DIR, `${repo}-temp-${Date.now()}`);

  console.error(`Downloading ${owner}/${repo}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  // Create temp directory
  await mkdir(tempDir, { recursive: true });

  // Extract the tarball
  const body = response.body;
  if (!body) {
    throw new Error("No response body");
  }

  // Convert web stream to Node stream and extract
  const nodeStream = Readable.fromWeb(body as any);

  await pipeline(
    nodeStream,
    createGunzip(),
    extract({
      cwd: tempDir,
      strip: 1, // Remove the top-level directory (e.g., dfns-sdk-ts-m/)
    })
  );

  // Remove old target if exists
  if (await exists(targetDir)) {
    await rm(targetDir, { recursive: true });
  }

  // Rename temp to target
  await rename(tempDir, targetDir);

  console.error(`Extracted to ${targetDir}`);
}

// ============================================================================
// Public API
// ============================================================================

export interface DocsPaths {
  docsDir: string;
  sdkDir: string;
  fromCache: boolean;
}

/**
 * Ensure docs are available, downloading if necessary.
 * Returns paths to the docs and SDK directories.
 *
 * Fetches documentation from two sources:
 * - API docs: docs.dfns.co/llms-full.txt (split into individual files)
 * - SDK types: GitHub tarball of dfns/dfns-sdk-ts
 *
 * Each source is fetched independently with graceful degradation —
 * if a fetch fails but cached data exists, the server continues with stale data.
 */
export async function ensureDocs(forceUpdate: boolean = false): Promise<DocsPaths> {
  // Create cache directory
  await mkdir(CACHE_DIR, { recursive: true });

  const docsDir = join(CACHE_DIR, "dfns-api-docs");
  const sdkDir = join(CACHE_DIR, "dfns-sdk-ts");

  const metadata = await readMetadata();
  const now = Date.now();

  // Check if we need to update
  const docsExist = await exists(docsDir);
  const sdkExist = await exists(sdkDir);
  const needsUpdate = forceUpdate ||
    !docsExist || !sdkExist ||
    !metadata ||
    (now - metadata.lastUpdated > UPDATE_CHECK_INTERVAL_MS);

  if (!needsUpdate && docsExist && sdkExist) {
    console.error("Using cached documentation");
    return { docsDir, sdkDir, fromCache: true };
  }

  const newMetadata: CacheMetadata = {
    lastUpdated: now,
    repos: {},
  };

  // --- Fetch docs from docs.dfns.co ---
  try {
    const currentDocsHash = metadata?.repos["dfns-api-docs"]?.sha;

    if (!forceUpdate && docsExist && currentDocsHash) {
      // Within update interval and cache exists — skip
      newMetadata.repos["dfns-api-docs"] = metadata!.repos["dfns-api-docs"];
      console.error("docs are cached, skipping download");
    } else {
      const contentHash = await downloadAndSplitDocs(docsDir);
      newMetadata.repos["dfns-api-docs"] = {
        sha: contentHash,
        fetchedAt: now,
      };
    }
  } catch (err) {
    console.error("Failed to fetch docs from docs.dfns.co:", err);
    if (docsExist && metadata?.repos["dfns-api-docs"]) {
      console.error("Using stale cached docs as fallback");
      newMetadata.repos["dfns-api-docs"] = metadata.repos["dfns-api-docs"];
    }
    // Don't throw — graceful degradation
  }

  // --- Fetch SDK from GitHub ---
  try {
    const currentSha = metadata?.repos["dfns-sdk-ts"]?.sha;
    const latestSha = await getLatestSha(SDK_REPO.owner, SDK_REPO.repo, SDK_REPO.branch);

    if (!forceUpdate && latestSha && latestSha === currentSha && sdkExist) {
      console.error(`dfns-sdk-ts is up to date (${latestSha.slice(0, 7)})`);
      newMetadata.repos["dfns-sdk-ts"] = metadata!.repos["dfns-sdk-ts"];
    } else {
      await downloadAndExtractRepo(
        SDK_REPO.owner, SDK_REPO.repo, SDK_REPO.branch, sdkDir
      );
      newMetadata.repos["dfns-sdk-ts"] = {
        sha: latestSha || "unknown",
        fetchedAt: now,
      };
    }
  } catch (err) {
    console.error("Failed to fetch SDK from GitHub:", err);
    if (sdkExist && metadata?.repos["dfns-sdk-ts"]) {
      console.error("Using stale cached SDK as fallback");
      newMetadata.repos["dfns-sdk-ts"] = metadata.repos["dfns-sdk-ts"];
    }
    // Don't throw — graceful degradation
  }

  // Save metadata
  await writeMetadata(newMetadata);

  return { docsDir, sdkDir, fromCache: false };
}

/**
 * Force update all docs
 */
export async function updateDocs(): Promise<{ success: boolean; message: string }> {
  try {
    const result = await ensureDocs(true);
    return {
      success: true,
      message: `Documentation updated successfully. Docs at: ${result.docsDir}`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to update documentation: ${err}`,
    };
  }
}

/**
 * Get the cache directory path
 */
export function getCacheDir(): string {
  return CACHE_DIR;
}

/**
 * Get cached metadata
 */
export async function getCacheInfo(): Promise<{
  cacheDir: string;
  metadata: CacheMetadata | null;
  docsExist: boolean;
  sdkExist: boolean;
}> {
  const metadata = await readMetadata();
  return {
    cacheDir: CACHE_DIR,
    metadata,
    docsExist: await exists(join(CACHE_DIR, "dfns-api-docs")),
    sdkExist: await exists(join(CACHE_DIR, "dfns-sdk-ts")),
  };
}
