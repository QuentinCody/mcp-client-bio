import {
  getTokenUsageStats,
  getConversationTokenUsage,
  getAllConversationUsage,
  resetTokenUsageSession,
  resetConversationTokenUsage,
} from '@/lib/token-usage';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  // If chatId is provided, return per-conversation usage
  if (chatId) {
    const usage = getConversationTokenUsage(chatId);
    if (!usage) {
      return Response.json({
        total: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
        },
        messageCount: 0,
        toolUsage: [],
        recentHistory: [],
      });
    }
    return Response.json(usage);
  }

  // Return session-wide stats with conversation summaries
  const stats = getTokenUsageStats();
  const conversations = getAllConversationUsage();

  return Response.json({
    ...stats,
    conversations,
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (chatId) {
    resetConversationTokenUsage(chatId);
    return Response.json({ success: true, chatId });
  }

  resetTokenUsageSession();
  return Response.json({ success: true });
}
