import emojiMartData from "@emoji-mart/data";
import content from "@/content.json";

export type FlashcardItem = {
  id: string;
  emoji: string;
  word: string;
  phrase: string;
};

type ContentEntry = {
  word: string;
  phrase: string;
};

export function buildFlashcards(): FlashcardItem[] {
  const data = emojiMartData as unknown as {
    categories: Array<{ id: string; emojis: string[] }>;
    emojis: Record<
      string,
      {
        skins?: Array<{ native?: string }>;
      }
    >;
  };

  // In @emoji-mart/data@1.x, animals live under the broader "nature" category.
  // Food & Drink live under the "foods" category.
  const categoryIdsToInclude = ["nature", "foods"] as const;

  const categoryEmojiIds: string[] = [];
  const seen = new Set<string>();
  for (const categoryId of categoryIdsToInclude) {
    const cat = data.categories?.find((c) => c.id === categoryId);
    for (const id of cat?.emojis ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      categoryEmojiIds.push(id);
    }
  }

  const allowedIds = new Set(Object.keys(content));

  return categoryEmojiIds
    .filter((id) => allowedIds.has(id))
    .map((id) => {
      const entry = (content as Record<string, ContentEntry>)[id];
      const emoji = data.emojis?.[id]?.skins?.[0]?.native ?? "❓";

      return {
        id,
        emoji,
        word: entry.word,
        phrase: entry.phrase,
      };
    });
}
