import { mkdir, stat, rm, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { extract } from "tar";

// ============================================================================
// Configuration
// ============================================================================

const CACHE_DIR = join(homedir(), ".cache", "dfns-mcp");
const METADATA_FILE = join(CACHE_DIR, "metadata.json");

const REPOS = {
  "dfns-api-docs": {
    owner: "dfns",
    repo: "dfns-api-docs",
    branch: "m", // DFNS uses 'm' as their default branch
  },
  "dfns-sdk-ts": {
    owner: "dfns",
    repo: "dfns-sdk-ts",
    branch: "m", // DFNS uses 'm' as their default branch
  },
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
      strip: 1, // Remove the top-level directory (e.g., dfns-api-docs-main/)
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
 */
export async function ensureDocs(forceUpdate: boolean = false): Promise<DocsPaths> {
  // Create cache directory
  await mkdir(CACHE_DIR, { recursive: true });

  const docsDir = join(CACHE_DIR, "dfns-api-docs");
  const sdkDir = join(CACHE_DIR, "dfns-sdk-ts");

  const metadata = await readMetadata();
  const now = Date.now();

  // Check if we need to update
  const docsExist = await exists(docsDir) && await exists(sdkDir);
  const needsUpdate = forceUpdate ||
    !docsExist ||
    !metadata ||
    (now - metadata.lastUpdated > UPDATE_CHECK_INTERVAL_MS);

  if (!needsUpdate && docsExist) {
    console.error("Using cached documentation");
    return { docsDir, sdkDir, fromCache: true };
  }

  // Download/update repos
  const newMetadata: CacheMetadata = {
    lastUpdated: now,
    repos: {},
  };

  for (const [name, config] of Object.entries(REPOS)) {
    const targetDir = name === "dfns-api-docs" ? docsDir : sdkDir;
    const currentSha = metadata?.repos[name]?.sha;

    // Check if there's a new version
    const latestSha = await getLatestSha(config.owner, config.repo, config.branch);

    if (!forceUpdate && latestSha && latestSha === currentSha && await exists(targetDir)) {
      console.error(`${name} is up to date (${latestSha.slice(0, 7)})`);
      newMetadata.repos[name] = metadata!.repos[name];
      continue;
    }

    // Download the repo
    await downloadAndExtractRepo(
      config.owner,
      config.repo,
      config.branch,
      targetDir
    );

    newMetadata.repos[name] = {
      sha: latestSha || "unknown",
      fetchedAt: now,
    };
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
