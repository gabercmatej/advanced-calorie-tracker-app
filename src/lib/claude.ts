import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Shared Claude transport.
 *
 * Every AI feature in the app (food estimation, recipe generation, the Ask
 * surface) funnels through here. It owns the fetch, the auth header, the
 * structured-output wiring and JSON parsing, and nothing else — each caller
 * decides its own fallback when this throws.
 *
 * **The Anthropic key is not in this app.** Requests go to the `claude` Supabase
 * Edge Function (`supabase/functions/claude/`), which holds the key as a
 * server-side secret, checks the caller's Supabase session, counts the call
 * against a daily per-user limit, and forwards the body to Anthropic unchanged.
 *
 * That indirection is not decoration. Anything named `EXPO_PUBLIC_*` is inlined
 * into the JavaScript bundle, so a key shipped that way is readable by anyone
 * with the app or the web build — and a leaked Anthropic key is a bill, not
 * just an exposure. There is deliberately **no** direct-to-Anthropic fallback:
 * a fallback that reintroduces the key whenever the proxy is unreachable is the
 * same vulnerability with extra steps.
 */

/** Where the proxy lives, derived from the project URL. */
const FUNCTION_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL.trim().replace(/\/$/, '')}/functions/v1/claude`
  : undefined;

/**
 * Cheapest vision-capable Claude model — accurate enough for meal photos and
 * short reasoning while keeping per-call cost to a fraction of a cent. Swap to
 * `claude-sonnet-5` if multi-photo fusion accuracy matters more than cost.
 */
export const MODEL = 'claude-haiku-4-5';

/**
 * Whether AI features can run at all.
 *
 * This is now a statement about the backend rather than about a bundled key:
 * without a configured Supabase project there is no proxy to call. It stays
 * `true` while signed out — the session is checked per request, and a signed-out
 * user gets a clear "sign in" error rather than a feature that has silently
 * vanished from the UI.
 */
export const hasClaudeKey = Boolean(FUNCTION_URL);

/** A block in the user message — text or a base64 image. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    };

export interface CallOptions {
  system: string;
  content: ContentBlock[];
  /** JSON schema constraining the reply. Omit for free-form prose. */
  schema?: Record<string, unknown>;
  maxTokens?: number;
}

/** Pull the first JSON value out of a text blob, tolerating stray prose. */
function extractJson(text: string): string {
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  // Whichever container opens first is the one we want.
  const start =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
        ? firstBrace
        : Math.min(firstBrace, firstBracket);
  if (start === -1) return text;
  const closer = text[start] === '{' ? '}' : ']';
  const end = text.lastIndexOf(closer);
  if (end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

async function request(options: CallOptions): Promise<string> {
  if (!FUNCTION_URL || !isSupabaseConfigured || !supabase) {
    throw new Error('AI features need a configured Supabase project.');
  }

  // The user's own access token. Sent instead of an API key, so the proxy can
  // tell who is calling and charge the request against their daily allowance.
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) throw new Error('Sign in to use AI features.');

  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: options.maxTokens ?? 800,
    system: options.system,
    messages: [{ role: 'user', content: options.content }],
  };
  if (options.schema) {
    body.output_config = { format: { type: 'json_schema', schema: options.schema } };
  }

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Surface the underlying message — "credit balance is too low", "daily AI
    // limit reached" and friends are all things the user can act on, and a bare
    // status code in the UI helps nobody. Both shapes appear here: the proxy's
    // own `{ error: string }` and Anthropic's `{ error: { message } }`.
    const raw = await res.text().catch(() => '');
    let message =
      res.status === 404
        ? 'The AI proxy is not deployed. Run: supabase functions deploy claude'
        : `AI request failed (${res.status})`;
    try {
      const parsed = JSON.parse(raw) as { error?: string | { message?: string } };
      if (typeof parsed.error === 'string') message = parsed.error;
      else if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // Non-JSON body — keep the status-only message.
    }
    throw new Error(message);
  }

  const data = (await res.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };
  // Safety classifiers can decline with a 200 and an empty content array.
  if (data.stop_reason === 'refusal') throw new Error('Request was declined by the model');
  return data.content?.find((b) => b.type === 'text')?.text ?? '';
}

/** Call Claude and parse the reply as JSON matching `schema`. */
export async function callClaudeJson<T>(options: CallOptions): Promise<T> {
  const text = await request(options);
  return JSON.parse(extractJson(text)) as T;
}

/** Call Claude and return its reply as plain text. */
export async function callClaudeText(options: Omit<CallOptions, 'schema'>): Promise<string> {
  const text = await request(options);
  return text.trim();
}
