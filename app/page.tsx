import FlashcardDeck from "./components/FlashcardDeck";
import { buildFlashcards } from "./lib/flashcards";

export default function Home() {
  const cards = buildFlashcards();

  return (
    <div className="min-h-screen bg-(--app-bg) sm:bg-(--page-bg)">
      <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col items-center justify-center px-6 pt-[calc(14px+env(safe-area-inset-top))] pb-[calc(14px+env(safe-area-inset-bottom))]">
        <FlashcardDeck cards={cards} />
      </main>
    </div>
  );
}
