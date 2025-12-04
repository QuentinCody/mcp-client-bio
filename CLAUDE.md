# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bio MCP Chat is an open-source AI chatbot application built with Next.js that demonstrates advanced integration with the Model Context Protocol (MCP). It's specifically designed for biological and scientific research applications, featuring pre-configured MCP servers for accessing scientific databases like OpenTargets, NCBI, CIViC, RCSB PDB, UniProt, and others.

## Development Commands

```bash
# Development server
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint

# Run tests
pnpm test

# Database operations
pnpm db:generate    # Generate migrations from schema changes
pnpm db:migrate     # Apply migrations to database
pnpm db:push        # Push schema changes directly (development only)
pnpm db:studio      # Open Drizzle Studio for database inspection

# Diagnostics
pnpm openai:health  # Check OpenAI API access and configuration
```

## Core Architecture

### Multi-Provider AI System

The application supports multiple AI providers simultaneously through `/ai/providers.ts`:
- **OpenAI**: GPT-5, GPT-5-mini, GPT-5-nano, GPT-4o, GPT-4o-mini
- **Anthropic**: Claude Sonnet 4 (with thinking capabilities)  
- **Google**: Gemini 2.5 Pro/Flash (with thinking budget)
- **Groq**: Qwen3-32B (with reasoning middleware), Kimi K2, Llama 4
- **XAI**: Grok 3 Mini

All models use temperature: 1 and standard streaming via the Vercel AI SDK.

### Model Context Protocol (MCP) Integration

The MCP system is the core differentiator, implemented in `/lib/mcp-client.ts` and `/lib/context/mcp-context.tsx`:

- **Connection Management**: Sophisticated HTTP and SSE transport support with connection pooling
- **Client Caching**: In-memory cache with 5-minute TTL to avoid reconnecting on every request
- **Health Monitoring**: Real-time health checks with timeout handling and retry logic
- **Tool Metrics**: Performance tracking for all tool invocations (count, success rate, avg response time)
- **Pre-configured Servers**: Biological research databases in `/config/mcp-servers.json`
- **Dynamic Management**: UI for adding/removing servers in `components/mcp-server-manager.tsx`
- **Schema Sanitization**: Robust fallback schemas for provider compatibility when tool validation fails
- **MCP Prompts Support**: Full client-side support for MCP Server Prompts with slash commands

### Code Mode Integration

Code Mode enables AI models to write and execute JavaScript for complex multi-step queries via the `codemode_sandbox` tool:

- **Dynamic Helper API**: Converts all connected MCP tools into a `helpers` object (in `/lib/code-mode/dynamic-helpers.ts`)
- **Worker Execution**: Code runs in a Cloudflare Worker sandbox (configured via `CODEMODE_WORKER_URL` env var)
- **Server Extraction**: Automatically extracts server keys from MCP server configs (e.g., "clinicaltrials" from URL)
- **Tool Discovery**: Provides `helpers.serverName.listTools()` and `helpers.serverName.searchTools(query)` methods
- **Tool Invocation**: Unified `helpers.serverName.invoke(toolName, args)` interface for all MCP tools
- **Syntax Validation**: Uses Acorn parser to validate JavaScript before execution (no TypeScript allowed)
- **Documentation Generation**: Compact helper docs injected into system prompt (in `/lib/code-mode/helper-docs.ts`)

When Code Mode is active, the system prompt instructs models to write JavaScript code instead of calling MCP tools directly.

### Database Schema

Uses Drizzle ORM with PostgreSQL/Neon. Key tables in `/lib/db/schema.ts`:
- `chats`: Basic chat metadata (id, userId, title, timestamps)
- `messages`: Structured messages with JSON parts for rich content (text, tool calls, reasoning)

Message parts support:
- `text`: Regular text content
- `tool-invocation`: Function calls with arguments and results
- `reasoning`: Thinking tokens from reasoning models

### Streaming Implementation

Advanced streaming in `/app/api/chat/route.ts`:
- **Smooth Streaming**: Word-level chunking with 60fps throttling
- **Reasoning Support**: `sendReasoning: true` for thinking models
- **Performance**: Nginx buffering disabled, keep-alive connections
- **Error Handling**: Enhanced rate limit detection with provider-specific messages

### Message Processing

The `/components/message.tsx` handles complex message rendering:
- **Reasoning Display**: Expandable sections for thinking tokens with streaming support
- **Tool Invocations**: Rich display of function calls and results
- **Markdown**: Full GitHub-flavored markdown with syntax highlighting via react-markdown and remark-gfm
- **Streaming States**: Real-time updates during message generation with animated cursors

### Slash Command System

The slash command system provides VS Code-style prompts from MCP servers (in `/lib/slash/`):

- **Command Registry**: Unified registry for local and MCP-sourced slash commands (`/lib/slash/registry.ts`)
- **Fuzzy Search**: Fuse.js-powered fuzzy matching for command suggestions (`/lib/slash/fuzzy.ts`)
- **MCP Prompt Integration**: Fetches prompts from connected MCP servers and surfaces as `/mcp.<server>.<prompt>` (`/lib/slash/mcp.ts`)
- **Template Resolution**: Handles prompt templates with argument substitution (`/lib/mcp/prompts/template.ts`)
- **Prompt Context**: Builds resolved prompt context with messages and resources (`/lib/mcp/prompts/resolve.ts`)
- **UI Integration**: Keyboard-navigable dropdown in chat input (arrow keys, Enter to select, Esc to cancel)

When a user types `/` in the chat input, available prompts are fetched from all connected MCP servers, cached, and displayed for selection.

## Key Implementation Details

