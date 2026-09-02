/**
 * Stage A of the food estimator: read what the user actually wrote, before any
 * model sees it.
 *
 * Everything in here is deterministic string work. It exists because the three
 * worst failure modes of an LLM calorie estimate are all failures to respect
 * something the user stated outright — a number ("the milk is 150 kcal"), a
 * count ("3 cans"), or a food ("...of tuna"). A model that is *asked* to honour
 * those will usually honour them; a parser that *extracts* them first can also
 * check afterwards that they were honoured, and repair the answer when they
 * were not. That check is only possible because this runs first.
 *
 * The output is a list of `FoodMention`s — one per thing the user named — each
 * carrying its quantity, its preparation notes, and any nutrition the user
 * stated for it. Nothing here estimates anything.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The units a quantity can be counted in, after normalisation. Mass and volume
 * collapse to grams and millilitres; everything else is a countable thing whose
 * size we don't know until we know the food.
 */
export type MeasureUnit =
  | 'g'
  | 'ml'
  | 'can'
  | 'scoop'
  | 'slice'
  | 'piece'
  | 'serving'
  | 'package'
  | 'bottle'
  | 'bar'
  | 'egg'
  | 'tbsp'
  | 'tsp'
  | 'cup'
  | 'handful'
  | 'bowl'
  | 'glass';

/** Units that count discrete things rather than measuring an amount. */
const COUNTABLE: MeasureUnit[] = [
  'can', 'scoop', 'slice', 'piece', 'serving', 'package',
  'bottle', 'bar', 'egg', 'handful', 'bowl', 'glass',
];

export function isCountable(unit: MeasureUnit): boolean {
  return COUNTABLE.includes(unit);
}

export interface Quantity {
  amount: number;
  unit: MeasureUnit;
  /** How the user wrote it, for prompts and error messages ("3 cans"). */
  text: string;
}

/** What a stated set of numbers describes. */
export type FactBasis = 'total' | 'per100' | 'perUnit';

/** Nutrition the user stated outright. These are facts, not estimates. */
export interface StatedNutrition {
  basis: FactBasis;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}

export interface FoodMention {
  /** The clause exactly as written, for showing back to the user. */
  raw: string;
  /** Food words only, lowercased, with quantities and qualifiers removed. */
  phrase: string;
  quantity?: Quantity;
  /** Preparation notes: 'drained', 'in oil', 'cooked', '0% fat'… */
  qualifiers: string[];
  stated?: StatedNutrition;
}

export interface ParsedMeal {
  mentions: FoodMention[];
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, couple: 2, dozen: 12,
};

const NUMBER_WORD_RE = Object.keys(NUMBER_WORDS).join('|');

/** Unicode fractions and the odd typographic comma decimal, as plain digits. */
function normalizeNumerics(text: string): string {
  return text
    .replace(/½/g, ' 0.5 ')
    .replace(/¼/g, ' 0.25 ')
    .replace(/¾/g, ' 0.75 ')
    .replace(/⅓/g, ' 0.333 ')
    .replace(/⅔/g, ' 0.667 ')
    // "half a scoop" is a fraction with an article in the middle of it, which
    // the quantity regex cannot see past. Left alone it reads as one scoop —
    // double what was eaten. "half-fat" is untouched: no article follows.
    .replace(/\bhalf\s+(?:a|an)\s+/g, ' 0.5 ')
    // "1 1/2" and "1/2" — the mixed form first so it isn't split in two.
    .replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, (_m, w, n, d) => String(Number(w) + Number(n) / Number(d)))
    .replace(/(\d+)\s*\/\s*(\d+)(?!\s*(?:g|ml))/g, (_m, n, d) => String(Number(n) / Number(d)))
    .replace(/×/g, ' x ');
}

