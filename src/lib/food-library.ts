/**
 * The reference food library.
 *
 * Every food is stored **per 100 g** (or per 100 ml for liquids) with a short
 * list of named portions on top. That ordering matters: per-serving tables go
 * wrong the moment you eat something that isn't the listed serving, whereas a
 * per-100 g base scales exactly to whatever went on the scale, and the named
 * portions exist only so you rarely have to weigh anything.
 *
 * This is the cheapest logging path in the app — a lookup, not an estimate, so
 * it costs nothing and is more accurate than a photo. The vision model stays
 * for food that genuinely isn't in here: restaurant plates, mixed home cooking,
 * anything you can't name.
 *
 * Values are rounded from standard composition tables. They are reference
 * figures for a personal tracker, not laboratory analyses of the specific
 * product in your fridge — a barcode scan beats them whenever one exists.
 *
 * **Carbohydrate is total carbohydrate, fibre included** — the US convention,
 * not the EU one where the label figure excludes fibre. Mixing the two is an
 * easy and invisible mistake, so it is asserted in the tests: fibre may never
 * exceed carbs, and calories must roughly match 4/4/9 on the macros.
 */

export type FoodGroup =
  | 'protein'
  | 'dairy'
  | 'carbs'
  | 'legumes'
  | 'veg'
  | 'fruit'
  | 'fats'
  | 'sauces'
  | 'snacks'
  | 'drinks'
  | 'meals';

export const FOOD_GROUP_LABEL: Record<FoodGroup, string> = {
  protein: 'Meat, fish & eggs',
  dairy: 'Dairy & protein',
  carbs: 'Grains & starches',
  legumes: 'Beans & lentils',
  veg: 'Vegetables',
  fruit: 'Fruit',
  fats: 'Nuts, seeds & fats',
  sauces: 'Sauces & condiments',
  snacks: 'Snacks & sweets',
  drinks: 'Drinks',
  meals: 'Prepared & takeaway',
};

export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

/** A named amount, so common portions don't have to be weighed. */
export interface Portion {
  label: string;
  grams: number;
}

export interface LibraryFood {
  id: string;
  name: string;
  /** Extra search terms, including common regional names. */
  aliases?: string[];
  group: FoodGroup;
  /** Composition per 100 g, or per 100 ml where `liquid` is set. */
  per100: Nutrients;
  /** Portions, most common first. The first is the default when logging. */
  portions: Portion[];
  /** True when the base is 100 ml rather than 100 g. */
  liquid?: boolean;
}

/** Compact constructor — the corpus below is long enough without boilerplate. */
function f(
  id: string,
  name: string,
  group: FoodGroup,
  [calories, protein, carbs, fat, fiber]: [number, number, number, number, number],
  portions: [string, number][],
  aliases?: string[],
  liquid?: boolean,
): LibraryFood {
  return {
    id,
    name,
    group,
    per100: { calories, protein, carbs, fat, fiber },
    portions: portions.map(([label, grams]) => ({ label, grams })),
    ...(aliases ? { aliases } : {}),
    ...(liquid ? { liquid } : {}),
  };
}

// A few portion shorthands that repeat constantly.
const G100: [string, number] = ['100 g', 100];
const ML100: [string, number] = ['100 ml', 100];

