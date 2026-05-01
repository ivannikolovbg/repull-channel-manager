/**
 * POST /api/webhooks/repull
 *
 * Receives Repull webhook events. Verifies HMAC-SHA256 against
 * `WEBHOOK_SIGNING_SECRET` and routes to per-event handlers.
 *
 * Multi-tenant resolution: the workspace must be identifiable from the
 * incoming payload. For v1 we use a `workspaceId` field in the envelope —
 * align with whatever Repull supplies as the customer/account identifier.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { handleRepullEvent, verifyWebhookSignature } from '@/core/services/webhook-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sigHeader =
    req.headers.get('x-repull-signature') ??
    req.headers.get('x-webhook-signature') ??
    req.headers.get('x-signature');

  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (secret && !verifyWebhookSignature({ rawBody, signatureHeader: sigHeader, secret })) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const workspaceId =
    (envelope.workspaceId as string | undefined) ??
    (envelope.workspace_id as string | undefined) ??
    (envelope.customerId as string | undefined);
  if (!workspaceId) {
    return NextResponse.json(
      { error: 'workspaceId missing — cannot route event to a tenant' },
      { status: 400 },
    );
  }

  try {
    await handleRepullEvent({ workspaceId, envelope });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'POST signed Repull events here' });
}
