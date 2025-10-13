import { db } from "./db";
import { chats, messages, type Chat, type Message, MessageRole, type MessagePart, type DBMessage } from "./db/schema";
import type { UIMessage } from "ai";
import { eq, desc, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { generateTitle } from "@/app/actions";

type AIMessage = {
  role: string;
  content?: string | any[];
  id?: string;
  parts?: MessagePart[];
};

type PersistableMessage = AIMessage | UIMessage;

type StoredUIMessage = UIMessage & {
  content: string;
  createdAt?: Date;
};

type SaveChatParams = {
  id?: string;
  userId: string;
  messages?: any[];
  title?: string;
};

type ChatWithMessages = Chat & {
  messages: Message[];
};

export async function saveMessages({
  messages: dbMessages,
}: {
  messages: Array<DBMessage>;
}) {
  console.log('[SAVE_MESSAGES_DB] Starting:', {
    messagesCount: dbMessages?.length || 0,
    firstMessage: dbMessages[0] ? {
      id: dbMessages[0].id,
      chatId: dbMessages[0].chatId,
      role: dbMessages[0].role
    } : null
  });

  try {
    if (dbMessages.length > 0) {
      const chatId = dbMessages[0].chatId;
      console.log('[SAVE_MESSAGES_DB] Processing messages for chatId:', chatId);

      // Ensure message IDs are unique before persisting to avoid primary key conflicts
      // Assign unique IDs for each message before inserting. This guards against collisions coming
      // from the upstream SDK (duplicate ids across retries) and ensures primary key uniqueness.
      const dedupedMessages: DBMessage[] = dbMessages.map((message) => ({
        ...message,
        id: nanoid(),
      }));

      console.log('[SAVE_MESSAGES_DB] Deduped messages:', dedupedMessages.map(m => ({ id: m.id, chatId: m.chatId, role: m.role })));

      // First delete any existing messages for this chat
      console.log('[SAVE_MESSAGES_DB] Deleting existing messages for chatId:', chatId);
      await db
        .delete(messages)
        .where(eq(messages.chatId, chatId));

      // Then insert the new messages
      console.log('[SAVE_MESSAGES_DB] Inserting', dedupedMessages.length, 'messages');
      const result = await db.insert(messages).values(dedupedMessages);
      console.log('[SAVE_MESSAGES_DB] Messages inserted successfully');
      return result;
    }
    console.log('[SAVE_MESSAGES_DB] No messages to save');
    return null;
  } catch (error) {
    console.error('[SAVE_MESSAGES_DB] Failed to save messages in database:', error);
    throw error;
  }
}

// Function to convert AI messages to DB format
export function convertToDBMessages(aiMessages: PersistableMessage[], chatId: string): DBMessage[] {
  return aiMessages.map(msg => {
    // Use existing id or generate a new one
    const messageId = msg.id || nanoid();

    // If msg has parts, use them directly
    if (msg.parts) {
      return {
        id: messageId,
        chatId,
        role: msg.role,
        parts: msg.parts,
        createdAt: new Date()
      };
    }

    // Otherwise, convert content to parts
    let parts: MessagePart[];

    if ('content' in msg && typeof msg.content === 'string') {
      parts = [{ type: 'text', text: msg.content }];
    } else if ('content' in msg && Array.isArray(msg.content)) {
      if (msg.content.every(item => typeof item === 'object' && item !== null)) {
        parts = msg.content as MessagePart[];
      } else {
        parts = [{ type: 'text', text: JSON.stringify(msg.content) }];
      }
    } else {
      parts = [{ type: 'text', text: '' }];
    }

    return {
      id: messageId,
      chatId,
      role: msg.role,
      parts,
      createdAt: new Date()
    };
  });
}

// Convert DB messages to UI format
export function convertToUIMessages(dbMessages: Array<Message>): Array<StoredUIMessage> {
  console.log('[CONVERT_MESSAGES] Input messages:', {
    count: dbMessages.length,
    messages: dbMessages.map(m => ({
      id: m.id,
      role: m.role,
      partsCount: Array.isArray(m.parts) ? m.parts.length : 0,
      parts: m.parts
    }))
  });

  const converted = dbMessages.map((message) => {
    const textContent = getTextContent(message);
    console.log('[CONVERT_MESSAGES] Converting message:', {
      id: message.id,
      role: message.role,
      parts: message.parts,
      extractedContent: textContent
    });

    return {
      id: message.id,
      role: message.role as string,
      parts: message.parts as MessagePart[], // AI SDK v5 parts property
      content: textContent, // String content for compatibility
      createdAt: message.createdAt,
    };
  }) as Array<StoredUIMessage>;

  console.log('[CONVERT_MESSAGES] Converted messages:', {
    count: converted.length,
    messages: converted.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      partsCount: Array.isArray(m.parts) ? m.parts.length : 0
    }))
  });

  return converted;
}

