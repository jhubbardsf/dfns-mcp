# DFNS MCP Server Improvements for Gemini

This document outlines recommended improvements for the DFNS MCP server to enhance its usability for Large Language Models (LLMs) like Gemini. The goal is to make the tools more intuitive, the search more robust, and the context retrieval more precise.

## 1. Search & Indexing Improvements

The current keyword-based search is functional but can be improved to provide better context to LLMs.

### 1.1. Enhanced Snippet Extraction
**Current:** Extracts 200 characters around a keyword match. This often cuts off sentences and fails to provide enough semantic context.
**Recommendation:**
- Implement a "smart snippet" system that captures full paragraphs or logical sections (e.g., headers to next header).
- If a match occurs in a code block, capture the entire code block.
- **Benefit:** LLMs receive complete thoughts and runnable code, reducing the need for follow-up `get_doc` calls.

### 1.2. API Endpoint Indexing
**Current:** `get_api_endpoint` relies on a fuzzy search via `search_docs`.
**Recommendation:**
- specific indexing for API endpoints. Parse the `METHOD /path` pattern (e.g., `POST /wallets`) found in documentation headers during the build phase.
- Create a dedicated `Map<string, string>` for O(1) lookup of endpoints.
- **Benefit:** drastically improves accuracy for queries like "how do I call POST /wallets" or "find the create wallet endpoint".

### 1.3. Reduced Ambiguity in `get_doc`
**Current:** If multiple files match a partial path (e.g., "wallet"), it returns the first one found.
**Recommendation:**
- If multiple documents match a partial path, return a `Did you mean?` list instead of an arbitrary document.
- Allow `get_doc` to accept an exact `path` from `search_docs` results to guarantee correct retrieval.

## 2. Tooling Enhancements

### 2.1. `get_code_examples` (New Tool)
**Description:** A tool specifically designed to extract code blocks from documentation based on a query.
**Usage:** `get_code_examples(query: "create wallet ethereum")`
**Logic:**
1. Search docs for the query.
2. specific parsing to find ``` code blocks in the top results.
3. Return just the code blocks with their surrounding context (file title).
**Benefit:** LLMs often just need the syntax/boilerplate. This reduces token usage compared to fetching full docs.

### 2.2. `browse_api_structure` (New Tool)
**Description:** Returns a hierarchical tree of available API endpoints.
**Usage:** `browse_api_structure(category?: "Wallets")`
**Benefit:** Helps LLMs "explore" the API surface area to understand capabilities before searching for specifics.

### 2.3. Improve `get_blockchain_info`
**Current:** Returns hardcoded info.
**Recommendation:**
- dynamically link to the `dfns-sdk-ts/packages/lib-<chain>/README.md` content.
- Include the latest version number from `package.json` if possible.

## 3. Documentation & Context Structure

### 3.1. "System Prompts" via Resources
The current resources (`auth-quickref`, etc.) are great. We should expand this to include "System Instructions" that an LLM can ingest to understand *how* to write DFNS code.
- **Resource:** `dfns://guides/coding-conventions`
- **Content:** Best practices for error handling, async/await usage with the SDK, and common pitfalls.

### 3.2. Categorization Logic
**Current:** `determineCategory` relies on hardcoded string inclusion.
**Recommendation:**
- Move category mapping to a configuration object or simpler `switch` statement on directory names.
- Ensure every file falls into a meaningful category (reduce "General" fallback).

## 4. Implementation Plan

1.  **Refactor `DocumentIndex`:**
    -   Add `endpointIndex` for API lookups.
    -   Update `extractSnippet` to be paragraph-aware.
2.  **Update `get_doc`:**
    -   Add multi-match detection.
3.  **Implement `get_api_endpoint` optimization:**
    -   Use the new `endpointIndex`.
4.  **Create `get_code_examples` tool.**
5.  **Verify with `inspect`:**
    -   Use the MCP inspector to test the new tools with sample queries.

These improvements will make the DFNS MCP server a powerful companion for any LLM developer, ensuring faster and more accurate code generation.
