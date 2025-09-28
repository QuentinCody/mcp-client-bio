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
];
