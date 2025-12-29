/**
 * Shared types and response formatting utilities for DFNS REST MCP server
 */

import { DfnsError } from '@dfns/sdk';

/**
 * Standard response structure for all MCP tools
 * Provides consistent formatting with agent guidance
 */
export interface ToolResponse<T = unknown> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Human-readable summary (1 line) */
  summary: string;
  /** The actual result data */
  data?: T;
  /** Suggested follow-up actions for the agent */
  nextSteps?: string[];
  /** Risk warnings for sensitive operations */
  warnings?: string[];
  /** Pagination info for list operations */
  pagination?: {
    hasMore: boolean;
    nextPageToken?: string;
    totalCount?: number;
  };
  /** Error details when success=false */
  error?: {
    code: string;
    message: string;
    suggestion?: string;
    details?: unknown;
  };
}

/**
 * Type guard for DFNS SDK errors
 */
function isDfnsError(err: unknown): err is DfnsError {
  return (
    err !== null &&
    typeof err === 'object' &&
    'name' in err &&
    (err as { name: string }).name === 'DfnsError'
  );
}

/**
 * Format a successful response
 */
export function formatSuccess<T>(
  summary: string,
  data: T,
  options?: {
    nextSteps?: string[];
    warnings?: string[];
    pagination?: ToolResponse['pagination'];
  }
): ToolResponse<T> {
  return {
    success: true,
    summary,
    data,
    ...options,
  };
}

/**
 * Format an error response from a DFNS API error or unknown error
 */
export function formatError(
  error: unknown,
  suggestion?: string
): ToolResponse {
  if (isDfnsError(error)) {
    // Extract error details from DFNS SDK error
    const context = error.context as {
      error?: {
        id?: string;
        status?: number;
        message?: string;
        details?: unknown;
      };
    } | undefined;

    return {
      success: false,
      summary: `Error: ${error.message}`,
      error: {
        code: context?.error?.status?.toString() || 'DFNS_ERROR',
        message: error.message,
        suggestion,
        details: context?.error?.details,
      },
    };
  }

  // Handle generic errors
  const message = error instanceof Error ? error.message : String(error);

  return {
    success: false,
    summary: `Error: ${message}`,
    error: {
      code: 'UNKNOWN_ERROR',
      message,
      suggestion,
    },
  };
}

/**
 * Format response as JSON string for MCP tool output
 */
export function toMcpContent(response: ToolResponse): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

/**
 * Create a "write credentials required" error response
 */
export function writeCredentialsRequired(): ToolResponse {
  return formatError(
    new Error('Write operations require DFNS_CRED_ID and DFNS_PRIVATE_KEY'),
    'Set DFNS_CRED_ID and DFNS_PRIVATE_KEY environment variables to enable write operations'
  );
}

/**
 * Create a "missing parameter" error response
 */
export function missingParameter(
  paramName: string,
  action: string
): ToolResponse {
  return formatError(
    new Error(`Missing required parameter: ${paramName}`),
    `The "${paramName}" parameter is required for the "${action}" action`
  );
}

/**
 * Generate transfer safety warnings based on environment
 */
export function getTransferWarnings(isMainnet: boolean): string[] {
  const warnings = [
    'IRREVERSIBLE: Blockchain transfers cannot be undone',
    'VERIFY: Double-check the destination address before confirming',
  ];

  if (isMainnet) {
    warnings.push('MAINNET: This is a production transaction with real value');
  } else {
    warnings.push('TESTNET: Using test environment (no real value)');
  }

  return warnings;
}

/**
 * Summarize a list of items for the summary field
 */
export function summarizeList(
  items: unknown[],
  itemName: string,
  details?: string
): string {
  const count = items.length;
  const plural = count === 1 ? '' : 's';
  const base = `Found ${count} ${itemName}${plural}`;
  return details ? `${base} (${details})` : base;
}
