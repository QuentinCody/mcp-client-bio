import type { SlashPromptDef } from "@/lib/mcp/prompts/types";

export const clientPromptDefs: SlashPromptDef[] = [
  {
    id: "client/rapid-triage",
    trigger: "client.rapid-triage",
    namespace: "client",
    name: "rapid-triage",
    title: "Rapid Issue Triage",
    description: "Summarise the task, identify blockers, and point to the next tools or servers to use.",
    origin: "client-prompt",
    mode: "client",
    template: {
      messages: [
        {
          role: "system",
          text: "You are a senior operator coordinating multiple MCP servers and tools. Analyse the session context and rapidly triage the primary goal, risks, and information gaps before taking action. Prioritise tool usage that accelerates resolution.",
        },
        {
          role: "user",
          text: "Provide a concise triage summary: (1) goal and current inputs, (2) recommended MCP servers or tools to invoke next (with rationale), (3) immediate clarification questions for the user, and (4) the first concrete action you will take now.",
        },
      ],
    },
  },
  {
    id: "client/multi-tool-plan",
    trigger: "client.multi-tool-plan",
    namespace: "client",
    name: "multi-tool-plan",
    title: "Multi-Tool Execution Plan",
    description: "Lay out a coordinated plan across several MCP servers or tools, with sequencing and expected outputs.",
    origin: "client-prompt",
    mode: "client",
    template: {
      messages: [
        {
          role: "system",
          text: "Act as an orchestration strategist. Design a minimal yet effective sequence that coordinates available MCP servers and tools to hit the objective efficiently.",
        },
        {
          role: "user",
          text: "Draft a numbered execution plan that references specific servers/tools, lists expected outputs or validations for each step, calls out parallelisable work, and ends with the first concrete action you will perform immediately.",
        },
      ],
    },
  },
  {
    id: "client/post-run-review",
    trigger: "client.post-run-review",
    namespace: "client",
    name: "post-run-review",
    title: "Post-Run Review",
    description: "Ask the assistant to review recent tool usage and identify next best actions.",
    origin: "client-prompt",
    mode: "client",
    template: {
      messages: [
        {
          role: "system",
          text: "You are an expert reviewer ensuring high-quality outcomes after orchestrating multiple MCP actions.",
        },
        {
          role: "user",
          text: "Review the recent conversation and tool interactions. Summarise accomplishments, highlight anomalies or missing follow-up, and propose the next two high-impact actions (including which MCP servers or tools to invoke).",
        },
      ],
    },
  },
  {
    id: "client/find-pi-publications",
    trigger: "find_pi_publications",
    namespace: "client",
    name: "find_pi_publications",
    title: "Find PI Publications",
    description: "Identify trial principal investigators for a disease and surface their recent publications.",
    origin: "client-prompt",
    mode: "client",
    args: [
      {
        name: "disease_name",
        description: "Disease or condition to investigate (e.g., Ovarian Cancer)",
        required: true,
        placeholder: "Ovarian Cancer",
      },
      {
        name: "start_year",
        description: "Earliest publication year to include (defaults to last five years)",
        placeholder: "2020",
      },
    ],
    template: {
      messages: [
        {
          role: "system",
          text: `You are an MCP client orchestrator for clinical trial intelligence. Your goal is to catalogue principal investigators and their recent publications for the target disease. Follow this workflow precisely using the enhanced ClinicalTrials.gov MCP tools.

(1) Collect trial data efficiently:
   - Call mcp_clinicaltrial_ctgov_search_studies with query_cond set to the disease name
   - Use pageSize 15-25 (staging threshold is now 1MB, so larger page sizes work better)
   - Use predefined jq_filter "clinical_summary" to get structured overviews with PI info included
   - If you need specific fields, use working patterns like '.studies[0].protocolSection.contactsLocationsModule.overallOfficials'
   - Try different phase values (1, 2, 3) and recrs values ("open", "closed") to get diverse trials
   - If responses get staged, use the returned data_access_id with mcp_clinicaltrial_ctgov_query_data

(2) Extract NCT IDs and PIs in batch:
   - From clinical_summary results, collect all NCT IDs that have PI information
   - For missing PI data, use the NEW mcp_clinicaltrial_ctgov_get_studies tool with all NCT IDs at once
   - Use jq_filter "." to get full data, then parse .studies[].protocolSection.contactsLocationsModule.overallOfficials
   - This eliminates multiple individual API calls and is much more efficient

(3) Validate parameters if needed:
   - If you encounter parameter errors, use mcp_clinicaltrial_ctgov_validate_args to get corrected parameter names
   - Common aliases now work: use "condition" instead of "query_cond", "recruiting" instead of "recrs"

(4) Handle natural language queries:
   - Use mcp_clinicaltrial_ctgov_explain_query to convert complex search requirements to proper parameters
   - Example: "Find phase 2 ovarian cancer trials with immunotherapy that are recruiting" → structured parameters

(5) Search for publications:
   - For every PI issue an entrez.query call on the pubmed database using '<pi name> AND "<disease name>"'
   - Set mindate to the provided start year (formatted as YYYY/01/01)
   - Default to five years ago if no start year supplied

(6) Enhanced error handling:
   - jq filter errors now provide specific working examples - use the suggested alternatives
   - Size estimation warnings help optimize pageSize - follow the recommendations
   - Staging is less frequent but when it occurs, use SQL queries effectively

(7) Reporting:
   - Use efficient batch operations, leverage clinical_summary for structured data
   - Handle staging gracefully with SQL queries when needed
   - Follow the improved error messages for jq filter guidance`,
        },
        {
          role: "user",
          text: `Disease: {{disease_name}}
Publication start year: {{start_year}} (use the most recent five-year window if blank)

Use the enhanced MCP tools efficiently:
- Start with clinical_summary jq filter for structured overviews
- Use batch operations (get_studies) when possible
- Leverage the increased staging threshold for larger page sizes
- Follow jq filter guidance from error messages

Deliver a final report that includes: (a) a PI roster with linked NCT IDs and trial statuses, (b) the PubMed search terms you executed with total counts, and (c) a highlighted publications section that ties each PI's most relevant recent work back to {{disease_name}}, explaining the connection.`,
        },
      ],
    },
  },
  {
    id: "client/annotate-genes",
    trigger: "annotate_genes",
    namespace: "client",
    name: "annotate_genes",
    title: "Gene Functional Annotation",
    description: "Resolve mixed gene identifiers to NCBI GeneIDs and prepare summary, CSV, and SQL outputs.",
    origin: "client-prompt",
    mode: "client",
    args: [
      {
        name: "gene_list",
        description: "List of gene identifiers (comma or newline separated)",
        required: true,
        placeholder: "TP53, 7157, ENSG00000012048, P31749, EGFR",
      },
    ],
    template: {
      messages: [
        {
          role: "system",
          text: "You orchestrate MCP tools to annotate human genes. Follow the workflow: (1) Check rate limits via system-api-key-status to understand API constraints. (2) Normalize each input identifier to a human (9606[TaxID]) NCBI GeneID: treat numeric IDs as GeneIDs, search gene database with symbol[sym] AND 9606[TaxID] for symbols, search gene database directly for Ensembl IDs, and for UniProt accessions first search the protein database then link to genes. IMPORTANT: Batch searches where possible and handle rate limits gracefully - if you hit rate limits, pause and continue. (3) Deduplicate and request entrez-query summary for all GeneIDs in one batch (up to 10-20 at a time to avoid rate limits). (4) Optionally attempt entrez-query fetch rettype xml for richer annotations but fall back gracefully if it errors. If rettype='xml' fails for a specific record, switch to retmode='json' and continue. (5) Prepare outputs capturing original identifier, resolved GeneID, symbol, and summary, plus empty GO annotation placeholders. Respect tool error modes, avoid fragile field specifiers, handle rate limit errors gracefully, and clearly report identifiers that could not be resolved.",
        },
        {
          role: "user",
          text: "Input gene identifiers:\n{{gene_list}}\nProduce three deliverables: (a) JSON keyed by original identifier, (b) CSV rows with identifier,GeneID,symbol,summary,go_terms, and (c) SQL statements to create and populate an entrez_gene.sqlite table. Call out any unresolved inputs and document if GO annotations were unavailable.",
        },
      ],
    },
  },
  {
    id: "client/count-gene-disease-pubs",
    trigger: "count_gene_disease_pubs",
    namespace: "client",
    name: "count_gene_disease_pubs",
    title: "Count Gene–Disease Publications",
    description: "Count PubMed publications since 2000 for each gene symbol paired with a disease.",
    origin: "client-prompt",
    mode: "client",
    args: [
      {
        name: "gene_list",
        description: "Gene symbols to evaluate (comma or newline separated)",
        required: true,
        placeholder: "TP53, BRCA1, EGFR",
      },
      {
        name: "disease_name",
        description: "Disease or topic for the PubMed co-mention search",
        required: true,
        placeholder: "Ovarian Cancer",
      },
    ],
    template: {
      messages: [
        {
          role: "system",
          text: "You are tracking literature counts for gene–disease pairs. For each gene symbol, issue an entrez-query search on the PubMed database with term formatted as \"<gene>\" AND \"<disease>\", mindate fixed at 2000/01/01, and no field specifiers. Parse the total results from each response and handle service errors gracefully. If you hit rate limits, batch the remaining queries or pause between requests. Keep queries simple to avoid validation failures, and explain any genes that return zero or ambiguous hits.",
        },
        {
          role: "user",
          text: "Gene symbols:\n{{gene_list}}\nDisease focus: {{disease_name}}\nReturn a table listing each gene, the PubMed term you issued, and the count since 2000. Provide brief commentary on notable differences or follow-up searches to refine ambiguous results.",
        },
      ],
    },
  },
];
