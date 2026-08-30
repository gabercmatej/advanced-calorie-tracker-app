// Supabase Edge Function: the app's only route to Anthropic.
//
// Deploy with:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy claude
//
// Why this exists: `EXPO_PUBLIC_*` variables are inlined into the JavaScript
// bundle, so a key shipped that way is readable by anyone holding the app or
// the web build. Here the key lives only in Supabase's secret store, is read
// from the environment at request time, and never appears in a response or a
// log line. The client sends its Supabase access token instead, which is
// already scoped to one user and already expires on its own.
//
// This runs on Deno, not React Native — it is deliberately not part of the app's
// module graph and is not type-checked by the app's tsconfig.

import { createClient } from 'jsr:@supabase/supabase-js@2';

/** Calls one account may make per UTC day. Generous for one person's use. */
const DAILY_CALL_LIMIT = 200;

/** Give up on Anthropic after this long rather than holding the request open. */
const UPSTREAM_TIMEOUT_MS = 60_000;

/** Largest request body accepted, before base64 photos become a denial of service. */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    // Deliberately vague to the caller; the detail goes to the function log,
    // which is a place only the project owner can read.
    console.error('ANTHROPIC_API_KEY is not set for this function');
    return json({ error: 'AI is not configured on the server.' }, 503);
  }

  // --- Authenticate ---------------------------------------------------------
  // No valid Supabase session, no call. This is what stops the function being
  // an open, anonymous Anthropic proxy paid for by whoever owns the key.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Sign in to use AI features.' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: 'Your session has expired. Sign in again.' }, 401);
  }

  // --- Rate limit -----------------------------------------------------------
  const { data: allowed, error: limitError } = await supabase.rpc('claim_ai_call', {
    daily_limit: DAILY_CALL_LIMIT,
  });
  if (limitError) {
    // Fail closed: a broken limiter must not become an unlimited one.
    console.error('rate limit check failed', limitError.message);
    return json({ error: 'Could not verify usage limits. Try again shortly.' }, 503);
  }
  if (allowed === false) {
    return json(
      { error: `Daily AI limit reached (${DAILY_CALL_LIMIT} requests). It resets at midnight UTC.` },
      429,
    );
  }

  // --- Forward --------------------------------------------------------------
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Request too large.' }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    // One attempt, no retry loop: the caller decides whether a failure is worth
    // repeating, and a retry here would silently multiply both latency and cost.
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    // Anthropic's own error text is useful to the user ("credit balance is too
    // low"), and contains no credentials — the key travels in a header we set
    // here and is never echoed back.
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS, 'content-type': 'application/json' },
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return json({ error: aborted ? 'The AI request timed out.' : 'Could not reach the AI service.' }, 504);
  } finally {
    clearTimeout(timer);
  }
});
