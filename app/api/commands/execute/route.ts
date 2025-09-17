import { NextResponse } from "next/server";
import { slashRegistry } from "@/lib/slash";

function streamFromValue(value: unknown): ReadableStream<Uint8Array> {
  if (value instanceof ReadableStream) {
    return value;
  }
  const encoder = new TextEncoder();
  const text =
    typeof value === "string"
      ? value
      : value instanceof Uint8Array
        ? new TextDecoder().decode(value)
        : value == null
          ? ""
          : JSON.stringify(value, null, 2);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

export async function POST(request: Request) {
  let payload: any = {};
  try {
    payload = await request.json();
  } catch {}

  const nameInput = payload?.name;
  if (!nameInput || typeof nameInput !== "string") {
    return NextResponse.json({ error: "Command name is required" }, { status: 400 });
  }

  const command = slashRegistry.getByName(nameInput);
  if (!command) {
    return NextResponse.json({ error: `Command ${nameInput} not found` }, { status: 404 });
  }

  try {
    const args = payload?.args ?? [];
    const result = await command.run({ args, signal: request.signal });
    const stream = streamFromValue(result);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Slash-Command": command.name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
