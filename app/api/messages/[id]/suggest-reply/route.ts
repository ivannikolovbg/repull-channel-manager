/**
 * POST /api/messages/{id}/suggest-reply
 *   → { suggestions: string[], provider, modelUsed? }
 *
 * Asks the configured AI provider (Vanio AI > OpenAI > Anthropic > stub) for
 * three reply variants the host can drop into the compose box.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import { suggestReplies } from '@/core/services/messaging/ai-suggest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const out = await suggestReplies({
      workspaceId: ctx.workspace.id,
      conversationId: id,
    });
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
