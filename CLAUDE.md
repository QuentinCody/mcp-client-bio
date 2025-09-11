# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bio MCP Chat is an open-source AI chatbot application built with Next.js that demonstrates advanced integration with the Model Context Protocol (MCP). It's specifically designed for biological and scientific research applications, featuring pre-configured MCP servers for accessing scientific databases like OpenTargets, NCBI, CIViC, RCSB PDB, UniProt, and others.

## Development Commands

```bash
# Development server with Turbopack
pnpm dev

# Production build with Turbopack
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint

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
- **Health Monitoring**: Real-time health checks with timeout handling and retry logic
- **Tool Metrics**: Performance tracking for all tool invocations
- **Pre-configured Servers**: Biological research databases in `/config/mcp-servers.json`
- **Dynamic Management**: UI for adding/removing servers in `components/mcp-server-manager.tsx`
- **MCP Prompts Support**: Full client-side support for MCP Server Prompts with slash commands

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
- **Markdown**: Full GitHub-flavored markdown with syntax highlighting
- **Streaming States**: Real-time updates during message generation

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

### State Management
- **React Query**: Server state with intelligent caching and invalidation
- **Local Storage**: Persistent preferences and MCP server configurations
- **Context Providers**: Global state for MCP servers and user preferences

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
- `/components/mcp-server-manager.tsx` - MCP server configuration UI  
- `/components/tool-metrics.tsx` - Real-time tool performance monitoring
- `/components/prompt-selector.tsx` - MCP prompt selection dropdown with keyboard navigation
- `/components/chat-input.tsx` - Enhanced chat input with slash command support for prompts

## Environment Variables

Required environment variables (check database and AI provider documentation):
- `DATABASE_URL` - PostgreSQL/Neon connection string
- AI provider keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, etc.

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
- Currently supported by CIViC MCP server with additional servers adding support

### AI Model Integration
- All providers use the same streaming interface through Vercel AI SDK
- Reasoning models require special handling for thinking tokens
- Provider-specific options are configured in the chat route

### Database Migrations
Always generate migrations after schema changes:
```bash
pnpm db:generate  # After modifying /lib/db/schema.ts
pnpm db:migrate   # Apply to database
```

### Performance Optimization
- Message history is automatically truncated to manage token usage
- MCP connections use pooling and intelligent cleanup
- Anthropic models use prompt caching for repeated tool definitions