export async function saveChat({ id, userId, messages: aiMessages, title }: SaveChatParams) {
  console.log('[SAVE_CHAT] Starting save:', {
    id,
    userId,
    messagesCount: aiMessages?.length || 0,
    title,
    hasMessages: !!aiMessages && aiMessages.length > 0
  });

  // Generate a new ID if one wasn't provided
  const chatId = id || nanoid();

  // Check if title is provided, if not generate one
  let chatTitle = title;

  // Generate title if messages are provided and no title is specified
  if (aiMessages && aiMessages.length > 0) {
    const hasEnoughMessages = aiMessages.length >= 2 &&
      aiMessages.some(m => m.role === 'user') &&
      aiMessages.some(m => m.role === 'assistant');

    if (!chatTitle || chatTitle === 'New Chat' || chatTitle === undefined) {
      if (hasEnoughMessages) {
        try {
          // Use AI to generate a meaningful title based on conversation
          chatTitle = await generateTitle(aiMessages);
        } catch (error) {
          console.error('Error generating title:', error);
          // Fallback to basic title extraction if AI title generation fails
          const firstUserMessage = aiMessages.find(m => m.role === 'user');
          if (firstUserMessage) {
            // Check for parts first (new format)
            if (firstUserMessage.parts && Array.isArray(firstUserMessage.parts)) {
              const textParts = firstUserMessage.parts.filter((p: MessagePart) => p.type === 'text' && p.text);
              if (textParts.length > 0) {
                chatTitle = textParts[0].text?.slice(0, 50) || 'New Chat';
                if ((textParts[0].text?.length || 0) > 50) {
                  chatTitle += '...';
                }
              } else {
                chatTitle = 'New Chat';
              }
            }
            // Fallback to content (old format)
            else if (typeof firstUserMessage.content === 'string') {
              chatTitle = firstUserMessage.content.slice(0, 50);
              if (firstUserMessage.content.length > 50) {
                chatTitle += '...';
              }
            } else {
              chatTitle = 'New Chat';
            }
          } else {
            chatTitle = 'New Chat';
          }
        }
      } else {
        // Not enough messages for AI title, use first message
        const firstUserMessage = aiMessages.find(m => m.role === 'user');
        if (firstUserMessage) {
          // Check for parts first (new format)
          if (firstUserMessage.parts && Array.isArray(firstUserMessage.parts)) {
            const textParts = firstUserMessage.parts.filter((p: MessagePart) => p.type === 'text' && p.text);
            if (textParts.length > 0) {
              chatTitle = textParts[0].text?.slice(0, 50) || 'New Chat';
              if ((textParts[0].text?.length || 0) > 50) {
                chatTitle += '...';
              }
            } else {
              chatTitle = 'New Chat';
            }
          }
          // Fallback to content (old format)
          else if (typeof firstUserMessage.content === 'string') {
            chatTitle = firstUserMessage.content.slice(0, 50);
            if (firstUserMessage.content.length > 50) {
              chatTitle += '...';
            }
          } else {
            chatTitle = 'New Chat';
          }
        } else {
          chatTitle = 'New Chat';
        }
      }
    }
  } else {
    chatTitle = chatTitle || 'New Chat';
  }

  // Check if chat already exists
  const existingChat = await db.query.chats.findFirst({
    where: and(
      eq(chats.id, chatId),
      eq(chats.userId, userId)
    ),
  });

  if (existingChat) {
    // Update existing chat
    await db
      .update(chats)
      .set({
        title: chatTitle,
        updatedAt: new Date()
      })
      .where(and(
        eq(chats.id, chatId),
        eq(chats.userId, userId)
      ));
  } else {
    // Create new chat
    await db.insert(chats).values({
      id: chatId,
      userId,
      title: chatTitle,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  // IMPORTANT: Save the messages if provided
  if (aiMessages && aiMessages.length > 0) {
    console.log('[SAVE_CHAT] Saving messages:', {
      chatId,
      messagesCount: aiMessages.length,
      messages: aiMessages.map(m => ({
        id: m.id,
        role: m.role,
        content: typeof m.content === 'string' ? m.content.slice(0, 100) : 'complex content'
      }))
    });

    try {
      const dbMessages = convertToDBMessages(aiMessages, chatId);
      await saveMessages({ messages: dbMessages });
      console.log('[SAVE_CHAT] Messages saved successfully');
    } catch (error) {
      console.error('[SAVE_CHAT] Failed to save messages:', error);
      throw error;
    }
  } else {
    console.log('[SAVE_CHAT] No messages to save');
  }

  console.log('[SAVE_CHAT] Chat save completed:', { chatId });
  return { id: chatId };
}

// Helper to get just the text content for display
export function getTextContent(message: Message): string {
  try {
    const parts = message.parts as MessagePart[];
    return parts
      .filter(part => part.type === 'text' && part.text)
      .map(part => part.text)
      .join('\n');
  } catch (e) {
    // If parsing fails, return empty string
    return '';
  }
}

export async function getChats(userId: string) {
  return await db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: [desc(chats.updatedAt)]
  });
}

export async function getChatById(id: string, userId: string): Promise<ChatWithMessages | null> {
  console.log('[DB_GET_CHAT] Querying chat by ID:', { id, userId });

  const chat = await db.query.chats.findFirst({
    where: and(
      eq(chats.id, id),
      eq(chats.userId, userId)
    ),
  });

  console.log('[DB_GET_CHAT] Chat found:', !!chat);
  if (!chat) {
    console.log('[DB_GET_CHAT] No chat found with ID:', id, 'for user:', userId);
    return null;
  }

  const chatMessages = await db.query.messages.findMany({
    where: eq(messages.chatId, id),
    orderBy: [messages.createdAt]
  });

  console.log('[DB_GET_CHAT] Messages found:', {
    count: chatMessages.length,
    chatId: id,
    messages: chatMessages.map(m => ({
      id: m.id,
      role: m.role,
      partsCount: Array.isArray(m.parts) ? m.parts.length : 0,
      parts: m.parts
    }))
  });

  const result = {
    ...chat,
    messages: chatMessages
  };

  console.log('[DB_GET_CHAT] Returning result:', {
    id: result.id,
    messagesCount: result.messages.length,
    firstMessage: result.messages[0] ? {
      id: result.messages[0].id,
      role: result.messages[0].role,
      parts: result.messages[0].parts
    } : null
  });

  return result;
}

export async function deleteChat(id: string, userId: string) {
  await db.delete(chats).where(
    and(
      eq(chats.id, id),
      eq(chats.userId, userId)
    )
  );
} 
