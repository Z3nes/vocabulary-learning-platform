-- SQL CHECK accepts UNKNOWN. Use CASE so a NULL resolution cannot evade the
-- unresolved-state invariant through three-valued OR expressions.
ALTER TABLE "PracticeQuestion" DROP CONSTRAINT "PracticeQuestion_resolution_check";
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_resolution_check" CHECK (
  CASE WHEN "resolution" IS NULL THEN "resolvedAt" IS NULL AND "answer" IS NULL
  ELSE "resolvedAt" IS NOT NULL AND
    CASE WHEN "resolution" = 'ANSWERED' THEN "answer" IS NOT NULL
    ELSE "answer" IS NULL AND "correct" IS NULL AND "answeredAt" IS NULL
      AND NOT "masteryEligible" AND NOT "masteryApplied"
    END
  END
);
