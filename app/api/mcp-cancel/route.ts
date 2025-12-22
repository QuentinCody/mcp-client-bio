/**
 * API endpoint for MCP request cancellation
 * Allows cancelling in-progress MCP tool invocations
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Store the cancellation callback globally
let cancelRequestFn: ((requestId: string, reason?: string) => void) | null = null;

/**
 * Set the cancellation callback from the MCP client manager
 */
export function setCancelRequestCallback(
  fn: (requestId: string, reason?: string) => void
) {
  cancelRequestFn = fn;
}

/**
 * POST /api/mcp-cancel
 * Cancel an in-progress request
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, reason } = body;

    if (!requestId) {
      return NextResponse.json(
        { error: 'requestId required' },
        { status: 400 }
      );
    }

    if (!cancelRequestFn) {
      return NextResponse.json(
        { error: 'Cancellation not available' },
        { status: 503 }
      );
    }

    cancelRequestFn(requestId, reason);

    return NextResponse.json({
      success: true,
      requestId,
      message: 'Cancellation notification sent',
    });
  } catch (error: any) {
    console.error('Error cancelling request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cancel request' },
      { status: 500 }
    );
  }
}
