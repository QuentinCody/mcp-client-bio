import { NextResponse } from "next/server";
import { getChats } from "@/lib/chat-store";
import { checkBotId } from "botid/server";

export async function GET(request: Request) {
  try {
    const effectiveUserId = request.headers.get('x-user-id') || 'anon';
    const chats = await getChats(effectiveUserId);
    return NextResponse.json(chats);
  } catch (error) {
    console.error("Error fetching chats:", error);
    return NextResponse.json(
      { error: "Failed to fetch chats" },
      { status: 500 }
    );
  }
} 
