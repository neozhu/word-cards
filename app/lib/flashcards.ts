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
  const nature = data.categories?.find((c) => c.id === "nature");
  const categoryEmojiIds = nature?.emojis ?? [];

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
