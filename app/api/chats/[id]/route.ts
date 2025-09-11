import { NextResponse } from "next/server";
import { getChatById, deleteChat } from "@/lib/chat-store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const effectiveUserId = request.headers.get('x-user-id') || 'anon';
    const { id } = await params;
    const chat = await getChatById(id, effectiveUserId);

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(chat);
  } catch (error) {
    console.error("Error fetching chat:", error);
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
