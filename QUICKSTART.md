# Code Mode Quick Start ⚡

## ⚠️ Current Status
Your app is **NOT using Code Mode yet**. The LLM can only call MCP tools directly.

## 🎯 What You Need to Do

### Option A: Automated Setup (Recommended)
```bash
# Run the setup script
./setup-codemode.sh

# Follow the prompts
```

### Option B: Manual Setup (5 minutes)

#### 1️⃣ Set Environment Variables
Create `.env.local` in your project root:

```bash
# Leave empty for now - fill after deploying
CODEMODE_WORKER_URL=

# Pre-generated tokens (already in wrangler.toml too)
CODEMODE_WORKER_TOKEN=8abee00847b88a63293c44d0517bb2c4e1e613a36f199b54dc4d32969e8d566e
CODEMODE_PROXY_TOKEN=ab5978a630813b1f5615ccaa488f4428b126961f22469daef7263396581a33ac
```

#### 2️⃣ Update Worker Config
Edit `workers/codemode/wrangler.toml` - change line 10:

**Before:**
```toml
PROXY_URL = "https://your-app-domain/api/codemode/proxy"
```

**After (for local testing):**
```toml
PROXY_URL = "http://localhost:3000/api/codemode/proxy"
```

**Or (for production):**
```toml
PROXY_URL = "https://your-vercel-app.vercel.app/api/codemode/proxy"
```

#### 3️⃣ Deploy Cloudflare Worker
```bash
cd workers/codemode

# Login to Cloudflare (first time only)
npx wrangler login

# Deploy
npx wrangler deploy
```

**Copy the URL from the output!** It will look like:
```
Published codemode-sandbox
  https://codemode-sandbox.YOUR-ACCOUNT.workers.dev
```

#### 4️⃣ Add Worker URL to .env.local
```bash
# Add the URL you just copied
CODEMODE_WORKER_URL=https://codemode-sandbox.YOUR-ACCOUNT.workers.dev
```

#### 5️⃣ Restart Next.js
```bash
# Stop dev server (Ctrl+C) and restart
pnpm dev
```

#### 6️⃣ Test It!
In your chat app, try:
```
Use the codemode sandbox to search DataCite for papers about "immunotherapy" 
and show me the titles of the 5 most recent ones.
```

---

## ✅ How to Know It's Working

### Before Code Mode:
```
User: Search DataCite for papers
LLM: [Calls datacite_search_works tool directly]
     [Shows results]
```

### After Code Mode:
```
User: Search DataCite for papers  
LLM: [Uses codemode_sandbox tool]
     [Writes JavaScript code]
     [Executes code in Cloudflare Worker]
     [Shows results with logs]
```

### Check the Console
Open browser DevTools → Console, you should see:
```
[API /chat] initialized tools keys= [..., 'codemode_sandbox', ...]
```

If you see `codemode_sandbox` in that list, it's working! 🎉

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| "codemode_sandbox tool not found" | Check `CODEMODE_WORKER_URL` is set in `.env.local` and restart dev server |
| "Unauthorized" from worker | Verify tokens match in `.env.local` and `wrangler.toml` |
| "Cannot connect to proxy" | If testing locally, use ngrok or deploy to Vercel first |
| LLM still uses direct tools | Try being explicit: "Use codemode sandbox to..." |

---

## 📚 More Info
- **Full guide:** See `CODEMODE_SETUP.md`
- **Architecture:** See `docs/codemode-architecture.md`
- **Anthropic article:** https://www.anthropic.com/engineering/code-execution-with-mcp
- **Cloudflare blog:** https://blog.cloudflare.com/code-mode/

---

## 💡 Local Testing Note

If you're testing locally (localhost:3000), Cloudflare Workers can't reach localhost. You have two options:

### Option 1: Use ngrok (Easiest for testing)
```bash
# In a new terminal
ngrok http 3000

# Copy the ngrok URL (e.g., https://abc123.ngrok.io)
# Use it in wrangler.toml as PROXY_URL
```

### Option 2: Deploy to Production
Deploy your Next.js app to Vercel/etc first, then use that URL in `wrangler.toml`.

---

## 🎯 Next Steps After Setup

1. **Try complex queries** - Code Mode shines with multi-step workflows
2. **Monitor usage** - Check Cloudflare dashboard for worker metrics
3. **Add more MCP servers** - Edit `app/api/codemode/proxy/route.ts`
4. **Optimize prompts** - Encourage code mode for better performance

---

## 📊 Expected Benefits

- **60-90% fewer tokens** used per complex query
- **3-5x faster** execution for multi-step workflows
- **Better error handling** - code can retry/fallback
- **State management** - cache results within execution


