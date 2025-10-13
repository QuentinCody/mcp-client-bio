"use server";

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// Create OpenAI client
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper to extract text content from a message regardless of format
function getMessageText(message: any): string {
  // Check if the message has parts (new format)
  if (message.parts && Array.isArray(message.parts)) {
    const textParts = message.parts.filter((p: any) => p.type === 'text' && p.text);
    if (textParts.length > 0) {
      return textParts.map((p: any) => p.text).join('\n');
    }
  }

  // Fallback to content (old format)
  if (typeof message.content === 'string') {
    return message.content;
  }

  // If content is an array (potentially of parts), try to extract text
  if (Array.isArray(message.content)) {
    const textItems = message.content.filter((item: any) =>
      typeof item === 'string' || (item.type === 'text' && item.text)
    );

    if (textItems.length > 0) {
      return textItems.map((item: any) =>
        typeof item === 'string' ? item : item.text
      ).join('\n');
    }
  }

  return '';
}

export async function generateTitle(messages: any[]): Promise<string> {
  // Heuristic fallback derives a short title from first user message
  const heuristic = (text: string): string => {
    const cleaned = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return 'New Chat';
    const words = cleaned.split(' ').slice(0, 6).join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  };

  try {
    const userMessage = messages.find(m => m.role === 'user');
    if (!userMessage) return 'New Chat';
    const messageText = getMessageText(userMessage).slice(0, 200);
    if (!messageText.trim()) return 'New Chat';

    const schema = z.object({
      title: z.string().describe('Only the chat title, max 6 words')
    });

    const prompt = `Create a short title for this conversation. Return only a JSON object with a "title" field.

Message to summarize: ${messageText}

Rules:
- Maximum 6 words for the title
- No quotes or punctuation in the title
- Return format: {"title": "your title here"}`;

    let lastErr: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { object: titleObject } = await generateObject({
          model: openai('gpt-4o-mini'),
          schema,
          prompt,
        });
        if (titleObject && typeof titleObject === 'object' && !Array.isArray(titleObject) && (titleObject as any).title) {
          return (titleObject as any).title;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) console.warn('Title generation fallback engaged:', lastErr);
    return heuristic(messageText);
  } catch (error) {
    console.error('Error generating title (outer):', error);
    return 'New Chat';
  }
}