### Temperature Configuration
All models use `temperature: 1` for consistent behavior across providers.

### Tool Schema Handling
- **Fallback Schemas**: Automatic retry with permissive schemas on validation errors
- **Provider Compatibility**: Special handling for different provider requirements
- **Zod Integration**: Full TypeScript validation with runtime schema generation

### Conversation Management
- **History Truncation**: Smart truncation keeping context while managing tokens
- **Message Sanitization**: Removes verbose reasoning and tool results from older messages
- **Caching**: Anthropic prompt caching for tool definitions and system prompts
- **System Prompt Adaptation**: Uses shorter system prompts for simple queries, detailed prompts for complex ones
- **Complexity Detection**: Keyword-based analysis to determine query complexity (analyze, complex, detailed)

### State Management
- **React Query**: Server state with intelligent caching and invalidation (chat history, messages)
- **Local Storage**: Persistent preferences (selected model, MCP server configurations, API keys)
- **Context Providers**: Global state for MCP servers and user preferences (`/lib/context/mcp-context.tsx`)
- **User Identification**: Client-side user ID generation and persistence for chat ownership

## File Organization

### Core Application Files
- `/app/api/chat/route.ts` - Main chat API with streaming and MCP integration
- `/components/chat.tsx` - Primary chat interface with message management
- `/components/chat-sidebar.tsx` - Chat history and MCP server management
- `/lib/mcp-client.ts` - MCP client implementation with connection pooling

### Configuration
- `/ai/providers.ts` - AI model configurations and provider setup
- `/config/mcp-servers.json` - Pre-configured biological research MCP servers
- `/lib/db/schema.ts` - Database schema definitions

### UI Components
- `/components/message.tsx` - Message rendering with reasoning support
- `/components/messages.tsx` - Message list container with virtualization
- `/components/mcp-server-manager.tsx` - MCP server configuration UI
- `/components/tool-metrics.tsx` - Real-time tool performance monitoring
- `/components/chat-header.tsx` - Header with model selector and settings
- `/components/chat-sidebar.tsx` - Sidebar with chat history and server management
- `/components/textarea.tsx` - Enhanced chat input with slash command support for prompts

### Code Mode Files
- `/lib/code-mode/dynamic-helpers.ts` - Converts MCP tools to helpers object
- `/lib/code-mode/helper-docs.ts` - Generates compact documentation for system prompt
- `/lib/code-mode/schema-to-typescript.ts` - Schema conversion utilities
- `/lib/codemode/servers.ts` - Server configuration and key extraction

### Slash Command Files
- `/lib/slash/registry.ts` - Command registration and lookup
- `/lib/slash/mcp.ts` - MCP prompt command integration
- `/lib/slash/fuzzy.ts` - Fuzzy search implementation
- `/lib/slash/types.ts` - Type definitions for slash commands
- `/lib/mcp/prompts/resolve.ts` - Prompt template resolution
- `/lib/mcp/prompts/template.ts` - Template parsing and rendering

## Environment Variables

Required environment variables:
- `DATABASE_URL` - PostgreSQL/Neon connection string
- AI provider keys (optional, can also be provided via localStorage in the UI):
  - `OPENAI_API_KEY` - OpenAI API key for GPT models
  - `ANTHROPIC_API_KEY` - Anthropic API key for Claude models
  - `GOOGLE_GENERATIVE_AI_API_KEY` - Google API key for Gemini models
  - `GROQ_API_KEY` - Groq API key for Llama/Qwen models
  - `XAI_API_KEY` - XAI API key for Grok models
- `CODEMODE_WORKER_URL` - (Optional) URL to Cloudflare Worker for Code Mode execution sandbox

## Development Notes

### MCP Server Development
- Use the built-in health check system to verify server connectivity
- Tool metrics panel shows real-time performance data
- Test with pre-configured biological servers for reference implementations

### MCP Prompts Usage
- Type `/` in the chat input to trigger prompt selection
- Navigate available prompts with arrow keys, Enter to select, Esc to cancel
- Prompts are fetched from all connected MCP servers and cached
- Prompt content is automatically inserted into the chat input
- Prompts appear as `/mcp.<server>.<prompt>` (e.g., `/mcp.civic.searchVariants`)
- Template arguments are resolved and substituted before sending to the model
- Currently supported by CIViC MCP server with additional servers adding support

### Code Mode Development
- Enable by setting `CODEMODE_WORKER_URL` environment variable
- Code Mode servers are automatically merged with user-configured MCP servers
- Helper API keys are extracted from server names or URLs (normalized to lowercase alphanumeric)
- System prompt switches from tool-calling to JavaScript code generation mode
- All code is validated with Acorn parser before execution (TypeScript syntax rejected)
- Helper metadata includes tool counts and is logged for debugging

### AI Model Integration
- All providers use the same streaming interface through Vercel AI SDK
- Reasoning models (Qwen3-32B) use `extractReasoningMiddleware` with `<think>` tags
- Thinking models (Gemini, Claude) use `sendReasoning: true` option
- Provider-specific options are configured in the chat route
- API keys can be provided via environment variables or localStorage (checked in that order)

### Database Migrations
Always generate migrations after schema changes:
```bash
pnpm db:generate  # After modifying /lib/db/schema.ts
pnpm db:migrate   # Apply to database
```

### Performance Optimization
- Message history is automatically truncated to manage token usage
- MCP connections use pooling with 5-minute TTL and periodic cleanup (every 60 seconds)
- Anthropic models use prompt caching for repeated tool definitions
- Smooth streaming uses word-level chunking with 60fps throttling
- React Query caching prevents unnecessary refetches of chat history
- Bot detection with botid/server library to prevent abuse
