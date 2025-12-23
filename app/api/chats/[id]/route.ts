import { NextResponse } from "next/server";
import { getChatById, deleteChat } from "@/lib/chat-store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const effectiveUserId = request.headers.get('x-user-id') || 'anon';
    const { id } = await params;
    // Chat API logs commented out - not relevant to JSON response debugging
    // console.log('[API_CHAT_GET] Fetching chat:', { id, effectiveUserId });

    const chat = await getChatById(id, effectiveUserId);
    // console.log('[API_CHAT_GET] Chat retrieved from DB:', {
    //   found: !!chat,
    //   id: chat?.id,
    //   messagesCount: chat?.messages?.length || 0,
    //   firstMessage: chat?.messages?.[0] ? {
    //     id: chat.messages[0].id,
    //     role: chat.messages[0].role,
    //     partsCount: Array.isArray(chat.messages[0].parts) ? chat.messages[0].parts.length : 0
    //   } : 'none'
    // });

    if (!chat) {
      // console.log('[API_CHAT_GET] Chat not found in database');
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      );
    }

    // console.log('[API_CHAT_GET] Returning chat data:', JSON.stringify({
    //   id: chat.id,
    //   messagesCount: chat.messages?.length || 0,
    //   messages: chat.messages
    // }, null, 2));
    return NextResponse.json(chat);
  } catch (error) {
    console.error("[API_CHAT_GET] Error fetching chat:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const effectiveUserId = request.headers.get('x-user-id') || 'anon';
    const { id } = await params;
    await deleteChat(id, effectiveUserId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting chat:", error);
    return NextResponse.json(
      { error: "Failed to delete chat" },
      { status: 500 }
    );
  }
} 
