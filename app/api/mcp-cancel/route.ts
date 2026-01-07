/**
 * API endpoint for MCP request cancellation
 * Allows cancelling in-progress MCP tool invocations
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/mcp-cancel
 * Cancel an in-progress request
 *
 * Note: Currently returns 503 as cancellation infrastructure needs
 * to be implemented via shared state (Redis/database), not in-memory
 * callbacks which don't persist across serverless function invocations.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json(
        { error: 'requestId required' },
        { status: 400 }
      );
    }

    // Cancellation infrastructure not yet implemented
    return NextResponse.json(
      { error: 'Cancellation not available' },
      { status: 503 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel request';
    console.error('Error cancelling request:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
