/**
 * API endpoint for MCP progress tracking
 * Provides real-time progress updates for long-running MCP operations
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getProgressUpdatesForToken,
  getActiveRequests,
  type ProgressUpdate,
} from '@/lib/mcp-client-enhanced';

export const runtime = 'nodejs';

/**
 * GET /api/mcp-progress
 * Get progress updates for a specific token or all active requests
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (token) {
      // Get updates for specific token
      const updates = getProgressUpdatesForToken(token);
      return NextResponse.json({ token, updates });
    } else {
      // Get all active requests
      const active = Array.from(getActiveRequests().entries()).map(
        ([id, data]) => ({ id, ...data })
      );
      return NextResponse.json({ active });
    }
  } catch (error) {
    console.error('Error fetching progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}