export const FOOD_LIBRARY: LibraryFood[] = [
  // -------------------------------------------------------------------------
  // Meat, fish & eggs — the backbone of a high-protein cut.
  // Cooked weights unless stated, because that is what ends up on the plate.
  // -------------------------------------------------------------------------
  f('chicken-breast', 'Chicken breast, cooked', 'protein', [165, 31, 0, 3.6, 0], [G100, ['1 breast (170 g)', 170], ['1 fillet (120 g)', 120]], ['chicken']),
  f('chicken-thigh', 'Chicken thigh, cooked, skinless', 'protein', [179, 24, 0, 8.8, 0], [G100, ['1 thigh (90 g)', 90]]),
  f('chicken-whole-roast', 'Roast chicken, meat only', 'protein', [190, 28, 0, 8, 0], [G100]),
  f('chicken-wings', 'Chicken wings, roasted', 'protein', [266, 24, 0, 18.5, 0], [G100, ['1 wing (35 g)', 35]]),
  f('chicken-mince', 'Chicken mince, cooked', 'protein', [189, 27, 0, 8.5, 0], [G100], ['ground chicken']),
  f('turkey-breast', 'Turkey breast, cooked', 'protein', [135, 30, 0, 1, 0], [G100, ['1 slice (30 g)', 30]], ['turkey']),
  f('turkey-mince', 'Turkey mince 5%, cooked', 'protein', [170, 27, 0, 7, 0], [G100], ['ground turkey']),
  f('beef-mince-5', 'Beef mince 5% fat, cooked', 'protein', [170, 26, 0, 7, 0], [G100], ['lean mince', 'ground beef']),
  f('beef-mince-20', 'Beef mince 20% fat, cooked', 'protein', [272, 24, 0, 19, 0], [G100], ['ground beef']),
  f('beef-steak', 'Beef steak, sirloin, cooked', 'protein', [212, 30, 0, 10, 0], [G100, ['1 steak (200 g)', 200]], ['steak']),
  f('beef-ribeye', 'Ribeye steak, cooked', 'protein', [291, 25, 0, 21, 0], [G100, ['1 steak (250 g)', 250]]),
  f('beef-brisket', 'Beef brisket, slow cooked', 'protein', [246, 28, 0, 15, 0], [G100]),
  f('pork-loin', 'Pork loin, cooked', 'protein', [143, 26, 0, 4, 0], [G100, ['1 chop (150 g)', 150]], ['pork']),
  f('pork-mince', 'Pork mince, cooked', 'protein', [250, 26, 0, 16, 0], [G100]),
  f('bacon', 'Bacon, grilled', 'protein', [320, 30, 1, 22, 0], [['1 rasher (25 g)', 25], G100]),
  f('sausage-pork', 'Pork sausage, cooked', 'protein', [290, 15, 9, 22, 1], [['1 sausage (60 g)', 60], G100], ['sausages']),
  f('sausage-chicken', 'Chicken sausage, cooked', 'protein', [172, 17, 3, 10, 0], [['1 sausage (60 g)', 60], G100]),
  f('ham', 'Ham, sliced', 'protein', [107, 18, 1.5, 3, 0], [['1 slice (25 g)', 25], G100]),
  f('salami', 'Salami', 'protein', [378, 22, 2, 31, 0], [['1 slice (10 g)', 10], G100]),
  f('prosciutto', 'Prosciutto', 'protein', [270, 26, 0, 18, 0], [['1 slice (15 g)', 15], G100]),
  f('lamb-chop', 'Lamb chop, cooked', 'protein', [282, 25, 0, 20, 0], [G100, ['1 chop (100 g)', 100]], ['lamb']),
  f('veal', 'Veal, cooked', 'protein', [172, 31, 0, 5, 0], [G100]),
  f('duck-breast', 'Duck breast, skinless, cooked', 'protein', [201, 24, 0, 11, 0], [G100]),
  f('liver-chicken', 'Chicken liver, cooked', 'protein', [167, 24, 1, 6.5, 0], [G100]),
  f('salmon', 'Salmon, cooked', 'protein', [208, 22, 0, 13, 0], [G100, ['1 fillet (130 g)', 130]]),
  f('salmon-smoked', 'Smoked salmon', 'protein', [117, 18, 0, 4.3, 0], [['1 slice (25 g)', 25], G100]),
  f('tuna-canned', 'Tuna, canned in water, drained', 'protein', [116, 26, 0, 1, 0], [['1 can (145 g)', 145], G100], ['tuna']),
  f('tuna-steak', 'Tuna steak, cooked', 'protein', [184, 30, 0, 6, 0], [G100]),
  f('cod', 'Cod, cooked', 'protein', [105, 23, 0, 0.9, 0], [G100, ['1 fillet (150 g)', 150]], ['white fish']),
  f('haddock', 'Haddock, cooked', 'protein', [112, 24, 0, 0.9, 0], [G100]),
  f('sea-bass', 'Sea bass, cooked', 'protein', [124, 24, 0, 2.6, 0], [G100]),
  f('mackerel', 'Mackerel, cooked', 'protein', [262, 24, 0, 18, 0], [G100, ['1 fillet (90 g)', 90]]),
  f('sardines', 'Sardines, canned in oil, drained', 'protein', [208, 25, 0, 11, 0], [['1 tin (90 g)', 90], G100]),
  f('prawns', 'Prawns, cooked', 'protein', [99, 24, 0.2, 0.3, 0], [G100], ['shrimp']),
  f('mussels', 'Mussels, cooked', 'protein', [172, 24, 7, 4.5, 0], [G100]),
  f('squid', 'Squid, cooked', 'protein', [175, 18, 8, 7, 0], [G100], ['calamari']),
  f('egg-whole', 'Egg, whole', 'protein', [143, 12.6, 0.7, 9.5, 0], [['1 large egg (50 g)', 50], ['2 eggs (100 g)', 100], ['3 eggs (150 g)', 150]], ['eggs']),
  f('egg-white', 'Egg white', 'protein', [52, 11, 0.7, 0.2, 0], [['1 white (33 g)', 33], G100], ['egg whites']),
  f('tofu-firm', 'Tofu, firm', 'protein', [144, 17, 3, 9, 2], [G100, ['1 block (280 g)', 280]], ['tofu']),
  f('tofu-silken', 'Tofu, silken', 'protein', [61, 7, 2, 3, 0.2], [G100]),
  f('tempeh', 'Tempeh', 'protein', [192, 20, 8, 11, 5], [G100]),
  f('seitan', 'Seitan', 'protein', [141, 25, 14, 2, 1], [G100]),
  f('quorn-mince', 'Quorn mince', 'protein', [105, 15, 10, 2, 6], [G100]),
  f('soy-mince', 'Soya mince, cooked', 'protein', [110, 17, 6, 1.5, 4], [G100], ['tvp']),

  // -------------------------------------------------------------------------
  // Dairy & protein products
  // -------------------------------------------------------------------------
  f('greek-yogurt-0', 'Greek yogurt, 0% fat', 'dairy', [59, 10, 3.6, 0.4, 0], [['1 pot (170 g)', 170], G100, ['1 tub (500 g)', 500]], ['yogurt', 'yoghurt']),
  f('greek-yogurt-5', 'Greek yogurt, 5% fat', 'dairy', [97, 9, 4, 5, 0], [['1 pot (170 g)', 170], G100]),
  f('skyr', 'Skyr', 'dairy', [63, 11, 4, 0.2, 0], [['1 pot (150 g)', 150], G100]),
  f('yogurt-natural', 'Natural yogurt, whole', 'dairy', [61, 3.5, 4.7, 3.3, 0], [G100]),
  f('cottage-cheese', 'Cottage cheese', 'dairy', [98, 11, 3.4, 4.3, 0], [G100, ['1 pot (300 g)', 300]]),
  f('cottage-cheese-low', 'Cottage cheese, low fat', 'dairy', [72, 12, 3, 1, 0], [G100, ['1 pot (300 g)', 300]]),
  f('quark', 'Quark, fat free', 'dairy', [68, 12, 4, 0.2, 0], [G100, ['1 pot (250 g)', 250]]),
  f('milk-whole', 'Milk, whole', 'dairy', [64, 3.4, 4.8, 3.6, 0], [['1 glass (250 ml)', 250], ML100], ['milk'], true),
  f('milk-semi', 'Milk, semi-skimmed', 'dairy', [49, 3.5, 4.8, 1.8, 0], [['1 glass (250 ml)', 250], ML100], ['2% milk'], true),
  f('milk-skimmed', 'Milk, skimmed', 'dairy', [35, 3.5, 5, 0.2, 0], [['1 glass (250 ml)', 250], ML100], undefined, true),
  f('almond-milk', 'Almond milk, unsweetened', 'dairy', [13, 0.5, 0.3, 1.1, 0.3], [['1 glass (250 ml)', 250], ML100], undefined, true),
  f('oat-milk', 'Oat milk', 'dairy', [46, 1, 7, 1.5, 0.8], [['1 glass (250 ml)', 250], ML100], undefined, true),
  f('soy-milk', 'Soya milk, unsweetened', 'dairy', [33, 3.3, 1.2, 1.8, 0.5], [['1 glass (250 ml)', 250], ML100], undefined, true),
  f('cheddar', 'Cheddar cheese', 'dairy', [403, 25, 1.3, 33, 0], [['1 slice (30 g)', 30], G100], ['cheese']),
  f('mozzarella', 'Mozzarella', 'dairy', [280, 22, 2.2, 20, 0], [['1 ball (125 g)', 125], G100]),
  f('mozzarella-light', 'Mozzarella, light', 'dairy', [180, 24, 3, 8, 0], [G100]),
  f('feta', 'Feta', 'dairy', [264, 14, 4, 21, 0], [['1 portion (30 g)', 30], G100]),
  f('parmesan', 'Parmesan', 'dairy', [392, 36, 3.2, 25, 0], [['1 tbsp grated (5 g)', 5], G100]),
  f('halloumi', 'Halloumi', 'dairy', [321, 22, 2.2, 25, 0], [['1 slice (30 g)', 30], G100]),
  f('cream-cheese', 'Cream cheese', 'dairy', [253, 6, 4, 24, 0], [['1 tbsp (15 g)', 15], G100]),
  f('cream-cheese-light', 'Cream cheese, light', 'dairy', [148, 9, 5, 10, 0], [['1 tbsp (15 g)', 15], G100]),
  f('goats-cheese', "Goat's cheese, soft", 'dairy', [268, 18, 2.5, 21, 0], [['1 portion (30 g)', 30], G100]),
  f('ricotta', 'Ricotta', 'dairy', [174, 11, 3, 13, 0], [G100]),
  f('butter', 'Butter', 'fats', [717, 0.9, 0.1, 81, 0], [['1 tsp (5 g)', 5], ['1 tbsp (14 g)', 14], G100]),
  f('cream-double', 'Double cream', 'dairy', [449, 1.7, 2.7, 48, 0], [['1 tbsp (15 g)', 15], G100], ['heavy cream']),
  f('creme-fraiche-light', 'Crème fraîche, light', 'dairy', [162, 3, 4, 15, 0], [['1 tbsp (15 g)', 15], G100]),
  f('whey-protein', 'Whey protein powder', 'dairy', [400, 80, 8, 6, 1], [['1 scoop (30 g)', 30], ['2 scoops (60 g)', 60], G100], ['protein powder', 'whey']),
  f('casein-protein', 'Casein protein powder', 'dairy', [370, 78, 6, 3, 1], [['1 scoop (30 g)', 30], G100]),
  f('vegan-protein', 'Plant protein powder', 'dairy', [380, 72, 8, 6, 5], [['1 scoop (30 g)', 30], G100]),
  f('protein-shake-rtd', 'Protein shake, ready to drink', 'dairy', [40, 8, 1.5, 0.4, 0], [['1 bottle (330 ml)', 330], ML100], undefined, true),
  f('protein-yogurt', 'High-protein yogurt pot', 'dairy', [61, 10, 4, 0.5, 0], [['1 pot (150 g)', 150], G100]),

  // -------------------------------------------------------------------------
  // Grains & starches — cooked weights, which is how they get served.
  // -------------------------------------------------------------------------
  f('rice-white-cooked', 'White rice, cooked', 'carbs', [130, 2.7, 28, 0.3, 0.4], [G100, ['1 portion (180 g)', 180], ['1 pouch (250 g)', 250]], ['rice']),
  f('rice-brown-cooked', 'Brown rice, cooked', 'carbs', [123, 2.7, 26, 1, 1.6], [G100, ['1 portion (180 g)', 180]]),
  f('rice-white-dry', 'White rice, dry', 'carbs', [360, 7, 79, 0.6, 1.3], [['1 portion (75 g)', 75], G100]),
  f('basmati-cooked', 'Basmati rice, cooked', 'carbs', [121, 3, 25, 0.4, 0.7], [G100, ['1 portion (180 g)', 180]]),
  f('pasta-cooked', 'Pasta, cooked', 'carbs', [158, 5.8, 31, 0.9, 1.8], [G100, ['1 portion (200 g)', 200]], ['spaghetti', 'penne', 'fusilli']),
  f('pasta-dry', 'Pasta, dry', 'carbs', [371, 13, 75, 1.5, 3.2], [['1 portion (80 g)', 80], G100]),
  f('pasta-wholewheat-cooked', 'Wholewheat pasta, cooked', 'carbs', [124, 5, 26, 0.5, 3.9], [G100, ['1 portion (200 g)', 200]]),
  f('noodles-egg', 'Egg noodles, cooked', 'carbs', [138, 4.5, 25, 2, 1.2], [G100, ['1 nest (140 g)', 140]]),
  f('rice-noodles', 'Rice noodles, cooked', 'carbs', [109, 0.9, 25, 0.2, 1], [G100]),
  f('potato-boiled', 'Potato, boiled', 'carbs', [87, 1.9, 20, 0.1, 1.8], [G100, ['1 medium (180 g)', 180]], ['potatoes']),
  f('potato-baked', 'Jacket potato, baked', 'carbs', [93, 2.5, 21, 0.1, 2.2], [['1 medium (200 g)', 200], G100]),
  f('potato-mash', 'Mashed potato, with butter', 'carbs', [113, 2, 17, 4.2, 1.5], [G100, ['1 portion (200 g)', 200]]),
  f('potato-roast', 'Roast potatoes', 'carbs', [149, 2.9, 26, 4.5, 2.3], [G100, ['1 portion (150 g)', 150]]),
  f('chips-oven', 'Oven chips', 'carbs', [162, 2.8, 27, 4.7, 2.6], [G100, ['1 portion (150 g)', 150]], ['fries']),
  f('sweet-potato', 'Sweet potato, baked', 'carbs', [90, 2, 21, 0.1, 3.3], [G100, ['1 medium (150 g)', 150]]),
  f('oats', 'Oats, dry', 'carbs', [379, 13, 68, 6.5, 10], [['1 portion (40 g)', 40], ['1 portion (60 g)', 60], G100], ['porridge', 'oatmeal']),
  f('porridge-water', 'Porridge, made with water', 'carbs', [68, 2.4, 12, 1.4, 1.7], [G100, ['1 bowl (250 g)', 250]]),
  f('quinoa-cooked', 'Quinoa, cooked', 'carbs', [120, 4.4, 21, 1.9, 2.8], [G100, ['1 portion (180 g)', 180]]),
  f('couscous-cooked', 'Couscous, cooked', 'carbs', [112, 3.8, 23, 0.2, 1.4], [G100, ['1 portion (180 g)', 180]]),
  f('bulgur-cooked', 'Bulgur wheat, cooked', 'carbs', [83, 3, 19, 0.2, 4.5], [G100]),
  f('bread-white', 'White bread', 'carbs', [265, 9, 49, 3.2, 2.7], [['1 slice (36 g)', 36], ['2 slices (72 g)', 72], G100], ['toast']),
  f('bread-wholemeal', 'Wholemeal bread', 'carbs', [247, 13, 41, 3.4, 7], [['1 slice (40 g)', 40], ['2 slices (80 g)', 80], G100], ['brown bread', 'wholewheat bread']),
  f('bread-sourdough', 'Sourdough bread', 'carbs', [256, 11, 48, 2, 2.9], [['1 slice (50 g)', 50], G100]),
  f('bagel', 'Bagel, plain', 'carbs', [257, 10, 50, 1.5, 2.1], [['1 bagel (85 g)', 85], G100]),
  f('tortilla-wrap', 'Tortilla wrap, white', 'carbs', [305, 8, 51, 7.5, 3], [['1 wrap (62 g)', 62], G100], ['wrap', 'tortilla']),
  f('pitta', 'Pitta bread', 'carbs', [275, 9, 55, 1.2, 2.4], [['1 pitta (60 g)', 60], G100]),
  f('naan', 'Naan bread', 'carbs', [310, 9, 50, 8, 2.2], [['1 naan (90 g)', 90], G100]),
  f('crumpet', 'Crumpet', 'carbs', [180, 6, 36, 0.9, 1.9], [['1 crumpet (60 g)', 60], G100]),
  f('rice-cakes', 'Rice cakes', 'carbs', [387, 8, 82, 3, 4], [['1 cake (9 g)', 9], G100]),
  f('oatcakes', 'Oatcakes', 'carbs', [440, 10, 60, 18, 7], [['1 oatcake (10 g)', 10], G100]),
  f('cereal-granola', 'Granola', 'carbs', [471, 10, 64, 20, 7], [['1 portion (50 g)', 50], G100]),
  f('cereal-bran', 'Bran flakes', 'carbs', [356, 10, 67, 2, 15], [['1 portion (40 g)', 40], G100]),
  f('weetabix', 'Wheat biscuits cereal', 'carbs', [362, 12, 69, 2, 10], [['2 biscuits (38 g)', 38], G100], ['weetabix']),
  f('cornflakes', 'Cornflakes', 'carbs', [378, 7, 84, 0.9, 3], [['1 portion (30 g)', 30], G100]),
  f('polenta-cooked', 'Polenta, cooked', 'carbs', [70, 1.6, 15, 0.3, 0.9], [G100]),

  // -------------------------------------------------------------------------
  // Beans & lentils
  // -------------------------------------------------------------------------
  f('lentils-cooked', 'Lentils, cooked', 'legumes', [116, 9, 20, 0.4, 8], [G100, ['1 portion (200 g)', 200]], ['lentil']),
  f('chickpeas-cooked', 'Chickpeas, cooked', 'legumes', [164, 9, 27, 2.6, 8], [G100, ['1 can drained (240 g)', 240]], ['garbanzo']),
  f('black-beans', 'Black beans, cooked', 'legumes', [132, 9, 24, 0.5, 9], [G100, ['1 can drained (240 g)', 240]]),
  f('kidney-beans', 'Kidney beans, cooked', 'legumes', [127, 9, 23, 0.5, 7], [G100, ['1 can drained (240 g)', 240]]),
  f('cannellini', 'Cannellini beans, cooked', 'legumes', [124, 8, 22, 0.5, 6], [G100, ['1 can drained (240 g)', 240]], ['white beans']),
  f('butter-beans', 'Butter beans, cooked', 'legumes', [115, 7, 21, 0.4, 7], [G100]),
  f('baked-beans', 'Baked beans in tomato sauce', 'legumes', [78, 4.7, 13, 0.4, 3.7], [['1/2 can (200 g)', 200], ['1 can (400 g)', 400], G100]),
  f('edamame', 'Edamame, shelled', 'legumes', [121, 12, 9, 5, 5], [G100, ['1 portion (80 g)', 80]]),
  f('peas', 'Garden peas', 'legumes', [81, 5.4, 14, 0.4, 5], [G100, ['1 portion (80 g)', 80]]),
  f('split-peas', 'Split peas, cooked', 'legumes', [118, 8, 21, 0.4, 8], [G100]),
  f('refried-beans', 'Refried beans', 'legumes', [90, 5, 15, 1, 5], [G100]),
  f('falafel', 'Falafel', 'legumes', [333, 13, 32, 18, 5], [['1 ball (17 g)', 17], G100]),

  // -------------------------------------------------------------------------
  // Vegetables — raw unless stated. Cheap volume on a cut, and most of the fibre.
  // -------------------------------------------------------------------------
  f('broccoli', 'Broccoli, steamed', 'veg', [34, 2.8, 6.6, 0.4, 2.6], [G100, ['1 portion (80 g)', 80]]),
  f('spinach', 'Spinach', 'veg', [23, 2.9, 3.6, 0.4, 2.2], [G100, ['1 handful (30 g)', 30]]),
  f('kale', 'Kale', 'veg', [49, 4.3, 8.8, 0.9, 3.6], [G100, ['1 handful (30 g)', 30]]),
  f('green-beans', 'Green beans', 'veg', [31, 1.8, 7, 0.2, 3.4], [G100, ['1 portion (80 g)', 80]]),
  f('asparagus', 'Asparagus', 'veg', [20, 2.2, 3.9, 0.1, 2.1], [G100, ['1 portion (80 g)', 80]]),
  f('courgette', 'Courgette', 'veg', [17, 1.2, 3.1, 0.3, 1], [G100, ['1 medium (200 g)', 200]], ['zucchini']),
  f('aubergine', 'Aubergine', 'veg', [25, 1, 6, 0.2, 3], [G100], ['eggplant']),
  f('cauliflower', 'Cauliflower', 'veg', [25, 1.9, 5, 0.3, 2], [G100, ['1 portion (80 g)', 80]]),
  f('cabbage', 'Cabbage', 'veg', [25, 1.3, 5.8, 0.1, 2.5], [G100]),
  f('brussels-sprouts', 'Brussels sprouts', 'veg', [43, 3.4, 9, 0.3, 3.8], [G100, ['1 portion (80 g)', 80]]),
  f('carrot', 'Carrot', 'veg', [41, 0.9, 8, 0.2, 2.8], [['1 medium (60 g)', 60], G100], ['carrots']),
  f('tomato', 'Tomato', 'veg', [18, 0.9, 3.4, 0.2, 1.2], [['1 medium (120 g)', 120], G100], ['tomatoes']),
  f('cherry-tomatoes', 'Cherry tomatoes', 'veg', [18, 0.9, 3.9, 0.2, 1.2], [G100, ['1 handful (80 g)', 80]]),
  f('cucumber', 'Cucumber', 'veg', [15, 0.7, 3.6, 0.1, 0.5], [G100, ['1/2 cucumber (150 g)', 150]]),
  f('lettuce', 'Lettuce', 'veg', [15, 1.4, 2.9, 0.2, 1.3], [G100, ['1 handful (30 g)', 30]], ['salad', 'greens']),
  f('rocket', 'Rocket', 'veg', [25, 2.6, 3.7, 0.7, 1.6], [['1 handful (25 g)', 25], G100], ['arugula']),
  f('bell-pepper', 'Bell pepper', 'veg', [31, 1, 6, 0.3, 2.1], [['1 medium (120 g)', 120], G100], ['pepper', 'capsicum']),
  f('onion', 'Onion', 'veg', [40, 1.1, 9, 0.1, 1.7], [['1 medium (110 g)', 110], G100]),
  f('red-onion', 'Red onion', 'veg', [37, 1, 8, 0.1, 1.5], [['1 medium (110 g)', 110], G100]),
  f('garlic', 'Garlic', 'veg', [149, 6.4, 33, 0.5, 2.1], [['1 clove (3 g)', 3], G100]),
  f('mushrooms', 'Mushrooms', 'veg', [22, 3.1, 3.3, 0.3, 1], [G100, ['1 handful (80 g)', 80]], ['mushroom']),
  f('leek', 'Leek', 'veg', [61, 1.5, 14, 0.3, 1.8], [G100]),
  f('celery', 'Celery', 'veg', [14, 0.7, 3, 0.2, 1.6], [['1 stick (40 g)', 40], G100]),
  f('beetroot', 'Beetroot, cooked', 'veg', [43, 1.6, 10, 0.2, 2.8], [G100]),
  f('butternut-squash', 'Butternut squash, roasted', 'veg', [45, 1, 12, 0.1, 2], [G100, ['1 portion (150 g)', 150]]),
  f('corn', 'Sweetcorn', 'veg', [86, 3.3, 19, 1.4, 2], [G100, ['1 portion (80 g)', 80]]),
  f('sauerkraut', 'Sauerkraut', 'veg', [19, 0.9, 4.3, 0.1, 2.9], [G100]),
  f('olives', 'Olives', 'veg', [145, 1, 6, 15, 3.2], [['1 portion (30 g)', 30], G100]),
  f('artichoke', 'Artichoke hearts', 'veg', [47, 3.3, 11, 0.2, 5.4], [G100]),
  f('sugar-snap-peas', 'Sugar snap peas', 'veg', [42, 2.8, 7.5, 0.2, 2.6], [G100, ['1 portion (80 g)', 80]]),
  f('pak-choi', 'Pak choi', 'veg', [13, 1.5, 2.2, 0.2, 1], [G100]),
  f('radish', 'Radish', 'veg', [16, 0.7, 3.4, 0.1, 1.6], [G100]),
  f('mixed-veg-frozen', 'Mixed vegetables, frozen', 'veg', [64, 3, 11, 0.5, 4], [G100, ['1 portion (150 g)', 150]]),
  f('salad-mixed', 'Mixed salad, undressed', 'veg', [17, 1.2, 2.5, 0.2, 1.4], [G100, ['1 bowl (100 g)', 100]]),

  // -------------------------------------------------------------------------
  // Fruit
  // -------------------------------------------------------------------------
  f('banana', 'Banana', 'fruit', [89, 1.1, 23, 0.3, 2.6], [['1 medium (120 g)', 120], ['1 large (150 g)', 150], G100]),
  f('apple', 'Apple', 'fruit', [52, 0.3, 14, 0.2, 2.4], [['1 medium (180 g)', 180], G100]),
  f('orange', 'Orange', 'fruit', [47, 0.9, 12, 0.1, 2.4], [['1 medium (150 g)', 150], G100]),
  f('blueberries', 'Blueberries', 'fruit', [57, 0.7, 14, 0.3, 2.4], [['1 handful (80 g)', 80], G100]),
  f('strawberries', 'Strawberries', 'fruit', [32, 0.7, 7.7, 0.3, 2], [['1 portion (100 g)', 100], G100]),
  f('raspberries', 'Raspberries', 'fruit', [52, 1.2, 12, 0.7, 6.5], [['1 handful (80 g)', 80], G100]),
  f('blackberries', 'Blackberries', 'fruit', [43, 1.4, 10, 0.5, 5.3], [G100]),
  f('grapes', 'Grapes', 'fruit', [69, 0.7, 18, 0.2, 0.9], [['1 handful (80 g)', 80], G100]),
  f('pineapple', 'Pineapple', 'fruit', [50, 0.5, 13, 0.1, 1.4], [G100, ['1 slice (80 g)', 80]]),
  f('mango', 'Mango', 'fruit', [60, 0.8, 15, 0.4, 1.6], [G100, ['1 medium (200 g)', 200]]),
  f('kiwi', 'Kiwi', 'fruit', [61, 1.1, 15, 0.5, 3], [['1 kiwi (75 g)', 75], G100]),
  f('pear', 'Pear', 'fruit', [57, 0.4, 15, 0.1, 3.1], [['1 medium (180 g)', 180], G100]),
  f('peach', 'Peach', 'fruit', [39, 0.9, 10, 0.3, 1.5], [['1 medium (150 g)', 150], G100]),
  f('plum', 'Plum', 'fruit', [46, 0.7, 11, 0.3, 1.4], [['1 plum (65 g)', 65], G100]),
  f('watermelon', 'Watermelon', 'fruit', [30, 0.6, 8, 0.2, 0.4], [G100, ['1 slice (200 g)', 200]]),
  f('melon', 'Melon', 'fruit', [34, 0.8, 8, 0.2, 0.9], [G100]),
  f('cherries', 'Cherries', 'fruit', [63, 1.1, 16, 0.2, 2.1], [['1 handful (80 g)', 80], G100]),
  f('grapefruit', 'Grapefruit', 'fruit', [42, 0.8, 11, 0.1, 1.6], [['1/2 fruit (120 g)', 120], G100]),
  f('avocado', 'Avocado', 'fruit', [160, 2, 9, 15, 7], [['1/2 avocado (70 g)', 70], ['1 avocado (140 g)', 140], G100]),
  f('dates', 'Dates, dried', 'fruit', [282, 2.5, 75, 0.4, 8], [['1 date (8 g)', 8], G100]),
  f('raisins', 'Raisins', 'fruit', [299, 3.1, 79, 0.5, 3.7], [['1 handful (30 g)', 30], G100]),
  f('dried-apricots', 'Dried apricots', 'fruit', [241, 3.4, 63, 0.5, 7.3], [['1 handful (30 g)', 30], G100]),
  f('lemon', 'Lemon', 'fruit', [29, 1.1, 9, 0.3, 2.8], [['1 lemon (60 g)', 60], G100]),
  f('pomegranate', 'Pomegranate seeds', 'fruit', [83, 1.7, 19, 1.2, 4], [G100]),
  f('clementine', 'Clementine', 'fruit', [47, 0.9, 12, 0.2, 1.7], [['1 fruit (75 g)', 75], G100], ['satsuma', 'mandarin']),

  // -------------------------------------------------------------------------
  // Nuts, seeds & fats — calorie-dense, and the easiest thing to under-log.
  // -------------------------------------------------------------------------
  f('almonds', 'Almonds', 'fats', [579, 21, 22, 50, 12.5], [['1 handful (30 g)', 30], G100], ['nuts']),
  f('walnuts', 'Walnuts', 'fats', [654, 15, 14, 65, 6.7], [['1 handful (30 g)', 30], G100]),
  f('cashews', 'Cashews', 'fats', [553, 18, 30, 44, 3.3], [['1 handful (30 g)', 30], G100]),
  f('peanuts', 'Peanuts', 'fats', [567, 26, 16, 49, 8.5], [['1 handful (30 g)', 30], G100]),
  f('pistachios', 'Pistachios', 'fats', [560, 20, 28, 45, 10], [['1 handful (30 g)', 30], G100]),
  f('hazelnuts', 'Hazelnuts', 'fats', [628, 15, 17, 61, 9.7], [['1 handful (30 g)', 30], G100]),
  f('brazil-nuts', 'Brazil nuts', 'fats', [659, 14, 12, 67, 7.5], [['1 nut (5 g)', 5], G100]),
  f('peanut-butter', 'Peanut butter', 'fats', [588, 25, 20, 50, 6], [['1 tbsp (16 g)', 16], ['2 tbsp (32 g)', 32], G100]),
  f('almond-butter', 'Almond butter', 'fats', [614, 21, 19, 56, 10], [['1 tbsp (16 g)', 16], G100]),
  f('chia-seeds', 'Chia seeds', 'fats', [486, 17, 42, 31, 34], [['1 tbsp (12 g)', 12], G100]),
  f('flax-seeds', 'Flaxseed, ground', 'fats', [534, 18, 29, 42, 27], [['1 tbsp (10 g)', 10], G100], ['linseed']),
  f('pumpkin-seeds', 'Pumpkin seeds', 'fats', [559, 30, 11, 49, 6], [['1 handful (30 g)', 30], G100]),
  f('sunflower-seeds', 'Sunflower seeds', 'fats', [584, 21, 20, 51, 8.6], [['1 handful (30 g)', 30], G100]),
  f('sesame-seeds', 'Sesame seeds', 'fats', [573, 18, 23, 50, 12], [['1 tbsp (9 g)', 9], G100]),
  f('olive-oil', 'Olive oil', 'fats', [884, 0, 0, 100, 0], [['1 tsp (5 g)', 5], ['1 tbsp (14 g)', 14], G100], ['oil']),
  f('rapeseed-oil', 'Rapeseed oil', 'fats', [884, 0, 0, 100, 0], [['1 tbsp (14 g)', 14], G100], ['canola oil', 'vegetable oil']),
  f('coconut-oil', 'Coconut oil', 'fats', [892, 0, 0, 99, 0], [['1 tbsp (14 g)', 14], G100]),
  f('cooking-spray', 'Cooking spray', 'fats', [620, 0, 0, 69, 0], [['1 spray (0.3 g)', 1], ['5 sprays (1.5 g)', 2]]),
  f('tahini', 'Tahini', 'fats', [595, 17, 21, 54, 9.3], [['1 tbsp (15 g)', 15], G100]),
  f('coconut-desiccated', 'Desiccated coconut', 'fats', [660, 6.9, 24, 65, 16], [['1 tbsp (10 g)', 10], G100]),
  f('mixed-nuts', 'Mixed nuts', 'fats', [607, 20, 21, 54, 7], [['1 handful (30 g)', 30], G100]),

  // -------------------------------------------------------------------------
  // Sauces & condiments — small weights, easy to forget, and they add up.
  // -------------------------------------------------------------------------
  f('ketchup', 'Ketchup', 'sauces', [102, 1.3, 24, 0.1, 0.3], [['1 tbsp (17 g)', 17], G100]),
  f('mayonnaise', 'Mayonnaise', 'sauces', [680, 1, 1.3, 75, 0], [['1 tbsp (14 g)', 14], G100], ['mayo']),
  f('mayonnaise-light', 'Mayonnaise, light', 'sauces', [290, 1, 8, 28, 0], [['1 tbsp (14 g)', 14], G100]),
  f('mustard', 'Mustard', 'sauces', [66, 4.4, 6, 3.3, 3.3], [['1 tsp (5 g)', 5], G100]),
  f('soy-sauce', 'Soy sauce', 'sauces', [53, 8, 4.9, 0.1, 0.8], [['1 tbsp (16 g)', 16], G100]),
  f('sriracha', 'Sriracha', 'sauces', [93, 1.9, 19, 0.9, 2.2], [['1 tbsp (15 g)', 15], G100], ['hot sauce']),
  f('bbq-sauce', 'BBQ sauce', 'sauces', [172, 0.8, 41, 0.6, 0.8], [['1 tbsp (17 g)', 17], G100]),
  f('hummus', 'Hummus', 'sauces', [237, 8, 14, 17, 6], [['1 tbsp (15 g)', 15], ['1 portion (50 g)', 50], G100]),
  f('guacamole', 'Guacamole', 'sauces', [155, 2, 9, 13, 6], [['1 portion (50 g)', 50], G100]),
  f('salsa', 'Salsa', 'sauces', [36, 1.5, 7, 0.2, 1.8], [['1 portion (50 g)', 50], G100]),
  f('pesto', 'Pesto', 'sauces', [450, 5, 6, 45, 2], [['1 tbsp (15 g)', 15], G100]),
  f('tomato-passata', 'Passata', 'sauces', [35, 1.6, 6, 0.3, 1.4], [G100, ['1 carton (500 g)', 500]], ['tomato sauce']),
  f('tinned-tomatoes', 'Chopped tomatoes, tinned', 'sauces', [21, 1.1, 3.5, 0.2, 1], [['1 tin (400 g)', 400], G100]),
  f('tomato-puree', 'Tomato purée', 'sauces', [82, 4.3, 15, 0.5, 3.3], [['1 tbsp (15 g)', 15], G100]),
  f('curry-paste', 'Curry paste', 'sauces', [190, 3, 14, 13, 4], [['1 tbsp (15 g)', 15], G100]),
  f('coconut-milk', 'Coconut milk, tinned', 'sauces', [197, 2, 3, 20, 0], [['1 tin (400 ml)', 400], ML100], undefined, true),
  f('coconut-milk-light', 'Coconut milk, light', 'sauces', [73, 1, 2, 7, 0], [['1 tin (400 ml)', 400], ML100], undefined, true),
  f('stock-cube', 'Stock cube', 'sauces', [230, 10, 20, 13, 1], [['1 cube (10 g)', 10]]),
  f('vinegar-balsamic', 'Balsamic vinegar', 'sauces', [88, 0.5, 17, 0, 0], [['1 tbsp (16 g)', 16], G100]),
  f('salad-dressing', 'Salad dressing, vinaigrette', 'sauces', [340, 0.4, 6, 35, 0], [['1 tbsp (15 g)', 15], G100]),
  f('honey', 'Honey', 'sauces', [304, 0.3, 82, 0, 0.2], [['1 tsp (7 g)', 7], ['1 tbsp (21 g)', 21], G100]),
  f('maple-syrup', 'Maple syrup', 'sauces', [260, 0, 67, 0.1, 0], [['1 tbsp (20 g)', 20], G100]),
  f('jam', 'Jam', 'sauces', [278, 0.4, 69, 0.1, 1], [['1 tbsp (20 g)', 20], G100]),
  f('gravy', 'Gravy', 'sauces', [34, 0.7, 5, 1.2, 0.2], [['1 portion (70 g)', 70], G100]),
  f('sweet-chilli', 'Sweet chilli sauce', 'sauces', [225, 0.5, 55, 0.2, 0.5], [['1 tbsp (17 g)', 17], G100]),

  // -------------------------------------------------------------------------
  // Snacks & sweets
  // -------------------------------------------------------------------------
  f('protein-bar', 'Protein bar', 'snacks', [350, 30, 33, 10, 6], [['1 bar (60 g)', 60], G100]),
  f('cereal-bar', 'Cereal bar', 'snacks', [400, 5, 68, 12, 3], [['1 bar (35 g)', 35], G100]),
  f('flapjack', 'Flapjack', 'snacks', [460, 5, 60, 22, 3], [['1 piece (70 g)', 70], G100]),
  f('dark-chocolate', 'Dark chocolate, 70%', 'snacks', [598, 7.8, 46, 43, 11], [['1 square (10 g)', 10], ['1 row (25 g)', 25], G100], ['chocolate']),
  f('milk-chocolate', 'Milk chocolate', 'snacks', [535, 7.6, 59, 30, 3.4], [['1 square (10 g)', 10], ['1 bar (45 g)', 45], G100]),
  f('crisps', 'Crisps', 'snacks', [536, 6.6, 53, 34, 4.4], [['1 bag (25 g)', 25], ['1 grab bag (50 g)', 50], G100], ['chips', 'potato chips']),
  f('popcorn', 'Popcorn, plain', 'snacks', [387, 13, 78, 4.5, 15], [['1 bowl (25 g)', 25], G100]),
  f('pretzels', 'Pretzels', 'snacks', [380, 10, 80, 3, 3], [['1 bag (30 g)', 30], G100]),
  f('biscuit-digestive', 'Digestive biscuit', 'snacks', [480, 6.7, 63, 22, 3], [['1 biscuit (15 g)', 15], G100], ['biscuits', 'cookies']),
  f('cookie', 'Chocolate chip cookie', 'snacks', [488, 5.5, 64, 24, 2.4], [['1 cookie (40 g)', 40], G100]),
  f('croissant', 'Croissant', 'snacks', [406, 8.2, 46, 21, 2.6], [['1 croissant (60 g)', 60], G100]),
  f('muffin', 'Blueberry muffin', 'snacks', [377, 5, 55, 15, 1.5], [['1 muffin (110 g)', 110], G100]),
  f('doughnut', 'Doughnut, glazed', 'snacks', [421, 5, 47, 24, 1.4], [['1 doughnut (60 g)', 60], G100], ['donut']),
  f('brownie', 'Brownie', 'snacks', [466, 6, 55, 25, 2.5], [['1 brownie (60 g)', 60], G100]),
  f('cake-sponge', 'Sponge cake', 'snacks', [340, 5, 52, 13, 1], [['1 slice (70 g)', 70], G100], ['cake']),
  f('ice-cream', 'Ice cream, vanilla', 'snacks', [207, 3.5, 24, 11, 0.7], [['1 scoop (60 g)', 60], ['1 portion (120 g)', 120], G100]),
  f('ice-cream-protein', 'Protein ice cream', 'snacks', [110, 8, 15, 2, 3], [['1 tub (500 ml)', 500], G100]),
  f('haribo', 'Gummy sweets', 'snacks', [343, 6.9, 77, 0.5, 0], [['1 bag (100 g)', 100], G100], ['sweets', 'candy']),
  f('cheesecake', 'Cheesecake', 'snacks', [321, 5.5, 26, 22, 0.4], [['1 slice (100 g)', 100], G100]),
  f('granola-bar', 'Granola bar', 'snacks', [430, 7, 62, 17, 5], [['1 bar (40 g)', 40], G100]),
  f('beef-jerky', 'Beef jerky', 'snacks', [280, 33, 11, 11, 1], [['1 bag (30 g)', 30], G100]),
  f('rice-pudding', 'Rice pudding', 'snacks', [92, 3.2, 15, 2.1, 0.2], [['1 pot (200 g)', 200], G100]),
  f('yogurt-fruit', 'Fruit yogurt', 'snacks', [95, 4, 15, 2, 0.2], [['1 pot (125 g)', 125], G100]),
  f('trail-mix', 'Trail mix', 'snacks', [462, 14, 45, 29, 6], [['1 handful (40 g)', 40], G100]),

  // -------------------------------------------------------------------------
  // Drinks
  // -------------------------------------------------------------------------
  f('coffee-black', 'Coffee, black', 'drinks', [1, 0.1, 0, 0, 0], [['1 mug (250 ml)', 250], ML100], ['coffee', 'americano'], true),
  f('latte', 'Latte, semi-skimmed', 'drinks', [46, 3.1, 4.5, 1.6, 0], [['regular (350 ml)', 350], ['large (450 ml)', 450], ML100], undefined, true),
  f('cappuccino', 'Cappuccino, semi-skimmed', 'drinks', [40, 2.8, 4, 1.4, 0], [['regular (250 ml)', 250], ML100], undefined, true),
  f('flat-white', 'Flat white', 'drinks', [60, 4, 5.5, 2.4, 0], [['regular (230 ml)', 230], ML100], undefined, true),
  f('tea-milk', 'Tea with milk', 'drinks', [13, 0.8, 1.2, 0.5, 0], [['1 mug (250 ml)', 250], ML100], ['tea'], true),
  f('orange-juice', 'Orange juice', 'drinks', [45, 0.7, 10, 0.2, 0.2], [['1 glass (250 ml)', 250], ML100], ['juice'], true),
  f('apple-juice', 'Apple juice', 'drinks', [46, 0.1, 11, 0.1, 0.1], [['1 glass (250 ml)', 250], ML100], undefined, true),
  f('smoothie', 'Fruit smoothie', 'drinks', [55, 0.8, 13, 0.2, 1.2], [['1 bottle (250 ml)', 250], ML100], undefined, true),
  f('cola', 'Cola', 'drinks', [42, 0, 10.6, 0, 0], [['1 can (330 ml)', 330], ML100], undefined, true),
  f('diet-cola', 'Diet cola', 'drinks', [0.4, 0, 0, 0, 0], [['1 can (330 ml)', 330], ML100], ['coke zero', 'diet coke'], true),
  f('energy-drink', 'Energy drink', 'drinks', [45, 0, 11, 0, 0], [['1 can (250 ml)', 250], ML100], undefined, true),
  f('energy-drink-sugarfree', 'Energy drink, sugar free', 'drinks', [3, 0, 0.3, 0, 0], [['1 can (330 ml)', 330], ML100], undefined, true),
  f('beer', 'Beer, 4.5%', 'drinks', [43, 0.5, 3.5, 0, 0], [['1 pint (568 ml)', 568], ['1 bottle (330 ml)', 330], ML100], undefined, true),
  f('lager-light', 'Lager, low alcohol', 'drinks', [20, 0.4, 3, 0, 0], [['1 bottle (330 ml)', 330], ML100], undefined, true),
  f('wine-red', 'Red wine', 'drinks', [85, 0.1, 2.6, 0, 0], [['1 glass (175 ml)', 175], ML100], ['wine'], true),
  f('wine-white', 'White wine, dry', 'drinks', [82, 0.1, 2.6, 0, 0], [['1 glass (175 ml)', 175], ML100], undefined, true),
  f('spirit', 'Spirits, 40%', 'drinks', [222, 0, 0, 0, 0], [['1 shot (25 ml)', 25], ['double (50 ml)', 50], ML100], ['vodka', 'gin', 'whisky'], true),
  f('gin-tonic', 'Gin and tonic', 'drinks', [70, 0, 6, 0, 0], [['1 glass (250 ml)', 250], ML100], undefined, true),
  f('squash-diluted', 'Squash, diluted, no sugar', 'drinks', [2, 0, 0.3, 0, 0], [['1 glass (250 ml)', 250], ML100], undefined, true),
  f('kombucha', 'Kombucha', 'drinks', [25, 0, 6, 0, 0], [['1 bottle (330 ml)', 330], ML100], undefined, true),

  // -------------------------------------------------------------------------
  // Prepared & takeaway — rough by nature, but far better than not logging.
  // A barcode or a photo beats these whenever one is available.
  // -------------------------------------------------------------------------
  f('pizza-margherita', 'Pizza, margherita', 'meals', [266, 11, 33, 10, 2.3], [['1 slice (100 g)', 100], ['1/2 pizza (200 g)', 200], ['1 pizza (400 g)', 400]], ['pizza']),
  f('pizza-pepperoni', 'Pizza, pepperoni', 'meals', [298, 13, 32, 13, 2.2], [['1 slice (110 g)', 110], ['1 pizza (430 g)', 430]]),
  f('burger-beef', 'Beef burger, fast food', 'meals', [254, 13, 30, 9, 1.5], [['1 burger (150 g)', 150], ['1 large (250 g)', 250]], ['burger', 'hamburger']),
  f('cheeseburger', 'Cheeseburger', 'meals', [270, 14, 27, 12, 1.4], [['1 burger (170 g)', 170]]),
  f('chicken-burger', 'Chicken burger', 'meals', [245, 15, 26, 9, 1.6], [['1 burger (180 g)', 180]]),
  f('fries', 'Fries, fast food', 'meals', [312, 3.4, 41, 15, 3.8], [['small (80 g)', 80], ['medium (115 g)', 115], ['large (150 g)', 150]], ['chips']),
  f('chicken-nuggets', 'Chicken nuggets', 'meals', [296, 15, 18, 18, 1], [['6 pieces (100 g)', 100], ['9 pieces (150 g)', 150]]),
  f('kebab-doner', 'Doner kebab', 'meals', [215, 15, 14, 11, 1.5], [['1 kebab (350 g)', 350]], ['kebab']),
  f('chicken-shawarma', 'Chicken shawarma wrap', 'meals', [210, 14, 22, 7, 2], [['1 wrap (300 g)', 300]]),
  f('burrito', 'Burrito, chicken', 'meals', [190, 11, 22, 6.5, 2.5], [['1 burrito (400 g)', 400]]),
  f('sushi', 'Sushi, mixed', 'meals', [145, 7, 25, 2, 1], [['1 pack (250 g)', 250], G100]),
  f('pad-thai', 'Pad thai', 'meals', [180, 8, 24, 6, 2], [['1 portion (400 g)', 400], G100]),
  f('curry-chicken-tikka', 'Chicken tikka masala', 'meals', [155, 11, 6, 10, 1.2], [['1 portion (350 g)', 350], G100], ['curry']),
  f('curry-korma', 'Chicken korma', 'meals', [185, 10, 8, 13, 1.5], [['1 portion (350 g)', 350], G100]),
  f('stir-fry-chicken', 'Chicken stir fry with noodles', 'meals', [130, 9, 16, 3.5, 2], [['1 portion (400 g)', 400], G100]),
  f('lasagne', 'Lasagne', 'meals', [135, 8, 12, 6, 1.2], [['1 portion (400 g)', 400], G100]),
  f('spaghetti-bolognese', 'Spaghetti bolognese', 'meals', [130, 7.5, 16, 4, 1.8], [['1 portion (450 g)', 450], G100], ['bolognese']),
  f('shepherds-pie', "Shepherd's pie", 'meals', [120, 7, 12, 5, 1.5], [['1 portion (400 g)', 400], G100]),
  f('chilli-con-carne', 'Chilli con carne', 'meals', [125, 9, 10, 5.5, 2.5], [['1 portion (400 g)', 400], G100], ['chilli']),
  f('soup-vegetable', 'Vegetable soup', 'meals', [45, 1.5, 7, 1.3, 1.5], [['1 bowl (300 g)', 300], G100], ['soup']),
  f('soup-chicken', 'Chicken soup', 'meals', [55, 3.5, 6, 1.8, 0.8], [['1 bowl (300 g)', 300], G100]),
  f('sandwich-chicken', 'Chicken salad sandwich', 'meals', [200, 12, 24, 6, 2.5], [['1 sandwich (200 g)', 200]], ['sandwich']),
  f('sandwich-blt', 'BLT sandwich', 'meals', [240, 10, 23, 12, 2], [['1 sandwich (200 g)', 200]]),
  f('jacket-tuna', 'Jacket potato with tuna mayo', 'meals', [130, 7, 17, 4, 2], [['1 potato (350 g)', 350], G100]),
  f('full-breakfast', 'Full English breakfast', 'meals', [195, 11, 11, 12, 1.6], [['1 plate (450 g)', 450], G100], ['fry up']),
  f('omelette-cheese', 'Cheese omelette', 'meals', [200, 14, 1.5, 16, 0], [['1 omelette (200 g)', 200], G100], ['omelette']),
  f('protein-bowl', 'Chicken and rice bowl', 'meals', [140, 11, 17, 3, 1.5], [['1 bowl (450 g)', 450], G100]),
  f('caesar-salad-chicken', 'Chicken caesar salad', 'meals', [140, 11, 5, 9, 1.2], [['1 bowl (300 g)', 300], G100]),
  f('fish-and-chips', 'Fish and chips', 'meals', [250, 12, 26, 12, 2.5], [['1 portion (450 g)', 450], G100]),
  f('roast-dinner', 'Roast dinner', 'meals', [130, 9, 13, 4.5, 2.2], [['1 plate (500 g)', 500], G100]),
];

