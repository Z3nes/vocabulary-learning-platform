-- Generated additive enum/columns, with explicit backfill and resolution invariants.
CREATE TYPE "PracticeResolution" AS ENUM ('ANSWERED', 'AUDIO_UNAVAILABLE');
ALTER TABLE "PracticeQuestion" ADD COLUMN "resolution" "PracticeResolution",
  ADD COLUMN "resolvedAt" TIMESTAMPTZ(3);
UPDATE "PracticeQuestion" SET "resolution" = 'ANSWERED', "resolvedAt" = "answeredAt"
  WHERE "answer" IS NOT NULL;
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_resolution_check" CHECK (
  ("resolution" IS NULL AND "resolvedAt" IS NULL AND "answer" IS NULL)
  OR ("resolution" = 'ANSWERED' AND "resolvedAt" IS NOT NULL AND "answer" IS NOT NULL)
  OR ("resolution" = 'AUDIO_UNAVAILABLE' AND "resolvedAt" IS NOT NULL
    AND "answer" IS NULL AND "correct" IS NULL AND "answeredAt" IS NULL
    AND NOT "masteryEligible" AND NOT "masteryApplied")
);
-- Keep the legacy client-reported games restricted to their existing sizes/types.
ALTER TABLE "CompletedGame" DROP CONSTRAINT "CompletedGame_gameType_check";
ALTER TABLE "CompletedGame" ADD CONSTRAINT "CompletedGame_gameType_check"
  CHECK ("gameType" IN ('quiz','matching','assembly','memory','written-recall','listening'));
ALTER TABLE "CompletedGame" DROP CONSTRAINT "CompletedGame_items_check";
ALTER TABLE "CompletedGame" ADD CONSTRAINT "CompletedGame_items_check" CHECK (
  jsonb_typeof("items") = 'array' AND jsonb_array_length("items") >= 1
  AND ("gameType" IN ('written-recall','listening') OR jsonb_array_length("items") <= 10)
);
-- Existing ACTIVE partial unique indexes remain unchanged: type + non-null scope.
