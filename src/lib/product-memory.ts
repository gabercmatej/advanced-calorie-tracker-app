/**
 * Memory of the products you actually buy.
 *
 * Scanning a barcode produces the one thing a vision model can never produce:
 * the real label. Throwing that away after a single meal is wasteful twice
 * over — the next time you eat the same protein powder the app guesses at
 * something it already knew exactly, and it pays a model call to do it.
 *
 * So a successful scan is remembered, and generic words in a later description
 * resolve back to it: "1 scoop protein powder" becomes *your* protein powder,
 * with the label's numbers, without a model call. Buying a different one and
 * scanning it makes that one the new default for the same generic word.
 *
 * The deliberate restraint here is that a scan only claims a generic word when
 * its name clearly maps to one. A scanned tin of paprika does not become "my
 * milk" just because it was scanned most recently — an over-eager default would
 * be a worse error than no default at all, because it would be invisible.
 *
 * Pure functions over a plain array. Persistence lives in
 * `hooks/use-saved-products.ts`; nothing here touches storage or the network.
 */

import type { Macros } from '@/types';

/** A generic food word a product can become the user's default for. */
export type ProductCategory =
  | 'protein-powder'
  | 'protein-bar'
  | 'milk'
  | 'greek-yogurt'
  | 'yogurt'
  | 'cheese'
  | 'cottage-cheese'
  | 'bread'
  | 'cereal'
  | 'oats'
  | 'rice'
  | 'pasta'
  | 'tuna'
  | 'peanut-butter'
  | 'butter'
  | 'oil'
  | 'sauce'
  | 'juice'
  | 'soda'
  | 'chocolate'
  | 'eggs';

/** Nutrition for one unit of something. */
export interface ProductNutrition {
  calories: number;
  macros: Macros;
  fiber?: number;
}

export interface SavedProduct {
  /** EAN/UPC. The identity of the product — one row per barcode. */
  barcode: string;
  /** The label name as the database gave it, brand included. */
  name: string;
  /** Nutrition for one serving, and what that serving is called. */
  perServing: ProductNutrition & { label: string };
  /** Per 100 g/ml, when the database had it — lets a weight scale exactly. */
  per100?: ProductNutrition;
  /** Grams (or ml) in one serving, when the label stated it. */
  servingGrams?: number;
  /** True when the base unit is millilitres rather than grams. */
  liquid?: boolean;
  /** The generic word this product answers to, if any. */
  category?: ProductCategory;
  /** Every phrase that resolves to this product, most specific first. */
  aliases: string[];
  /** Epoch millis of the most recent scan. Recency decides the default. */
  scannedAt: number;
  /** Epoch millis of the last meal it was used in. */
  lastUsedAt?: number;
  /** How many meals it has been resolved into. */
  timesUsed: number;
}

// ---------------------------------------------------------------------------
// Category detection
// ---------------------------------------------------------------------------

/**
 * Name patterns → generic category, most specific first.
 *
 * Order is load-bearing: "peanut butter" must be tested before "butter", "greek
 * yogurt" before "yogurt", and "protein bar" before "protein powder", or a jar
 * of peanut butter becomes the default butter.
 */
