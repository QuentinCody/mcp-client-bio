"use client";

import { useState } from "react";
import { ToolInvocation } from "@/components/tool-invocation-redesign";
import { CodeExecutionDisplay } from "@/components/code-execution-display-redesign";

export default function ToolDemoPage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">
            Tool Invocation & Code Execution
          </h1>
          <p className="text-lg text-muted-foreground">
            Redesigned UI components with Laboratory Precision aesthetics
          </p>
        </div>

        {/* Tool Invocations Section */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Tool Invocations
          </h2>

          {/* Running State */}
          <ToolInvocation
            toolName="mcp__entrez__search_pubmed"
            state="call"
            args={{
              query: "CRISPR gene editing",
              retmax: 10,
              sort: "relevance",
            }}
            result={null}
            isLatestMessage={true}
            status="streaming"
          />

          {/* Success State */}
          <ToolInvocation
            toolName="mcp__civic__search_variants"
            state="output-available"
            args={{
              gene: "BRAF",
              variant: "V600E",
            }}
            result={{
              totalResults: 127,
              variants: [
                {
                  id: "12",
                  name: "V600E",
                  gene: "BRAF",
                  type: "MISSENSE",
                  clinicalSignificance: "PATHOGENIC",
                },
                {
                  id: "13",
                  name: "V600K",
                  gene: "BRAF",
                  type: "MISSENSE",
                  clinicalSignificance: "LIKELY_PATHOGENIC",
                },
              ],
            }}
            callId="call_abc123xyz"
            isLatestMessage={false}
            status="ready"
          />

          {/* Error State */}
          <ToolInvocation
            toolName="mcp__uniprot__get_protein"
            state="output-error"
            args={{
              accession: "P12345",
            }}
            result={null}
            errorText="Failed to fetch protein data: Network timeout after 30s"
            callId="call_def456uvw"
            isLatestMessage={false}
            status="ready"
          />

          {/* Waiting State */}
          <ToolInvocation
            toolName="mcp__clinicaltrials__search"
            state="approval-requested"
            args={{
              condition: "melanoma",
              status: "recruiting",
              phase: "3",
            }}
            result={null}
            isLatestMessage={true}
            status="submitted"
          />
        </section>

        {/* Code Execution Section */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Code Execution (Sandbox)
          </h2>

          {/* Running Code */}
          <CodeExecutionDisplay
            code={`const results = await helpers.entrez.invoke('search', {
  database: 'pubmed',
  query: 'cancer immunotherapy',
  retmax: 5
});

console.log('Found studies:', results.count);

return results.idlist.map(id => ({
  pubmedId: id,
  url: \`https://pubmed.ncbi.nlm.nih.gov/\${id}/\`
}));`}
            result={null}
            logs={[
              "Initializing sandbox environment...",
              "Loading MCP helpers...",
              "Executing query...",
            ]}
            state="call"
          />

          {/* Completed Code Execution */}
          <CodeExecutionDisplay
            code={`const variants = await helpers.civic.invoke('searchVariants', {
  gene: 'TP53',
  evidenceType: 'PREDICTIVE'
});

console.log(\`Found \${variants.length} TP53 variants\`);
console.log('Processing evidence items...');

const summary = variants.reduce((acc, variant) => {
  acc[variant.name] = variant.evidenceItems?.length || 0;
  return acc;
}, {});

console.log('Summary generated:', summary);

return {
  totalVariants: variants.length,
  variantSummary: summary,
  timestamp: new Date().toISOString()
};`}
            result={{
              totalVariants: 847,
              variantSummary: {
                R175H: 23,
                R248Q: 18,
                R273H: 31,
                Y220C: 12,
              },
              timestamp: "2024-01-15T10:30:45.123Z",
            }}
            logs={[
              "Found 847 TP53 variants",
              "Processing evidence items...",
              "Summary generated: { R175H: 23, R248Q: 18, R273H: 31, Y220C: 12 }",
            ]}
            executionTime={1247}
            state="output-available"
          />

          {/* Error in Code Execution */}
          <CodeExecutionDisplay
            code={`const protein = await helpers.uniprot.invoke('getProtein', {
  accession: 'INVALID_ID'
});

console.log('Protein data:', protein);

return protein.features;`}
            error="TypeError: Cannot read property 'features' of undefined\n  at line 6:8\n  at async sandbox execution"
            logs={[
              "Fetching protein with accession: INVALID_ID",
              "Warning: Invalid accession format",
              "Error: API returned 404",
            ]}
            executionTime={342}
            state="output-error"
          />
        </section>

        {/* Design Notes */}
        <section className="rounded-xl border border-border/60 bg-gradient-to-br from-violet-50/40 to-fuchsia-50/20 p-6 dark:from-violet-950/30 dark:to-fuchsia-950/10">
          <h3 className="mb-3 text-lg font-semibold">Design Philosophy</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-violet-500">•</span>
              <span>
                <strong className="text-foreground">Laboratory Precision:</strong> Inspired
                by scientific instruments with clinical clarity and refined aesthetics
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-violet-500">•</span>
              <span>
                <strong className="text-foreground">Semantic Color System:</strong> Amber
                for running, Emerald for success, Rose for errors, Violet for code
                execution
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-violet-500">•</span>
              <span>
                <strong className="text-foreground">Scannable Information:</strong> Clear
                visual hierarchy with monospace typography for technical content
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-violet-500">•</span>
              <span>
                <strong className="text-foreground">Smooth Interactions:</strong> Hover
                states, animated accents, and progressive disclosure
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-violet-500">•</span>
              <span>
                <strong className="text-foreground">Tabbed Navigation:</strong> Code
                execution displays use tabs for organized viewing of code, logs, and
                results
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