// ---------------------------------------------------------------------------
// Lookup & scaling
// ---------------------------------------------------------------------------

/** Round to one decimal, which is as much precision as these values deserve. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Scale a food to an arbitrary weight. This is the whole reason the corpus is
 * stored per 100 g: 137 g of chicken is exact, not "about one and a half
 * servings".
 */
export function scaleFood(food: LibraryFood, grams: number): Nutrients {
  const factor = Math.max(0, grams) / 100;
  return {
    calories: Math.round(food.per100.calories * factor),
    protein: r1(food.per100.protein * factor),
    carbs: r1(food.per100.carbs * factor),
    fat: r1(food.per100.fat * factor),
    fiber: r1(food.per100.fiber * factor),
  };
}

/** The portion to preselect — the first listed, which is the most common one. */
export function defaultPortion(food: LibraryFood): Portion {
  return food.portions[0] ?? { label: '100 g', grams: 100 };
}

/** Every term that should match a food in search. */
function searchTerms(food: LibraryFood): string[] {
  return [food.name, ...(food.aliases ?? [])].map((t) => t.toLowerCase());
}

const byId = new Map(FOOD_LIBRARY.map((food) => [food.id, food]));

export function findFood(id: string): LibraryFood | undefined {
  return byId.get(id);
}

/**
 * Search the library.
 *
 * Ranked so that typing "chicken" puts plain chicken breast above chicken tikka
 * masala: an exact name match beats a prefix, which beats a word boundary,
 * which beats an alias, which beats a bare substring. Shorter names break ties,
 * on the assumption that the simpler food is the one usually meant.
 */
