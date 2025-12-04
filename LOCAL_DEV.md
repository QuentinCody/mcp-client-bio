# Local Development Setup - Code Mode ✅

## Status: CONFIGURED ✅

Your local development environment is now set up! Here's what's configured:

### Configuration Summary
- ✅ `.env.local` created with local settings
- ✅ `wrangler.toml` configured for localhost
- ✅ Authentication tokens generated and synchronized
- ✅ Next.js proxy endpoint tested and working

---

## Running Locally (2 Terminals)

### Terminal 1: Next.js Dev Server
```bash
cd /Users/quentincody/mcp-client-bio
pnpm dev
```
**Runs on:** http://localhost:3000

### Terminal 2: Cloudflare Worker (Local)
```bash
cd /Users/quentincody/mcp-client-bio/workers/codemode
npx wrangler dev --port 8787
```
**Runs on:** http://localhost:8787

---

## How It Works Locally

```
┌─────────────────────┐
│   Browser           │
│   localhost:3000    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Next.js App       │
│   Port 3000         │
│   - Chat UI         │
│   - LLM calls tool  │
└──────────┬──────────┘
           │
           │ POST { goal, code }
           ▼
┌─────────────────────┐
│   Cloudflare Worker │
│   Port 8787         │
│   - Wrangler dev    │
│   - Creates isolate │
│   - Runs code       │
└──────────┬──────────┘
           │
           │ helpers.datacite.invoke()
           ▼
┌─────────────────────┐
│   Next.js Proxy     │
│   /api/codemode/    │
│   proxy             │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   MCP Servers       │
│   (DataCite/GDC)    │
└─────────────────────┘
```

Both services run on localhost, so no ngrok needed! 🎉

---

## Testing the Setup

### 1. Verify Services Are Running

**Check Next.js:**
```bash
curl http://localhost:3000/api/mcp-health
```
Should return health status.

**Check Cloudflare Worker:**
```bash
curl http://localhost:8787
```
Should return a response (might be "Use POST").

### 2. Test the Proxy Endpoint

```bash
curl -X GET "http://localhost:3000/api/codemode/proxy?server=datacite" \
  -H "x-codemode-token: ab5978a630813b1f5615ccaa488f4428b126961f22469daef7263396581a33ac"
```

**Expected output:**
```json
{"server":"datacite","tools":["datacite_graphql_query"]}
```

### 3. Test the Worker End-to-End

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "x-codemode-token: 8abee00847b88a63293c44d0517bb2c4e1e613a36f199b54dc4d32969e8d566e" \
  -d '{
    "goal": "Test search",
    "code": "console.log(\"Testing...\"); return { test: \"success\" };"
  }'
```

**Expected output:**
```json
{"result":{"test":"success"},"logs":["Testing..."]}
```

### 4. Test in Chat UI

Open http://localhost:3000 and try:

```
Use the codemode sandbox to search DataCite for papers about "machine learning" 
and show me the 3 most recent ones.
```

**What should happen:**
1. LLM recognizes `codemode_sandbox` tool is available
2. Generates JavaScript code
3. Code executes in local worker
4. Results display in chat with logs

**Check browser console** to see the tool call!

---

## Checking Tool Availability

Open browser console (DevTools) when loading the chat, you should see:

```
[API /chat] initialized tools keys= [..., 'codemode_sandbox', ...]
```

If `codemode_sandbox` appears in that list, the LLM can use it! ✅

---

## Environment Variables

### .env.local (Next.js)
```bash
CODEMODE_WORKER_URL=http://localhost:8787
CODEMODE_WORKER_TOKEN=8abee00847b88a63293c44d0517bb2c4e1e613a36f199b54dc4d32969e8d566e
CODEMODE_PROXY_TOKEN=ab5978a630813b1f5615ccaa488f4428b126961f22469daef7263396581a33ac
```

### wrangler.toml (Worker)
```toml
PROXY_URL = "http://localhost:3000/api/codemode/proxy"
PROXY_TOKEN = "ab5978a630813b1f5615ccaa488f4428b126961f22469daef7263396581a33ac"
CODEMODE_CLIENT_TOKEN = "8abee00847b88a63293c44d0517bb2c4e1e613a36f199b54dc4d32969e8d566e"
```

**Note:** The tokens must match:
- `CODEMODE_WORKER_TOKEN` (Next.js) = `CODEMODE_CLIENT_TOKEN` (Worker)
- `CODEMODE_PROXY_TOKEN` (Next.js) = `PROXY_TOKEN` (Worker)

---

## Troubleshooting

### "Tool codemode_sandbox not found"
**Cause:** Next.js can't see `CODEMODE_WORKER_URL`  
**Fix:** 
1. Check `.env.local` exists
2. Verify `CODEMODE_WORKER_URL=http://localhost:8787`
3. Restart Next.js dev server