function toNumber(token: string): number | undefined {
  const word = NUMBER_WORDS[token];
  if (word != null) return word;
  const n = Number(token);
  return Number.isFinite(n) ? n : undefined;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

interface UnitDef {
  unit: MeasureUnit;
  /** Multiplier onto the canonical unit (kg → g is 1000). */
  factor: number;
}

/** Written form → canonical unit. Longest key wins, so 'kg' beats 'g'. */
const UNITS: Record<string, UnitDef> = {
  g: { unit: 'g', factor: 1 },
  gr: { unit: 'g', factor: 1 },
  gram: { unit: 'g', factor: 1 },
  grams: { unit: 'g', factor: 1 },
  gramme: { unit: 'g', factor: 1 },
  grammes: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  kilo: { unit: 'g', factor: 1000 },
  kilos: { unit: 'g', factor: 1000 },
  kilogram: { unit: 'g', factor: 1000 },
  kilograms: { unit: 'g', factor: 1000 },
  oz: { unit: 'g', factor: 28.35 },
  ounce: { unit: 'g', factor: 28.35 },
  ounces: { unit: 'g', factor: 28.35 },
  lb: { unit: 'g', factor: 453.6 },
  lbs: { unit: 'g', factor: 453.6 },
  pound: { unit: 'g', factor: 453.6 },
  pounds: { unit: 'g', factor: 453.6 },

  ml: { unit: 'ml', factor: 1 },
  millilitre: { unit: 'ml', factor: 1 },
  millilitres: { unit: 'ml', factor: 1 },
  milliliter: { unit: 'ml', factor: 1 },
  milliliters: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 },
  dl: { unit: 'ml', factor: 100 },
  l: { unit: 'ml', factor: 1000 },
  litre: { unit: 'ml', factor: 1000 },
  litres: { unit: 'ml', factor: 1000 },
  liter: { unit: 'ml', factor: 1000 },
  liters: { unit: 'ml', factor: 1000 },

  can: { unit: 'can', factor: 1 },
  cans: { unit: 'can', factor: 1 },
  tin: { unit: 'can', factor: 1 },
  tins: { unit: 'can', factor: 1 },
  scoop: { unit: 'scoop', factor: 1 },
  scoops: { unit: 'scoop', factor: 1 },
  slice: { unit: 'slice', factor: 1 },
  slices: { unit: 'slice', factor: 1 },
  piece: { unit: 'piece', factor: 1 },
  pieces: { unit: 'piece', factor: 1 },
  serving: { unit: 'serving', factor: 1 },
  servings: { unit: 'serving', factor: 1 },
  portion: { unit: 'serving', factor: 1 },
  portions: { unit: 'serving', factor: 1 },
  package: { unit: 'package', factor: 1 },
  packages: { unit: 'package', factor: 1 },
  packet: { unit: 'package', factor: 1 },
  packets: { unit: 'package', factor: 1 },
  pack: { unit: 'package', factor: 1 },
  packs: { unit: 'package', factor: 1 },
  bottle: { unit: 'bottle', factor: 1 },
  bottles: { unit: 'bottle', factor: 1 },
  bar: { unit: 'bar', factor: 1 },
  bars: { unit: 'bar', factor: 1 },
  egg: { unit: 'egg', factor: 1 },
  eggs: { unit: 'egg', factor: 1 },
  tbsp: { unit: 'tbsp', factor: 1 },
  tablespoon: { unit: 'tbsp', factor: 1 },
  tablespoons: { unit: 'tbsp', factor: 1 },
  tsp: { unit: 'tsp', factor: 1 },
  teaspoon: { unit: 'tsp', factor: 1 },
  teaspoons: { unit: 'tsp', factor: 1 },
  cup: { unit: 'cup', factor: 1 },
  cups: { unit: 'cup', factor: 1 },
  handful: { unit: 'handful', factor: 1 },
  handfuls: { unit: 'handful', factor: 1 },
  bowl: { unit: 'bowl', factor: 1 },
  bowls: { unit: 'bowl', factor: 1 },
  glass: { unit: 'glass', factor: 1 },
  glasses: { unit: 'glass', factor: 1 },
};

const UNIT_RE = Object.keys(UNITS)
  .sort((a, b) => b.length - a.length)
  .join('|');

