import { NextResponse } from 'next/server';

export async function GET() {
  const codemodeWorkerUrl = process.env.CODEMODE_WORKER_URL;
  const available = !!codemodeWorkerUrl;

  return NextResponse.json({
    available,
    workerUrl: available ? codemodeWorkerUrl : null,
    message: available
      ? 'Code Mode is available'
      : 'Code Mode requires CODEMODE_WORKER_URL environment variable',
  });
}