const CATEGORY_RULES: { category: ProductCategory; test: RegExp; not?: RegExp }[] = [
  { category: 'peanut-butter', test: /\b(peanut|almond|cashew|hazelnut|nut)\s*butter\b|\bnutella\b/ },
  { category: 'greek-yogurt', test: /\b(greek|skyr|icelandic)\b.*\byogh?urt\b|\bskyr\b|\bgreek\s*yogh?urt\b/ },
  { category: 'cottage-cheese', test: /\bcottage\s*cheese\b|\bquark\b|\bskuta\b/ },
  { category: 'protein-bar', test: /\bprotein\s*bar\b|\bbar\b.*\bprotein\b|\bflapjack\b/ },
  { category: 'protein-powder', test: /\bwhey\b|\bprotein\s*(powder|shake|blend|isolate)\b|\bgainer\b|\bisolate\b|\bcasein\b|\bprotein\b(?!\s*bar)/ },
  { category: 'milk', test: /\bmilk\b|\bmleko\b/, not: /\bmilk\s*chocolate\b|\bchocolate\s*milk\b|\bcondensed\b|\bpowder(ed)?\s*milk\b/ },
  { category: 'yogurt', test: /\byogh?urt\b|\bjogurt\b/ },
  { category: 'cheese', test: /\bcheese\b|\bmozzarella\b|\bcheddar\b|\bgouda\b|\bfeta\b|\bparmesan\b|\bedam\b|\bemmental\b/ },
  { category: 'bread', test: /\bbread\b|\bloaf\b|\bbaguette\b|\bciabatta\b|\btoast\b|\bkruh\b|\bwrap\b|\btortilla\b|\brolls?\b|\bbuns?\b/ },
  { category: 'oats', test: /\boats\b|\boatmeal\b|\bporridge\b|\brolled\s*oats\b|\bovsen\b/ },
  { category: 'cereal', test: /\bcereal\b|\bgranola\b|\bmuesli\b|\bcorn\s*flakes\b|\bcheerios\b|\bbran\b/ },
  { category: 'tuna', test: /\btuna\b|\btunina\b/ },
  { category: 'rice', test: /\brice\b|\brizo\b/, not: /\brice\s*(cakes?|milk|drink)\b/ },
  { category: 'pasta', test: /\bpasta\b|\bspaghetti\b|\bpenne\b|\bfusilli\b|\bmacaroni\b|\bnoodles?\b|\btestenine\b/ },
  { category: 'eggs', test: /\beggs?\b|\bjajca\b/ },
  { category: 'butter', test: /\bbutter\b|\bmargarine\b|\bspread\b/ },
  { category: 'oil', test: /\b(olive|sunflower|rapeseed|canola|coconut|vegetable)\s*oil\b|\boil\b/ },
  { category: 'sauce', test: /\bsauce\b|\bketchup\b|\bmayo(nnaise)?\b|\bpesto\b|\bdressing\b/ },
  { category: 'chocolate', test: /\bchocolate\b|\bcokolad\w*\b/ },
  { category: 'juice', test: /\bjuice\b|\bsok\b|\bnectar\b/ },
  { category: 'soda', test: /\bcola\b|\bsoda\b|\blemonade\b|\benergy\s*drink\b|\bpepsi\b|\bfanta\b|\bsprite\b/ },
];

/** The generic phrases each category answers to. */
const CATEGORY_ALIASES: Record<ProductCategory, string[]> = {
  'protein-powder': ['protein powder', 'protein shake', 'whey', 'whey protein', 'gainer', 'protein', 'shake'],
  'protein-bar': ['protein bar', 'bar'],
  milk: ['milk'],
  'greek-yogurt': ['greek yogurt', 'greek yoghurt', 'skyr', 'yogurt', 'yoghurt'],
  yogurt: ['yogurt', 'yoghurt'],
  cheese: ['cheese'],
  'cottage-cheese': ['cottage cheese', 'quark'],
  bread: ['bread', 'bread roll', 'roll', 'toast', 'loaf'],
  cereal: ['cereal', 'granola', 'muesli'],
  oats: ['oats', 'oatmeal', 'porridge'],
  rice: ['rice'],
  pasta: ['pasta', 'spaghetti', 'noodles'],
  tuna: ['tuna'],
  'peanut-butter': ['peanut butter', 'nut butter'],
  butter: ['butter', 'margarine'],
  oil: ['oil', 'olive oil'],
  sauce: ['sauce', 'ketchup', 'mayo', 'mayonnaise', 'dressing'],
  juice: ['juice'],
  soda: ['soda', 'cola', 'soft drink'],
  chocolate: ['chocolate'],
  eggs: ['egg', 'eggs'],
};

/**
 * Every generic food word, across all categories.
 *
 * Used to decide whether an alias that matched is a brand word or a category
 * word — so "chocolate", which is both part of one product's name and the
 * generic word for another category, never counts as a specific match.
 */
const GENERIC_WORDS = new Set(Object.values(CATEGORY_ALIASES).flat());

/** The generic category a product name maps to, or undefined if none is clear. */
export function categoryFor(name: string): ProductCategory | undefined {
  const text = ` ${name.toLowerCase().replace(/[^a-z0-9%]+/g, ' ')} `;
  for (const rule of CATEGORY_RULES) {
    if (rule.not?.test(text)) continue;
    if (rule.test.test(text)) return rule.category;
  }
  return undefined;
}

