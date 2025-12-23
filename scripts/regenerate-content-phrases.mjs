import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const contentPath = path.join(repoRoot, "content.json");

/** @type {Record<string, {word: string, phrase: string}>} */
const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));

// Preserve the original curated entries (hand-written, higher quality).
const preservedIds = new Set([
  "dog",
  "cat",
  "lion_face",
  "tiger",
  "elephant",
  "giraffe_face",
  "monkey_face",
  "bear",
  "rabbit",
  "panda_face",
]);

const colors = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "brown",
  "black",
  "white",
];

const kidVerbs = [
  "jump",
  "hop",
  "run",
  "walk",
  "dance",
  "wiggle",
  "clap",
  "smile",
  "listen",
  "look",
  "count",
  "point",
];

const animalVerbs = [
  "run",
  "hop",
  "climb",
  "sleep",
  "eat",
  "play",
];

const birdVerbs = ["fly", "sing", "chirp", "flap"];
const fishVerbs = ["swim", "splash", "glide"];
const insectVerbs = ["crawl", "buzz", "hide"];
const reptileVerbs = ["crawl", "hide", "rest"];
const plantVerbs = ["grow", "bloom", "open", "shine"];

function hash32(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function normalizeNoun(word) {
  return String(word)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function classify(id, noun) {
  const s = `${id} ${noun}`.toLowerCase();

  if (
    s.includes("bird") ||
    s.includes("eagle") ||
    s.includes("duck") ||
    s.includes("swan") ||
    s.includes("owl") ||
    s.includes("parrot") ||
    s.includes("penguin") ||
    s.includes("dove") ||
    s.includes("rooster") ||
    s.includes("chick") ||
    s.includes("turkey")
  ) {
    return "bird";
  }

  if (
    s.includes("fish") ||
    s.includes("whale") ||
    s.includes("dolphin") ||
    s.includes("shark") ||
    s.includes("octopus") ||
    s.includes("seal") ||
    s.includes("jellyfish") ||
    s.includes("snail") ||
    s.includes("coral") ||
    s.includes("shell")
  ) {
    return "sea";
  }

  if (
    s.includes("spider") ||
    s.includes("bug") ||
    s.includes("ant") ||
    s.includes("bee") ||
    s.includes("beetle") ||
    s.includes("cricket") ||
    s.includes("cockroach") ||
    s.includes("mosquito") ||
    s.includes("fly") ||
    s.includes("worm")
  ) {
    return "insect";
  }

  if (s.includes("snake") || s.includes("turtle") || s.includes("lizard") || s.includes("crocodile") || s.includes("dragon")) {
    return "reptile";
  }

  if (
    s.includes("flower") ||
    s.includes("tree") ||
    s.includes("leaf") ||
    s.includes("plant") ||
    s.includes("cactus") ||
    s.includes("mushroom") ||
    s.includes("seedling") ||
    s.includes("bouquet")
  ) {
    return "plant";
  }

  return "animal";
}

function starterKey(sentence) {
  const first = String(sentence).trim().split(/\s+/)[0]?.toLowerCase() || "";
  // group similar starters
  if (["the", "a", "an", "this", "that"].includes(first)) return first;
  if (["can", "do", "is", "are"].includes(first)) return "question";
  if (["say", "touch", "point", "count", "listen", "find", "show", "tap"].includes(first)) return "command";
  if (["wow", "yay", "hello"].includes(first)) return "exclaim";
  if (["i", "we", "let's"].includes(first)) return "we";
  return first;
}

function pickFrom(list, seed, offset) {
  return list[(seed + offset) % list.length];
}

function buildCandidates(id, word) {
  const noun = normalizeNoun(word);
  const seed = hash32(id);
  const kind = classify(id, noun);

  const color = pickFrom(colors, seed, 1);
  const kidVerb = pickFrom(kidVerbs, seed, 2);

  const verbByKind = {
    animal: pickFrom(animalVerbs, seed, 3),
    bird: pickFrom(birdVerbs, seed, 3),
    sea: pickFrom(fishVerbs, seed, 3),
    insect: pickFrom(insectVerbs, seed, 3),
    reptile: pickFrom(reptileVerbs, seed, 3),
    plant: pickFrom(plantVerbs, seed, 3),
  };

  const v = verbByKind[kind] || "move";

  // Many different sentence shapes; keep them short and kid-friendly.
  const quoted = word.replace(/"/g, "'");

  /** @type {string[]} */
  const candidates = [
    // Questions
    `Can you find the ${noun}?`,
    `Can you say "${quoted}"?`,
    `Do you see the ${noun}?`,
    // Commands
    `Point to the ${noun}.`,
    `Tap the ${noun}.`,
    `Count the ${noun}.`,
    `Listen and say: ${quoted}.`,
    // Statements
    `Here is the ${noun}.`,
    `This ${noun} can ${v}.`,
    `The ${noun} can ${v}.`,
    `The ${noun} likes to ${v}.`,
    `The ${noun} is ${color}.`,
    // Exclamations
    `Wow! The ${noun} is here!`,
    `Yay! Hello, ${noun}!`,
    // Kid action tie-in
    `Let’s ${kidVerb} like a ${noun}.`,
    `We can ${kidVerb} together!`,
    // Extra kind-specific
    kind === "bird" ? `The ${noun} flaps its wings.` : `The ${noun} moves slowly.`,
    kind === "sea" ? `The ${noun} swims in the water.` : `The ${noun} walks around.`,
    kind === "plant" ? `The ${noun} can grow.` : `The ${noun} is ready to play.`,
    kind === "insect" ? `The ${noun} can buzz.` : `The ${noun} can rest.`,
  ];

  // Remove duplicates from candidates (possible when kind branches collide)
  return Array.from(new Set(candidates.map((s) => s.replace(/\s+/g, " ").trim())));
}

function makeUniquePhrase(id, word, used, starterCounts) {
  const candidates = buildCandidates(id, word);

  // Prefer candidates whose starter group is currently least-used.
  const scored = candidates
    .map((c) => ({
      phrase: c,
      starter: starterKey(c),
    }))
    .sort((a, b) => {
      const ca = starterCounts[a.starter] ?? 0;
      const cb = starterCounts[b.starter] ?? 0;
      if (ca !== cb) return ca - cb;
      // tie-breaker: stable by phrase
      return a.phrase.localeCompare(b.phrase);
    });

  for (const item of scored) {
    if (!used.has(item.phrase)) {
      starterCounts[item.starter] = (starterCounts[item.starter] ?? 0) + 1;
      return item.phrase;
    }
  }

  // Last-resort: ensure uniqueness with id suffix.
  const forced = `${candidates[0]} (${id})`;
  if (!used.has(forced)) {
    const s = starterKey(forced);
    starterCounts[s] = (starterCounts[s] ?? 0) + 1;
    return forced;
  }

  let i = 0;
  while (true) {
    const next = `${candidates[0]} (${id}-${i})`;
    if (!used.has(next)) {
      const s = starterKey(next);
      starterCounts[s] = (starterCounts[s] ?? 0) + 1;
      return next;
    }
    i++;
  }
}

const used = new Set();
const starterCounts = {};

// Seed counts with preserved phrases so the generator balances around them.
for (const [, entry] of Object.entries(content)) {
  const phrase = String(entry.phrase || "").trim();
  used.add(phrase);
  const s = starterKey(phrase);
  starterCounts[s] = (starterCounts[s] ?? 0) + 1;
}

let changed = 0;
for (const [id, entry] of Object.entries(content)) {
  if (preservedIds.has(id)) continue;

  const prev = String(entry.phrase || "").trim();
  used.delete(prev);
  const prevStarter = starterKey(prev);
  starterCounts[prevStarter] = Math.max(0, (starterCounts[prevStarter] ?? 1) - 1);

  const next = makeUniquePhrase(id, entry.word, used, starterCounts);
  entry.phrase = next;
  used.add(next);
  changed++;
}

fs.writeFileSync(contentPath, JSON.stringify(content, null, 2) + "\n");
console.log(`Updated ${changed} phrases in content.json`);

// quick checks
const allPhrases = Object.values(content).map((e) => e.phrase);
const dup = allPhrases.length - new Set(allPhrases).size;
const lookAt = allPhrases.filter((p) => String(p).toLowerCase().startsWith("look at the ")).length;
console.log(`Duplicate phrases: ${dup}`);
console.log(`Remaining 'Look at the': ${lookAt}`);

const starts = allPhrases.map((p) => starterKey(p));
const freq = {};
for (const s of starts) freq[s] = (freq[s] ?? 0) + 1;
const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log("Starter distribution (top 10):", top);
