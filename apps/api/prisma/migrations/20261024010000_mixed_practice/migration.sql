-- Nullable mixed-question metadata leaves all existing practice rows unchanged.
ALTER TABLE "PracticeQuestion"
  ADD COLUMN "activityType" VARCHAR(20),
  ADD COLUMN "originListId" UUID,
  ADD COLUMN "originListTitle" VARCHAR(100),
  ADD COLUMN "modeData" JSONB,
  ADD COLUMN "revealedAt" TIMESTAMPTZ(3);
ALTER TABLE "PracticeQuestion" DROP CONSTRAINT "PracticeQuestion_answer_check";
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_answer_check" CHECK (
  CASE WHEN "answer" IS NULL THEN
    "normalizedAnswer" IS NULL AND "correct" IS NULL AND "answeredAt" IS NULL AND NOT "masteryEligible"
  ELSE "normalizedAnswer" IS NOT NULL AND "answeredAt" IS NOT NULL AND
    CASE WHEN "activityType" = 'flashcard' THEN
      "correct" IS NULL AND "answer" IN ('known','missed') AND "normalizedAnswer" = "answer" AND "revealedAt" IS NOT NULL
    ELSE "correct" IS NOT NULL END
  END
);
ALTER TABLE "PracticeQuestion" DROP CONSTRAINT "PracticeQuestion_mastery_check";
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_mastery_check" CHECK (
  (NOT "masteryEligible" OR CASE WHEN "activityType" = 'flashcard'
    THEN "answer" IS NOT NULL AND "answer" = 'known' ELSE "correct" IS TRUE END)
  AND (NOT "masteryApplied" OR "masteryEligible")
  AND ("activityType" IS DISTINCT FROM 'choice' OR NOT "masteryEligible")
);
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_mixed_metadata_check" CHECK (
  CASE WHEN "activityType" IS NULL THEN
    "originListId" IS NULL AND "originListTitle" IS NULL AND "modeData" IS NULL AND "revealedAt" IS NULL
  ELSE "activityType" IN ('flashcard','written-recall','listening','choice')
    AND "originListId" IS NOT NULL AND "originListTitle" IS NOT NULL
    AND ("revealedAt" IS NULL OR "activityType" = 'flashcard')
    AND CASE WHEN "activityType" = 'choice' THEN
      (jsonb_typeof("modeData") = 'object' AND jsonb_typeof("modeData"->'options') = 'array'
        AND jsonb_array_length("modeData"->'options') = 4
        AND jsonb_typeof("modeData"->'correctOptionId') = 'string') IS TRUE
    ELSE "modeData" IS NULL END
  END
);
-- All existing partial indexes and four client-reported game limits are retained.
ALTER TABLE "CompletedGame" DROP CONSTRAINT "CompletedGame_gameType_check";
ALTER TABLE "CompletedGame" ADD CONSTRAINT "CompletedGame_gameType_check" CHECK (
  "gameType" IN ('quiz','matching','assembly','memory','written-recall','listening','word-search','crossword','mixed')
);
ALTER TABLE "CompletedGame" DROP CONSTRAINT "CompletedGame_items_check";
ALTER TABLE "CompletedGame" ADD CONSTRAINT "CompletedGame_items_check" CHECK (
  jsonb_typeof("items") = 'array' AND jsonb_array_length("items") >= 1 AND
  ("gameType" IN ('written-recall','listening','word-search','crossword','mixed') OR jsonb_array_length("items") <= 10)
);
