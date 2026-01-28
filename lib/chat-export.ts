/**
 * Chat Export Utilities
 *
 * Provides functions to export chat conversations in various formats.
 */

import type { UIMessage } from 'ai';

export interface ChatExportData {
  id: string;
  title: string;
  createdAt: string;
  exportedAt: string;
  messages: ExportedMessage[];
}

export interface ExportedMessage {
  id: string;
  role: string;
  content: string;
  timestamp?: string;
  toolCalls?: ToolCallExport[];
}

export interface ToolCallExport {
  toolName: string;
  args?: any;
  result?: string;
}

/**
 * Extract text content from a UI message
 */
function extractMessageContent(message: UIMessage): string {
  const parts = (message as any).parts;
  if (Array.isArray(parts)) {
    return parts
      .filter((part: any) => part?.type === 'text')
      .map((part: any) => part.text || '')
      .join('\n')
      .trim();
  }

  const content = (message as any).content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((v: any) => String(v ?? '')).join('\n');
  }
  return '';
}

/**
 * Extract tool calls from a UI message
 */
function extractToolCalls(message: UIMessage): ToolCallExport[] {
  const parts = (message as any).parts;
  if (!Array.isArray(parts)) return [];

  return parts
    .filter((part: any) =>
      part?.type === 'tool-invocation' ||
      part?.type?.startsWith?.('tool-')
    )
    .map((part: any) => {
      const invocation = part.toolInvocation || part;
      return {
        toolName: invocation.toolName || part.type?.replace('tool-', '') || 'unknown',
        args: invocation.args,
        result: typeof invocation.result === 'string'
          ? invocation.result
          : JSON.stringify(invocation.result)?.slice(0, 500),
      };
    });
}

/**
 * Convert messages to export format
 */
function convertMessages(messages: UIMessage[]): ExportedMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: extractMessageContent(msg),
    timestamp: (msg as any).createdAt?.toISOString?.() || undefined,
    toolCalls: extractToolCalls(msg),
  }));
}

/**
 * Export chat as JSON
 */
export function exportToJSON(
  chatId: string,
  title: string,
  messages: UIMessage[],
  createdAt?: Date
): string {
  const exportData: ChatExportData = {
    id: chatId,
    title,
    createdAt: createdAt?.toISOString() || new Date().toISOString(),
    exportedAt: new Date().toISOString(),
    messages: convertMessages(messages),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export chat as Markdown
 */
export function exportToMarkdown(
  chatId: string,
  title: string,
  messages: UIMessage[],
  createdAt?: Date
): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    `**Chat ID:** ${chatId}`,
    `**Created:** ${createdAt?.toISOString() || 'Unknown'}`,
    `**Exported:** ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ];

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? '**User**' : '**Assistant**';
    const content = extractMessageContent(msg);
    const toolCalls = extractToolCalls(msg);

    lines.push(`### ${roleLabel}`);
    lines.push('');

    if (content) {
      lines.push(content);
      lines.push('');
    }

    if (toolCalls.length > 0) {
      lines.push('**Tool Calls:**');
      for (const tc of toolCalls) {
        lines.push(`- \`${tc.toolName}\``);
        if (tc.args) {
          lines.push(`  - Args: \`${JSON.stringify(tc.args).slice(0, 200)}\``);
        }
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Trigger file download in browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export and download chat as JSON
 */
export function downloadChatAsJSON(
  chatId: string,
  title: string,
  messages: UIMessage[],
  createdAt?: Date
): void {
  const json = exportToJSON(chatId, title, messages, createdAt);
  const filename = `chat-${chatId.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.json`;
  downloadFile(json, filename, 'application/json');
}

/**
 * Export and download chat as Markdown
 */
export function downloadChatAsMarkdown(
  chatId: string,
  title: string,
  messages: UIMessage[],
  createdAt?: Date
): void {
  const md = exportToMarkdown(chatId, title, messages, createdAt);
  const filename = `chat-${chatId.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.md`;
  downloadFile(md, filename, 'text/markdown');
}
