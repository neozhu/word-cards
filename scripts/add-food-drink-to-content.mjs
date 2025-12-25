import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const repoRoot = process.cwd();
const contentPath = path.join(repoRoot, "content.json");

/** @type {Record<string, {word: string, phrase: string}>} */
const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));

const require = createRequire(import.meta.url);
const emojiMartDataPath = require.resolve("@emoji-mart/data");
const emojiMartDataJson = fs.readFileSync(emojiMartDataPath, "utf8");

const data = /** @type {{
  categories: Array<{ id: string; emojis: string[] }>;
  emojis: Record<string, { name?: string }>;
}} */ (JSON.parse(emojiMartDataJson));

const foodsCategory =
  data.categories?.find((c) => c.id === "foods") ??
  data.categories?.find((c) => String(c.id).toLowerCase().includes("food"));

if (!foodsCategory) {
  console.error("Could not find emoji-mart foods category.");
  process.exitCode = 1;
  process.exit();
}

const excludedIds = new Set([
  // alcohol-related (not kid-appropriate)
  "beer",
  "beers",
  "clinking_glasses",
  "champagne",
  "wine_glass",
  "cocktail",
  "tropical_drink",
  "tumbler_glass",
  "sake",
]);

const excludedKeywords = [
  "beer",
  "wine",
  "cocktail",
  "champagne",
  "sake",
  "whisky",
  "whiskey",
  "vodka",
  "gin",
  "rum",
  "brandy",
  "alcohol",
];

function normalizeNoun(name) {
  return String(name).toLowerCase().replace(/\s+/g, " ").trim();
}

function titleCaseWords(name) {
  const s = String(name).trim().replace(/\s+/g, " ");
  return s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function hash32(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function isDrink(noun) {
  const s = ` ${noun} `;
  return (
    s.includes(" milk ") ||
    s.includes(" juice ") ||
    s.includes(" tea ") ||
    s.includes(" coffee ") ||
    s.includes(" water ") ||
    s.includes(" soda ") ||
    s.includes(" cup ") ||
    s.includes(" glass ") ||
    s.includes(" bottle ") ||
    s.includes(" drink ")
  );
}

function pick(list, seed) {
  return list[seed % list.length];
}

function makePhrase(id, noun) {
  const seed = hash32(id);

  const foodTemplates = [
    (n) => `Yum! The ${n} looks tasty.`,
    (n) => `Can you find the ${n}?`,
    (n) => `Take a bite of the ${n}.`,
    (n) => `I like the ${n}.`,
    (n) => `Let's share the ${n}.`,
  ];

  const drinkTemplates = [
    (n) => `Sip the ${n}.`,
    (n) => `Can you find the ${n}?`,
    (n) => `The ${n} looks refreshing.`,
    (n) => `I like the ${n}.`,
    (n) => `Take a little sip of the ${n}.`,
  ];

  const templates = isDrink(noun) ? drinkTemplates : foodTemplates;
  return pick(templates, seed)(noun);
}

const incomingIds = Array.from(new Set(foodsCategory.emojis ?? []));

/** @type {Record<string, {word: string, phrase: string}>} */
const additions = {};

for (const id of incomingIds) {
  if (content[id]) continue;
  if (excludedIds.has(id)) continue;

  const name = data.emojis?.[id]?.name ?? id.replace(/_/g, " ");
  const noun = normalizeNoun(name);

  if (excludedKeywords.some((k) => noun.includes(k))) continue;

  const word = titleCaseWords(noun);
  const phrase = makePhrase(id, noun);

  additions[id] = { word, phrase };
}

const idsToAdd = Object.keys(additions).sort();

for (const id of idsToAdd) {
  content[id] = additions[id];
}

fs.writeFileSync(contentPath, JSON.stringify(content, null, 2) + "\n");

console.log(
  `Added ${idsToAdd.length} Food & Drink entries (excluded ${excludedIds.size} explicit ids).`
);
console.log(`Total entries now: ${Object.keys(content).length}`);
