# Rollback Plan: CODEMODE_DB Durable Object

## Quick Rollback (If You Don't Like It)

### Option 1: Switch Back to Main Branch (Easiest)
```bash
git checkout main
cd workers/codemode
wrangler deploy
```

This reverts to the previous worker version without the DB binding.

### Option 2: Remove DB Binding Manually

1. **Edit `workers/codemode/wrangler.toml`** - Remove these sections:
   ```toml
   # DELETE THESE LINES:
   [[durable_objects.bindings]]
   name = "CODEMODE_DB"
   class_name = "CodeModeDatabase"
   script_name = "codemode-sandbox"

   [[migrations]]
   tag = "v1"
   new_classes = ["CodeModeDatabase"]
   ```

2. **Edit `workers/codemode/src/index.ts`** - Remove:
   ```typescript
   // DELETE THIS LINE:
   export { CodeModeDatabase } from "./database";

   // In Env type, DELETE:
   CODEMODE_DB?: DurableObjectNamespace;

   // In loaderConfig section (around line 355), DELETE:
   if (env.CODEMODE_DB) {
     loaderConfig.bindings = {
       CODEMODE_DB: env.CODEMODE_DB,
     };
   }
   ```

3. **Delete the database file:**
   ```bash
   rm workers/codemode/src/database.ts
   ```

4. **Redeploy:**
   ```bash
   cd workers/codemode
   wrangler deploy
   ```

### Option 3: Deploy Previous Migration

If the DO is causing issues:

```bash
cd workers/codemode
wrangler deployments list  # Find the deployment before DO
wrangler rollback [DEPLOYMENT_ID]
```

## What Gets Removed

When you rollback:
- ✅ `helpers.db` API becomes unavailable (code will error if used)
- ✅ All session databases are deleted (24h TTL anyway)
- ✅ Worker returns to previous behavior
- ❌ Does NOT affect MCP server staging (they're independent)
- ❌ Does NOT break existing Code Mode features

## Safety Notes

- **Durable Objects are isolated** - removing the binding doesn't break other features
- **Session data is temporary** - 24h TTL means no data loss risk
- **MCP server staging still works** - they use their own databases
- **Code Mode basics unaffected** - helpers.server.invoke() still works

## Testing Before Committing

After deployment, test these scenarios:

1. **Basic Code Mode (should always work):**
   ```javascript
   const result = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_search_studies', {
     query_cond: 'cancer',
     pageSize: 10,
     jq_filter: '.'
   });
   return result;
   ```

2. **DB functionality (new feature):**
   ```javascript
   await helpers.db.createTable('test', 'id INTEGER PRIMARY KEY, name TEXT');
   await helpers.db.exec('INSERT INTO test VALUES (1, "test")');
   const rows = await helpers.db.query('SELECT * FROM test');
   return rows;
   ```

3. **MCP server staging (should be unaffected):**
   ```javascript
   const result = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_search_studies', {
     query_cond: 'Glioblastoma',
     pageSize: 1000,
     jq_filter: '.'
   });

   // If auto-staged:
   if (result.data_access_id) {
     const stats = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_query_data', {
       data_access_id: result.data_access_id,
       sql: 'SELECT COUNT(*) as count FROM studies',
       jq_filter: '.'
     });
     return stats;
   }
   ```

## When to Rollback

Consider rolling back if:
- ❌ Basic Code Mode stops working
- ❌ Performance degrades significantly
- ❌ Unexpected costs appear (check Cloudflare dashboard)
- ❌ DO causes stability issues

Keep the feature if:
- ✅ Basic tests pass
- ✅ DB operations work as expected
- ✅ No performance impact on non-DB code
- ✅ You find the cross-server data joining useful

## Current Branch

You're on: `feature/codemode-db-deployment`

To rollback:
```bash
git checkout main
cd workers/codemode
wrangler deploy
```

## Cost Monitoring

Durable Objects billing (starts Jan 7, 2026):
- Storage: Free until then, then $0.20/GB/month
- Operations: $1 per million row reads/writes
- Your 24h TTL minimizes costs

Check costs at: https://dash.cloudflare.com → Workers → codemode-sandbox → Analytics
