-- Expand history constraints only for server-evaluated written recall.
ALTER TABLE "CompletedGame" DROP CONSTRAINT "CompletedGame_gameType_check";
ALTER TABLE "CompletedGame" ADD CONSTRAINT "CompletedGame_gameType_check"
  CHECK ("gameType" IN ('quiz', 'matching', 'assembly', 'memory', 'written-recall'));
ALTER TABLE "CompletedGame" DROP CONSTRAINT "CompletedGame_items_check";
ALTER TABLE "CompletedGame" ADD CONSTRAINT "CompletedGame_items_check" CHECK (
  jsonb_typeof("items") = 'array' AND jsonb_array_length("items") >= 1
  AND ("gameType" = 'written-recall' OR jsonb_array_length("items") <= 10)
);
-- Preserve the four legacy games' established list-deletion cascade. Persistent
-- practice history stores its list snapshot and links through PracticeSession;
-- its CompletedGame.wordListId is NULL, so source deletion cannot erase it.
ALTER TABLE "CompletedGame" DROP CONSTRAINT "CompletedGame_wordListId_fkey";
ALTER TABLE "CompletedGame" ADD CONSTRAINT "CompletedGame_wordListId_fkey"
  FOREIGN KEY ("wordListId") REFERENCES "WordList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
