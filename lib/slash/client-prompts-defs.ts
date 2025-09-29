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
          text: `You are an MCP client orchestrator for clinical trial intelligence. Your goal is to catalogue principal investigators and their recent publications for the target disease. Follow this workflow precisely and apply the proven error-handling guidance.

(1) Collect trial IDs: call mcp_clinicaltrial_ctgov_search_studies three times (phase 1, 2, and 3) using query_cond set to the disease name, pageSize 5, and jq_filter '.studies[].protocolSection.identificationModule.nctId'. Combine the unique NCT IDs.

(2) Extract principal investigators: for each NCT ID call mcp_clinicaltrial_ctgov_get_study with jq_filter '.'. More specific filters are unsupported. Ignore any formatted summary card and parse the raw JSON payload to find protocolSection.contactsLocationsModule.overallOfficial[].name. If a study is withdrawn, terminated, or missing a PI, note it and continue.

(3) Search for publications: for every PI issue an entrez.query call on the pubmed database using the simple term '<pi name> AND "<disease name>"' and set mindate to the provided start year (formatted as YYYY/01/01). Do not include field specifiers such as [Title/Abstract] or [MeSH]. If no start year is supplied, default the mindate to five years ago.

(4) Refine when needed: if results are overly broad, add keywords from the trial title or interventions (e.g., drug names or procedure descriptors) to a follow-up search, then call entrez.query with operation 'summary' for the selected PMIDs.

(5) Reporting: keep tool reasoning concise, avoid unsupported jq filters, and always fail gracefully by logging issues and proceeding when data is missing.`,
        },
        {
          role: "user",
          text: `Disease: {{disease_name}}
Publication start year: {{start_year}} (use the most recent five-year window if blank)

Deliver a final report that includes: (a) a PI roster with linked NCT IDs and trial statuses, (b) the PubMed search terms you executed with total counts, and (c) a highlighted publications section that ties each PI's most relevant recent work back to {{disease_name}}, explaining the connection (for example, shared keywords with the trial).`,
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
          text: "You orchestrate MCP tools to annotate human genes. Follow the workflow: (1) Inspect rate limits via system.api-key-status. (2) Normalise each input identifier to a human (9606[TaxID]) NCBI GeneID: treat numeric IDs as GeneIDs, search gene database with symbol[sym] AND 9606[TaxID] for symbols, search gene database directly for Ensembl IDs, and for UniProt accessions first search the protein database then link to genes. (3) Deduplicate and request entrez.query summary for all GeneIDs in one batch. (4) Optionally attempt entrez.query fetch rettype xml for richer annotations but fall back gracefully if it errors. (5) Prepare outputs capturing original identifier, resolved GeneID, symbol, and summary, plus empty GO annotation placeholders. Respect tool error modes, avoid fragile field specifiers, and clearly report identifiers that could not be resolved.",
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
          text: "You are tracking literature counts for gene–disease pairs. For each gene symbol, issue an entrez.query search on the PubMed database with term formatted as \"<gene>\" AND \"<disease>\", mindate fixed at 2000/01/01, and no field specifiers. Parse the total results from each response and handle service errors gracefully. Keep queries simple to avoid validation failures, and explain any genes that return zero or ambiguous hits.",
        },
        {
          role: "user",
          text: "Gene symbols:\n{{gene_list}}\nDisease focus: {{disease_name}}\nReturn a table listing each gene, the PubMed term you issued, and the count since 2000. Provide brief commentary on notable differences or follow-up searches to refine ambiguous results.",
        },
      ],
    },
  },
];