// ---------------------------------------------------------------------------
// Clause splitting
// ---------------------------------------------------------------------------

/**
 * Separators between one food and the next.
 *
 * ' with ' is included because "oatmeal with a scoop of protein" is two foods —
 * but that also splits "tuna with the oil drained", which is one food and a
 * preparation note. The merge pass below puts that back together, which is
 * safer than trying to decide at split time.
 */
const SEPARATORS = /\s*(?:,|;|\+|\/|\band\b|\bplus\b|\bwith\b|&|\n)\s*/;

// ---------------------------------------------------------------------------
// Qualifier / removal stripping
// ---------------------------------------------------------------------------

/**
 * Preparation notes, removed from the phrase and kept as qualifiers.
 *
 * The removal patterns come first and matter most: "3 cans of tuna with the oil
 * drained" must not leave the word "oil" lying around where it can be read as a
 * food. Draining the oil off tuna *lowers* the calories; a parser that turns it
 * into an ingredient raises them.
 */
const REMOVAL_PATTERNS: RegExp[] = [
  /\b(?:with\s+)?(?:the\s+)?(oil|fat|skin|sauce|dressing|water|brine|syrup|juice|liquid|marinade|seeds?|crusts?)\s+(?:is\s+|are\s+|been\s+)?(drained|removed|discarded|poured\s+off|off|out|away)\b/g,
  /\b(drained|rinsed|strained)\b/g,
  /\b(?:with\s+)?no\s+(sauce|dressing|oil|butter|sugar|cheese|mayo|mayonnaise|salt|skin|dairy|added\s+sugar)\b/g,
  /\bwithout\s+(?:the\s+)?(sauce|dressing|oil|butter|sugar|cheese|mayo|mayonnaise|skin|crust)\b/g,
  /\b(skinless|boneless|unsweetened|sugar[-\s]free|fat[-\s]free)\b/g,
];

const QUALIFIER_PATTERNS: RegExp[] = [
  /\bin\s+(oil|water|brine|sauce|syrup|tomato\s+sauce)\b/g,
  /\b(?:\d+(?:\.\d+)?)\s*%\s*(?:fat|milk\s*fat)?\b/g,
  /\b(low[-\s]?fat|full[-\s]?fat|half[-\s]?fat|semi[-\s]?skimmed|skimmed|whole)\b/g,
  /\b(cooked|uncooked|raw|dry|dried|drained)\s+weight\b/g,
  /\b(cooked|raw|grilled|fried|pan[-\s]?fried|deep[-\s]?fried|boiled|baked|roasted|steamed|poached|scrambled|homemade|air[-\s]?fried|toasted)\b/g,
  /\b(dry|dried|fresh|frozen|canned|tinned|smoked)\b/g,
];

/** Apply patterns, collecting what was removed as qualifiers. */
function strip(text: string, patterns: RegExp[], into: string[]): string {
  let out = text;
  for (const pattern of patterns) {
    out = out.replace(new RegExp(pattern.source, pattern.flags), (match) => {
      const note = match.trim().replace(/\s+/g, ' ');
      if (note) into.push(note);
      return ' ';
    });
  }
  return out;
}

/** True when the clause is about removing something rather than eating it. */
function isPreparationOnly(qualifiers: string[]): boolean {
  return qualifiers.some((q) =>
    /\b(drained|removed|discarded|poured off|rinsed|strained|without|no )\b/.test(q),
  );
}

/** Words that carry no food meaning and are dropped from the match phrase. */
const STOPWORDS = new Set([
  'of', 'the', 'a', 'an', 'some', 'my', 'with', 'and', 'plus', 'about',
  'approx', 'approximately', 'roughly', 'around', 'ate', 'had', 'eat',
  'i', 'it', 'is', 'was', 'were', 'are', 'this', 'that', 'for', 'to',
  'big', 'small', 'large', 'medium', 'x', 'whole', 'total', 'each',
  'which', 'containing', 'contains', 'contain', 'has', 'have',
]);

