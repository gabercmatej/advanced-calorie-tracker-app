import { callClaudeText, hasClaudeKey } from '@/lib/claude';
import {
  factsForPrompt,
  FOOD_FACTS,
  formatFact,
  leanestFoods,
  matchFoodFacts,
} from '@/lib/food-facts';
import { addDays, daysBetween, relativeDayLabel, toDateKey, totalsFor } from '@/lib/nutrition';
import type { FoodEntry, Profile } from '@/types';

/**
 * The "Ask" surface on the Food tab: questions answered from the user's own log.
 *
 * Anthropic has no embeddings endpoint, and the corpus here is a few hundred
 * rows held in memory, so retrieval is a filter rather than a vector search:
 * pick the entries a question could plausibly be about, add the standing
 * summary the user always cares about, and stuff the lot into one call.
 *
 * Offline it degrades to a deterministic answerer covering the common shapes.
 * The surface is strictly read-only — it never writes a diary entry.
 */

/** Shown as tappable chips on first run, so the surface teaches itself. */
export const STARTER_QUESTIONS = [
  'When did I last eat chicken?',
  'What are the best low-calorie high-protein foods?',
  'How much protein did I average this week?',
  'What is my most-logged breakfast?',
];

const STOPWORDS = new Set([
  'when', 'did', 'do', 'does', 'i', 'my', 'me', 'the', 'a', 'an', 'is', 'are',
  'was', 'were', 'have', 'had', 'has', 'eat', 'ate', 'eaten', 'last', 'what',
  'which', 'how', 'much', 'many', 'this', 'that', 'for', 'and', 'with', 'best',
  'good', 'most', 'some', 'about', 'on', 'in', 'of', 'to', 'it', 'be', 'been',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/** Entries whose name shares a word with the question, newest first. */
function relevantEntries(question: string, entries: FoodEntry[], limit = 40): FoodEntry[] {
  const words = tokenize(question);
  if (words.length === 0) return [];
  return entries
    .filter((e) => {
      const name = e.name.toLowerCase();
      return words.some((w) => name.includes(w));
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/** The foods the user logs most, with their typical numbers. */
function topFoods(entries: FoodEntry[], limit = 15) {
  const byName = new Map<string, { name: string; count: number; calories: number; protein: number }>();
  for (const e of entries) {
    const key = e.name.toLowerCase().trim();
    const row = byName.get(key) ?? { name: e.name, count: 0, calories: 0, protein: 0 };
    row.count += 1;
    row.calories += e.calories * e.quantity;
    row.protein += e.macros.protein * e.quantity;
    byName.set(key, row);
  }
  return [...byName.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((r) => ({
      name: r.name,
      count: r.count,
      avgCalories: Math.round(r.calories / r.count),
      avgProtein: Math.round(r.protein / r.count),
    }));
}

/** Per-day totals for the last `days` days that have any entries. */
function recentDays(entries: FoodEntry[], days = 14) {
  const today = toDateKey();
  const rows: { date: string; calories: number; protein: number }[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(today, -i);
    const forDay = entries.filter((e) => e.date === date);
    if (forDay.length === 0) continue;
    const totals = totalsFor(forDay);
    rows.push({
      date,
      calories: Math.round(totals.calories),
      protein: Math.round(totals.macros.protein),
    });
  }
  return rows;
}

/**
 * Assemble everything the model is allowed to answer from. Keeping this in one
 * place makes the "answer only from this data" instruction enforceable.
 */
export function buildQaContext(question: string, entries: FoodEntry[], profile: Profile): string {
  const matched = relevantEntries(question, entries);
  const days = recentDays(entries);
  const top = topFoods(entries);

  const sections = [
    `TODAY: ${toDateKey()}`,
    `DAILY TARGETS: ${profile.goals.calories} kcal, ${profile.goals.macros.protein} g protein, ${profile.goals.macros.carbs} g carbs, ${profile.goals.macros.fat} g fat`,
    `TOTAL ENTRIES LOGGED: ${entries.length}`,

    matched.length
      ? `ENTRIES MATCHING THE QUESTION (newest first):\n${matched
          .map(
            (e) =>
              `- ${e.date} (${e.meal}): ${e.name} x${e.quantity} — ${Math.round(e.calories * e.quantity)} kcal, ${Math.round(e.macros.protein * e.quantity)} g protein`,
          )
          .join('\n')}`
      : 'ENTRIES MATCHING THE QUESTION: none found.',

    days.length
      ? `LAST 14 DAYS WITH LOGS:\n${days
          .map((d) => `- ${d.date}: ${d.calories} kcal, ${d.protein} g protein`)
          .join('\n')}`
      : 'LAST 14 DAYS WITH LOGS: nothing logged.',

    top.length
      ? `MOST-LOGGED FOODS:\n${top
          .map((t) => `- ${t.name}: logged ${t.count}x, typically ${t.avgCalories} kcal / ${t.avgProtein} g protein`)
          .join('\n')}`
      : 'MOST-LOGGED FOODS: none yet.',

    // Only a bounded slice of the reference table: the corpus is a few hundred
    // foods, and sending all of it would add thousands of tokens to every
    // question for the sake of rows the question never mentions. Whatever the
    // question actually matched goes first, topped up with staples.
    `NUTRITION REFERENCE (use for general food questions):\n${factsForPrompt(
      matchFoodFacts(question),
    )
      .map((f) => `- ${formatFact(f)}`)
      .join('\n')}`,
  ];

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// The model call
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  'You answer questions about one person\'s food diary inside a calorie-tracking app. ' +
  'Answer ONLY from the data supplied in the user message. Never invent an entry, a date, ' +
  'or a number. If the data does not contain the answer, say plainly that they have not ' +
  'logged it rather than guessing. Cite dates when you reference specific meals. Use the ' +
  'nutrition reference table for general food questions. Be brief: two or three sentences, ' +
  'or a short list. Do not offer to log anything — you cannot. Do not give medical advice.';

/** Ask Claude, grounded in `context`. Throws if the call fails. */
export async function askFoodQuestion(question: string, context: string): Promise<string> {
  return callClaudeText({
    system: SYSTEM_PROMPT,
    content: [{ type: 'text', text: `${context}\n\n---\n\nQUESTION: ${question}` }],
    maxTokens: 500,
  });
}

// ---------------------------------------------------------------------------
// Offline answerer
// ---------------------------------------------------------------------------

function answerWhenDidIEat(question: string, entries: FoodEntry[]): string | null {
  if (!/\bwhen\b|\blast\b/.test(question.toLowerCase())) return null;
  const matched = relevantEntries(question, entries, 5);
  if (matched.length === 0) {
    const words = tokenize(question);
    const subject = words[words.length - 1] ?? 'that';
    return `I can't find anything matching "${subject}" in your log.`;
  }
  const [latest, ...rest] = matched;
  const when = relativeDayLabel(latest.date);
  const ago = daysBetween(latest.date, toDateKey());
  const agoText = ago <= 0 ? '' : ago === 1 ? ' (1 day ago)' : ` (${ago} days ago)`;
  const lead = `You last had ${latest.name} on ${when}${agoText} — ${Math.round(latest.calories * latest.quantity)} kcal.`;
  if (rest.length === 0) return lead;
  return `${lead} Before that: ${rest.map((e) => `${e.name} on ${relativeDayLabel(e.date)}`).join(', ')}.`;
}

function answerLeanFoods(question: string): string | null {
  const q = question.toLowerCase();
  const wantsProtein = /protein/.test(q);
  const wantsLowCal = /low[- ]?cal|lowest cal|fewest cal|light/.test(q);
  if (!wantsProtein && !wantsLowCal) return null;

  const picks = wantsProtein ? leanestFoods(6) : [...FOOD_FACTS].sort((a, b) => a.calories - b.calories).slice(0, 6);
  const lines = picks.map((f) => `• ${f.name} — ${f.calories} kcal, ${f.macros.protein} g protein per ${f.serving}`);
  const lead = wantsProtein
    ? 'Best protein per calorie from the reference table:'
    : 'Lowest-calorie options from the reference table:';
  return `${lead}\n${lines.join('\n')}`;
}

function answerAverages(question: string, entries: FoodEntry[]): string | null {
  const q = question.toLowerCase();
  if (!/average|how much|how many|this week|typical/.test(q)) return null;
  const days = recentDays(entries, 7);
  if (days.length === 0) return 'You have not logged anything in the last week.';
  const avgCal = Math.round(days.reduce((s, d) => s + d.calories, 0) / days.length);
  const avgProtein = Math.round(days.reduce((s, d) => s + d.protein, 0) / days.length);
  return `Over the last ${days.length} logged day${days.length === 1 ? '' : 's'} you averaged ${avgCal} kcal and ${avgProtein} g protein a day.`;
}

function answerMostLogged(question: string, entries: FoodEntry[]): string | null {
  if (!/most|often|usually|favourite|favorite/.test(question.toLowerCase())) return null;
  const top = topFoods(entries, 5);
  if (top.length === 0) return 'You have not logged anything yet.';
  return `Your most-logged foods: ${top.map((t) => `${t.name} (${t.count}x)`).join(', ')}.`;
}

/**
 * Deterministic fallback used when there is no API key. It covers the shapes
 * the feature was asked for and says so plainly when it can't help, rather
 * than pretending to be a general chatbot.
 */
export function offlineAnswer(question: string, entries: FoodEntry[]): string {
  const answer =
    answerWhenDidIEat(question, entries) ??
    answerLeanFoods(question) ??
    answerAverages(question, entries) ??
    answerMostLogged(question, entries);

  if (answer) return answer;

  // Nothing matched — be explicit about the actual capability.
  const known = matchFoodFacts(question);
  if (known.length === 1) return `${formatFact(known[0])}.`;

  return (
    "I can answer offline questions like \"when did I last eat salmon?\", " +
    '"what are the best low-calorie high-protein foods?", or "how much protein did I average this week?". ' +
    'Add an Anthropic API key for free-form questions.'
  );
}

/** Answer a question, preferring the model and falling back cleanly. */
export async function answerFoodQuestion(
  question: string,
  entries: FoodEntry[],
  profile: Profile,
): Promise<string> {
  if (!hasClaudeKey) return offlineAnswer(question, entries);
  try {
    const context = buildQaContext(question, entries, profile);
    const reply = await askFoodQuestion(question, context);
    return reply || offlineAnswer(question, entries);
  } catch (err) {
    console.warn('[food-qa] model call failed, answering offline:', err);
    return offlineAnswer(question, entries);
  }
}