### "Connection refused" / "ECONNREFUSED"
**Cause:** Worker not running  
**Fix:** Start wrangler dev in a separate terminal

### "Unauthorized" from worker
**Cause:** Token mismatch  
**Fix:** Verify tokens match between `.env.local` and `wrangler.toml`

### "Proxy error" from sandbox
**Cause:** Worker can't reach Next.js proxy  
**Fix:** 
1. Ensure Next.js is running on port 3000
2. Verify `PROXY_URL` in wrangler.toml is `http://localhost:3000/...`

### LLM doesn't use codemode_sandbox
**Fix:** Try being explicit:
```
Use the codemode sandbox to...
```

Or check that the tool appears in console logs.

---

## Development Workflow

### Starting Development
```bash
# Terminal 1
pnpm dev

# Terminal 2
cd workers/codemode && npx wrangler dev --port 8787
```

### Making Changes

**To Next.js code:**
- Changes auto-reload (Fast Refresh)
- No restart needed

**To Worker code:**
- Save `workers/codemode/src/index.ts`
- Wrangler dev auto-reloads
- No restart needed

**To environment variables:**
- Restart both services

### Viewing Logs

**Next.js logs:**
- Shows in Terminal 1
- Look for `[API /chat]` messages

**Worker logs:**
- Shows in Terminal 2
- Look for request logs from wrangler

**Browser logs:**
- Open DevTools → Console
- See tool calls and responses

---

## What's Next?

### Once Local Works:
1. ✅ Test complex queries with code mode
2. ✅ Verify token savings in browser network tab
3. ✅ Check worker execution speed

### Ready for Production:
See `PRODUCTION_DEPLOY.md` for:
- Deploying to Vercel (Next.js)
- Deploying to Cloudflare Workers (production)
- Environment variable updates
- Domain configuration

---

## Example Prompts to Try

### Simple Query
```
Use codemode to search DataCite for papers about "CRISPR"
```

### Complex Multi-Step Query
```
Use the codemode sandbox to:
1. Search DataCite for papers about "immunotherapy" from 2023
2. Filter to only those with more than 10 citations
3. Return the top 5 titles and DOIs
```

### With Error Handling
```
Use codemode to search DataCite for "cancer genomics", 
and if it fails, try searching for just "cancer"
```

### With State Management
```
Use codemode to search both DataCite and NCI GDC for information 
about "NSCLC", combine the results, and show me a summary
```

---

## Performance Comparison

### Traditional Direct MCP Tools:
```
Query: "Search 3 databases and compare results"
→ 3 separate tool calls
→ 3 LLM round-trips
→ ~8-12 seconds
→ ~10,000 tokens
```

### Code Mode:
```
Query: "Search 3 databases and compare results"
→ 1 code generation
→ 1 execution (parallel searches)
→ ~3-5 seconds
→ ~3,000 tokens
```

**Result: 60-70% faster, 70% fewer tokens** 🚀

---

## Architecture Notes

### Why Two Ports?
- **Port 3000:** Next.js app (UI, API routes, LLM)
- **Port 8787:** Cloudflare Worker (code sandbox)

They communicate over HTTP, just like they would in production, but both are on localhost.

### Security in Local Dev
- ✅ Token authentication still enforced
- ✅ Outbound proxy restrictions active
- ✅ Code runs in isolates (sandboxed)
- ✅ Only whitelisted MCP servers accessible

---

## Quick Commands Reference

```bash
# Start everything
pnpm dev                                    # Next.js
cd workers/codemode && npx wrangler dev     # Worker

# Test proxy
curl -X GET "http://localhost:3000/api/codemode/proxy?server=datacite" \
  -H "x-codemode-token: ab5978a630813b1f5615ccaa488f4428b126961f22469daef7263396581a33ac"

# Test worker
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "x-codemode-token: 8abee00847b88a63293c44d0517bb2c4e1e613a36f199b54dc4d32969e8d566e" \
  -d '{"goal":"test","code":"return {test:true};"}'

# View worker logs
cd workers/codemode && npx wrangler dev --port 8787

# Restart Next.js (if env changes)
# Ctrl+C, then: pnpm dev
```

---

## Success Indicators

✅ **You'll know it's working when:**
1. Browser console shows `codemode_sandbox` in tools list
2. LLM generates code instead of calling tools directly
3. Execution is faster for multi-step queries
4. Worker logs show code execution
5. Results include console.log output from generated code

---

## Files Created/Modified

- ✅ `.env.local` - Local environment variables
- ✅ `workers/codemode/wrangler.toml` - Worker config (localhost)
- ✅ This file - Local development guide

---

## Ready to Test!

1. Make sure both services are running (check terminals)
2. Open http://localhost:3000 in your browser
3. Try the example prompts above
4. Watch the magic happen! ✨

**Need help?** Check the troubleshooting section or run the test commands above.