/** Words in a product name that identify it but are not generic categories. */
function nameAliases(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/\(per\s*100\s*g\)/g, ' ')
    .replace(/[^a-z0-9%\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  const words = cleaned.split(' ').filter((w) => w.length > 2);
  // The full name, then progressively shorter leading phrases, so "Battery
  // Nutrition Rebel Gainer Chocolate" also answers to "battery nutrition rebel".
  const out = new Set<string>([cleaned]);
  for (let len = Math.min(words.length, 4); len >= 2; len--) {
    out.add(words.slice(0, len).join(' '));
  }
  for (const word of words) if (word.length > 3) out.add(word);
  return [...out];
}

/**
 * Every phrase that should resolve to this product: its own name and its
 * category's generic words. Longest first, so the most specific match wins.
 */
export function aliasesFor(name: string, category?: ProductCategory): string[] {
  const generic = category ? CATEGORY_ALIASES[category] : [];
  const all = new Set<string>([...nameAliases(name), ...generic]);
  return [...all].sort((a, b) => b.length - a.length);
}

// ---------------------------------------------------------------------------
// Remembering
// ---------------------------------------------------------------------------

export interface ScannedProductInput {
  barcode: string;
  name: string;
  perServing: ProductNutrition & { label: string };
  per100?: ProductNutrition;
  servingGrams?: number;
  liquid?: boolean;
}

/**
 * Record a successful scan.
 *
 * The list is kept newest-first, which is also the default order: scanning a
 * new protein powder puts it in front of the old one, so the generic phrase
 * "protein powder" starts resolving to the new tub from that moment. The old
 * one is not deleted — it still resolves by its own name, because a half-used
 * tub at the back of the cupboard is still a real food.
 */
export function rememberProduct(products: SavedProduct[], scan: ScannedProductInput, now = Date.now()): SavedProduct[] {
  const category = categoryFor(scan.name);
  const existing = products.find((p) => p.barcode === scan.barcode);
  const saved: SavedProduct = {
    barcode: scan.barcode,
    name: scan.name,
    perServing: scan.perServing,
    per100: scan.per100,
    servingGrams: scan.servingGrams,
    liquid: scan.liquid,
    category,
    aliases: aliasesFor(scan.name, category),
    scannedAt: now,
    lastUsedAt: existing?.lastUsedAt,
    timesUsed: existing?.timesUsed ?? 0,
  };
  return [saved, ...products.filter((p) => p.barcode !== scan.barcode)];
}

/** Note that a product was used in a meal, for ranking. */
export function markProductUsed(products: SavedProduct[], barcode: string, now = Date.now()): SavedProduct[] {
  return products.map((p) =>
    p.barcode === barcode ? { ...p, lastUsedAt: now, timesUsed: p.timesUsed + 1 } : p,
  );
}

/** The product a generic category currently resolves to — the newest scan of it. */
export function defaultForCategory(
  products: SavedProduct[],
  category: ProductCategory,
): SavedProduct | undefined {
  return products
    .filter((p) => p.category === category)
    .sort((a, b) => b.scannedAt - a.scannedAt)[0];
}

// ---------------------------------------------------------------------------
// Resolving
// ---------------------------------------------------------------------------

export interface ProductMatch {
  product: SavedProduct;
  /** The alias that matched, so callers can explain the resolution. */
  matched: string;
  /** True when it matched by product name rather than a generic word. */
  specific: boolean;
}

/** Whole-word containment — "protein" must not match inside "proteins-rich". */
function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(haystack);
}

/**
 * Find the saved product a phrase refers to.
 *
 * A specific name always beats a generic word, and a generic word only ever
 * resolves to the current default for that category — so "1 scoop protein
 * powder" follows whichever tub was scanned last, while "rebel gainer" keeps
 * pointing at the older one by name.
 */
export function resolveProduct(products: SavedProduct[], phrase: string): ProductMatch | undefined {
  const text = ` ${phrase.toLowerCase().trim()} `.replace(/\s+/g, ' ');
  if (!text.trim()) return undefined;

  const specificHits: ProductMatch[] = [];
  const genericHits: ProductMatch[] = [];

  for (const product of products) {
    // Every alias is checked, not just the first that hits. A brand word must
    // be able to win over a generic one on the same product — otherwise "rebel
    // gainer" matches on "gainer", is treated as generic, and follows whichever
    // tub was scanned most recently instead of the one it names.
    let bestSpecific: string | undefined;
    let bestGeneric: string | undefined;
    for (const alias of product.aliases) {
      if (!containsPhrase(text, alias)) continue;
      if (GENERIC_WORDS.has(alias)) {
        if (!bestGeneric || alias.length > bestGeneric.length) bestGeneric = alias;
      } else if (!bestSpecific || alias.length > bestSpecific.length) {
        bestSpecific = alias;
      }
    }
    if (bestSpecific) specificHits.push({ product, matched: bestSpecific, specific: true });
    else if (bestGeneric) genericHits.push({ product, matched: bestGeneric, specific: false });
  }

  if (specificHits.length) {
    return specificHits.sort(
      (a, b) => b.matched.length - a.matched.length || b.product.scannedAt - a.product.scannedAt,
    )[0];
  }

  // A generic word only ever resolves to the current default for its category,
  // so "protein powder" follows the newest tub while everything else stays put.
  const eligible = genericHits.filter(
    (hit) =>
      hit.product.category &&
      defaultForCategory(products, hit.product.category)?.barcode === hit.product.barcode,
  );
  return eligible.sort(
    (a, b) => b.matched.length - a.matched.length || b.product.scannedAt - a.product.scannedAt,
  )[0];
}