export function searchFoods(query: string, limit = 30): LibraryFood[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const scored: { food: LibraryFood; score: number }[] = [];
  for (const food of FOOD_LIBRARY) {
    const terms = searchTerms(food);
    let best = 0;
    for (let i = 0; i < terms.length; i += 1) {
      const term = terms[i];
      // Aliases are worth slightly less than the canonical name.
      const penalty = i === 0 ? 0 : 1;
      if (term === q) best = Math.max(best, 100 - penalty);
      else if (term.startsWith(q)) best = Math.max(best, 80 - penalty);
      else if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(term)) {
        best = Math.max(best, 60 - penalty);
      } else if (term.includes(q)) best = Math.max(best, 40 - penalty);
    }
    if (best > 0) scored.push({ food, score: best });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length)
    .slice(0, limit)
    .map((s) => s.food);
}

/** Foods in a group, for browsing without a query. */
export function foodsInGroup(group: FoodGroup): LibraryFood[] {
  return FOOD_LIBRARY.filter((food) => food.group === group);
}

/** Grams of protein per 100 kcal — the "lean-ness" ranking. */
export function proteinPer100Kcal(food: LibraryFood): number {
  if (food.per100.calories <= 0) return 0;
  return (food.per100.protein / food.per100.calories) * 100;
}
