/**
 * API endpoint for managing MCP roots
 * Roots define filesystem boundaries that MCP servers can access
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getMCPRoots,
  setMCPRoots,
  addMCPRoot,
  removeMCPRoot,
  type Root,
} from '@/lib/mcp-client-enhanced';

export const runtime = 'nodejs';

/**
 * GET /api/mcp-roots
 * List all configured roots
 */
export async function GET() {
  try {
    const roots = getMCPRoots();
    return NextResponse.json({ roots });
  } catch (error) {
    console.error('Error fetching MCP roots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch roots' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mcp-roots
 * Add a new root or replace all roots
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === 'set' && Array.isArray(body.roots)) {
      // Replace all roots
      const roots = body.roots as Root[];
      setMCPRoots(roots);
      return NextResponse.json({ success: true, roots: getMCPRoots() });
    }

    if (body.action === 'add' && body.uri) {
      // Add a single root
      addMCPRoot(body.uri, body.name);
      return NextResponse.json({ success: true, roots: getMCPRoots() });
    }

    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error managing MCP roots:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to manage roots' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mcp-roots
 * Remove a root
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uri = searchParams.get('uri');

    if (!uri) {
      return NextResponse.json(
        { error: 'URI parameter required' },
        { status: 400 }
      );
    }

    removeMCPRoot(uri);
    return NextResponse.json({ success: true, roots: getMCPRoots() });
  } catch (error: any) {
    console.error('Error removing MCP root:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove root' },
      { status: 500 }
    );
  }
}