/** Nouns that are only ever left behind by a removal phrase, never a food here. */
const PREP_NOUNS = new Set(['oil', 'fat', 'skin', 'water', 'brine', 'liquid', 'sauce', 'dressing', 'syrup', 'marinade']);

function cleanPhrase(text: string): string {
  return text
    .replace(/[.!?"'`()]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !STOPWORDS.has(w))
    .join(' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Stated nutrition
// ---------------------------------------------------------------------------

const PER_100_PATTERNS: RegExp[] = [
  /\bper\s*100\s*(?:g|gr|grams?|ml|millilit(?:re|er)s?)\b/g,
  /\/\s*100\s*(?:g|ml)\b/g,
  /\b100\s*(?:g|gr|grams?|ml)\s+(?=contains?\b|has\b|is\b|=|provides?\b)/g,
  /\bin\s+100\s*(?:g|ml)\b/g,
];

const PER_UNIT_PATTERNS: RegExp[] = [
  /\bper\s+(?:scoop|serving|portion|can|tin|slice|piece|bar|bottle|unit|egg|package|packet|pack)\b/g,
  /\beach\s+(?:is|has|contains?|=)\b/g,
];

/**
 * "one scoop is 126 kcal" — per-unit, but "one scoop" is also the quantity, so
 * only the verb is consumed and the count survives for the quantity pass.
 */
const PER_UNIT_KEEPING_COUNT =
  /\b((?:\d+(?:\.\d+)?|one|a|an)\s+(?:scoop|serving|portion|can|tin|slice|piece|bar|bottle|egg|package|packet|pack)s?)\s+(?:is|has|contains?|=)\b/g;

/** The numeric fields of `StatedNutrition` — everything but the basis. */
type NutrientKey = Exclude<keyof StatedNutrition, 'basis'>;

/**
 * Words that turn a macro name back into a food name.
 *
 * "45 g protein powder" is forty-five grams of powder, not forty-five grams of
 * protein — and reading it the wrong way turns a 190 kcal scoop into a stated
 * macro that then overrides the real one. "20 g protein" with nothing after it
 * still parses as a macro, which is what people actually mean.
 */
const NOT_A_MACRO = '(?!\\s*(?:powder|shake|bar|drink|isolate|blend|mix|supplement|free|content))';

const NUTRIENT_PATTERNS: { key: NutrientKey; res: RegExp[] }[] = [
  {
    key: 'calories',
    res: [
      /(\d+(?:\.\d+)?)\s*(?:kcal|calories|calorie|cals|cal)\b/g,
      /\b(?:kcal|calories)\s*[:=]\s*(\d+(?:\.\d+)?)/g,
    ],
  },
  {
    key: 'protein',
    res: [
      new RegExp(String.raw`(\d+(?:\.\d+)?)\s*g(?:rams?)?\s+(?:of\s+)?protein\b` + NOT_A_MACRO, 'g'),
      /\bprotein\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g\b/g,
    ],
  },
  {
    key: 'carbs',
    res: [
      new RegExp(String.raw`(\d+(?:\.\d+)?)\s*g(?:rams?)?\s+(?:of\s+)?carb(?:s|ohydrates?)?\b` + NOT_A_MACRO, 'g'),
      /\bcarb(?:s|ohydrates?)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g\b/g,
    ],
  },
  {
    key: 'fat',
    res: [
      new RegExp(String.raw`(\d+(?:\.\d+)?)\s*g(?:rams?)?\s+(?:of\s+)?fat\b` + NOT_A_MACRO, 'g'),
      /\bfat\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g\b/g,
    ],
  },
  {
    key: 'fiber',
    res: [
      new RegExp(String.raw`(\d+(?:\.\d+)?)\s*g(?:rams?)?\s+(?:of\s+)?fib(?:re|er)\b` + NOT_A_MACRO, 'g'),
      /\bfib(?:re|er)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g\b/g,
    ],
  },
];

function extractNutrition(text: string): { stated?: StatedNutrition; rest: string } {
  let rest = text;
  let basis: FactBasis = 'total';

  rest = rest.replace(PER_UNIT_KEEPING_COUNT, (_m, count: string) => {
    basis = 'perUnit';
    return ` ${count} `;
  });
  for (const pattern of PER_100_PATTERNS) {
    const next = rest.replace(pattern, () => {
      basis = 'per100';
      return ' ';
    });
    rest = next;
  }
  if (basis === 'total') {
    for (const pattern of PER_UNIT_PATTERNS) {
      rest = rest.replace(pattern, () => {
        basis = 'perUnit';
        return ' ';
      });
    }
  }

  const stated: StatedNutrition = { basis };
  let found = false;
  for (const { key, res } of NUTRIENT_PATTERNS) {
    for (const re of res) {
      rest = rest.replace(re, (_m, value: string) => {
        if (stated[key] == null) {
          stated[key] = Number(value);
          found = true;
        }
        return ' ';
      });
    }
  }

  // "which is", "that is", "=" left dangling once its number was consumed.
  rest = rest.replace(/\b(?:which|that)\s+(?:is|are|has|contains?)\b/g, ' ').replace(/=/g, ' ');

  return { stated: found ? stated : undefined, rest };
}

// ---------------------------------------------------------------------------
// Quantity
// ---------------------------------------------------------------------------

const QUANTITY_WITH_UNIT = new RegExp(
  `\\b(\\d+(?:\\.\\d+)?|${NUMBER_WORD_RE})\\s*(${UNIT_RE})\\b`,
  'i',
);

/** A bare count in front of a food: "3 bananas", "1 bread roll". */
const BARE_COUNT = new RegExp(`^\\s*(\\d+(?:\\.\\d+)?|${NUMBER_WORD_RE})\\s+(?=\\S)`, 'i');

/** A unit with no number at all: "a package of rice" → one package. */
const LONE_UNIT = new RegExp(`\\b(${UNIT_RE})\\b`, 'i');

function extractQuantity(text: string): { quantity?: Quantity; rest: string } {
  const withUnit = QUANTITY_WITH_UNIT.exec(text);
  if (withUnit) {
    const amount = toNumber(withUnit[1].toLowerCase());
    const def = UNITS[withUnit[2].toLowerCase()];
    if (amount != null && def) {
      const quantity = { amount: amount * def.factor, unit: def.unit, text: withUnit[0].trim() };
      const without = text.replace(withUnit[0], ' ');
      // "two eggs" is a count *and* the only word naming the food. Removing the
      // unit would leave nothing behind and the food would vanish, so in that
      // case only the number is consumed.
      if (isCountable(def.unit) && cleanPhrase(without).length === 0) {
        return { quantity, rest: text.replace(withUnit[1], ' ') };
      }
      return { quantity, rest: without };
    }
  }

  const lone = LONE_UNIT.exec(text);
  if (lone) {
    const def = UNITS[lone[1].toLowerCase()];
    // A countable unit with no number in front means one of them: "a can of
    // tuna" already matched above, so what reaches here is "this protein bar".
    // The word is left in the phrase on purpose — with no number attached it is
    // as likely to be part of the food's name ("protein bar", "energy bar") as
    // it is to be a unit, and dropping it would rename the food.
    if (def && isCountable(def.unit)) {
      return { quantity: { amount: 1, unit: def.unit, text: lone[0].trim() }, rest: text };
    }
  }

  const bare = BARE_COUNT.exec(text);
  if (bare) {
    const amount = toNumber(bare[1].toLowerCase());
    // A bare "a"/"an" carries no information worth preserving as a count.
    if (amount != null && !/^(a|an)$/i.test(bare[1])) {
      return {
        quantity: { amount, unit: 'piece', text: bare[0].trim() },
        rest: text.replace(bare[0], ' '),
      };
    }
  }

  return { rest: text };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Break a free-text meal description into the foods it names.
 *
 * Returns an empty mention list for an empty description — a photo-only meal
 * has nothing stated to honour, and the estimator treats that case differently.
 */
export function parseMealDescription(description: string | undefined): ParsedMeal {
  const text = normalizeNumerics((description ?? '').toLowerCase()).trim();
  if (!text) return { mentions: [] };

  const clauses = text
    .split(SEPARATORS)
    .map((c) => c.trim())
    .filter(Boolean);

  const mentions: FoodMention[] = [];

  for (const clause of clauses) {
    const qualifiers: string[] = [];
    let work = strip(clause, REMOVAL_PATTERNS, qualifiers);
    const { stated, rest } = extractNutrition(work);
    work = strip(rest, QUALIFIER_PATTERNS, qualifiers);
    const { quantity, rest: afterQuantity } = extractQuantity(work);
    const phrase = cleanPhrase(afterQuantity);

    const words = phrase.split(' ').filter(Boolean);
    const onlyPrepNouns = words.length > 0 && words.every((w) => PREP_NOUNS.has(w));
    // A clause that named no food is a note about the previous one: "tuna, oil
    // drained" and "300 ml milk, which is 150 kcal" both arrive here.
    const isNote = words.length === 0 || (onlyPrepNouns && isPreparationOnly(qualifiers));

    if (isNote && mentions.length > 0) {
      const previous = mentions[mentions.length - 1];
      previous.qualifiers.push(...qualifiers);
      previous.raw = `${previous.raw}, ${clause}`;
      if (stated) previous.stated = mergeStated(previous.stated, stated);
      if (quantity && !previous.quantity) previous.quantity = quantity;
      continue;
    }
    // A clause that named no food but *did* state calories ("3 cans are 570
    // kcal") has nowhere to attach. Dropping it would silently discard a number
    // the user gave us, which is the whole failure class this file exists to
    // prevent — so it becomes an unnamed component instead, and stays visible.
    if (isNote && !stated) continue;

    mentions.push({ raw: clause, phrase: phrase || 'meal', quantity, qualifiers, stated });
  }

  return { mentions };
}

/**
 * Fold a trailing "…, 20 g protein" clause into the numbers already gathered.
 *
 * Fields already set win, because the first clause is the one that named the
 * food. The basis comes from whichever statement established it.
 */
function mergeStated(previous: StatedNutrition | undefined, next: StatedNutrition): StatedNutrition {
  if (!previous) return next;
  return {
    basis: previous.basis !== 'total' ? previous.basis : next.basis,
    calories: previous.calories ?? next.calories,
    protein: previous.protein ?? next.protein,
    carbs: previous.carbs ?? next.carbs,
    fat: previous.fat ?? next.fat,
    fiber: previous.fiber ?? next.fiber,
  };
}

/**
 * The total calories the user stated for a mention, when that can be worked out
 * from what they wrote. `undefined` means they stated a *rate* (per 100 g) with
 * no amount to apply it to — still useful to the model, but not a hard number.
 */
export function statedCalories(mention: FoodMention): number | undefined {
  const stated = mention.stated;
  if (!stated || stated.calories == null) return undefined;
  if (stated.basis === 'total') return stated.calories;
  if (stated.basis === 'perUnit') {
    const amount = mention.quantity && isCountable(mention.quantity.unit) ? mention.quantity.amount : 1;
    return stated.calories * amount;
  }
  // per100
  const q = mention.quantity;
  if (q && (q.unit === 'g' || q.unit === 'ml')) return (stated.calories * q.amount) / 100;
  return undefined;
}

/** A one-line rendering of a mention, for the model prompt and for messages. */
export function describeMention(mention: FoodMention): string {
  // The quantity text is skipped when the phrase already contains it, which
  // happens for a bare unit that is also part of the food's name ("protein bar").
  const q = mention.quantity;
  const showQuantity = q && !mention.phrase.includes(q.text.toLowerCase());
  const bits = [showQuantity ? q.text : undefined, mention.phrase].filter(Boolean).join(' ');
  const notes = mention.qualifiers.length ? ` (${[...new Set(mention.qualifiers)].join(', ')})` : '';
  return `${bits}${notes}`.trim();
}
