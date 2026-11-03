-- Additive Session 8.2a migration. Existing sessions and learning state are preserved.
-- Prisma 7.10.1 represents the two partial indexes via partialIndexes preview.
ALTER TABLE "StudySession" ALTER COLUMN "wordListId" DROP NOT NULL;
ALTER TABLE "StudySession" ADD COLUMN "scopeKey" TEXT,
  ADD COLUMN "reviewOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "eligibleCount" INTEGER;
UPDATE "StudySession" SET "scopeKey" = 'LIST:' || "wordListId"::text;
ALTER TABLE "StudySession" ALTER COLUMN "scopeKey" SET NOT NULL;
ALTER TABLE "StudySession" DROP CONSTRAINT "StudySession_active_check";
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_active_check" CHECK (
  CASE WHEN "reviewOnly" THEN "activeListId" IS NULL
  ELSE ("status" = 'ACTIVE') = ("activeListId" IS NOT NULL)
    AND "wordListId" IS NOT NULL
    AND ("activeListId" IS NULL OR "activeListId" = "wordListId") END
);
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_scope_check" CHECK (
  "scopeKey" = CASE WHEN "reviewOnly" THEN 'REVIEW:' ELSE '' END ||
    CASE WHEN "wordListId" IS NULL THEN 'ALL_LISTS' ELSE 'LIST:' || "wordListId"::text END
  AND ("wordListId" IS NOT NULL OR "reviewOnly")
);
CREATE UNIQUE INDEX "StudySession_active_scope_key" ON "StudySession"("ownerId", "scopeKey") WHERE "status" = 'ACTIVE';
ALTER TABLE "StudyCard" ADD COLUMN "originListId" UUID, ADD COLUMN "originListTitle" TEXT;
UPDATE "StudyCard" c SET "originListId" = s."wordListId", "originListTitle" = s."listTitle"
FROM "StudySession" s WHERE c."sessionId" = s."id";

-- Histories retain immutable list titles after source-list deletion.
ALTER TABLE "CompletedGame" ALTER COLUMN "wordListId" DROP NOT NULL;
ALTER TABLE "CompletedGame" DROP CONSTRAINT "CompletedGame_wordListId_fkey";
ALTER TABLE "CompletedGame" ADD CONSTRAINT "CompletedGame_wordListId_fkey"
  FOREIGN KEY ("wordListId") REFERENCES "WordList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "PracticeStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');
CREATE TABLE "PracticeSession" (
  "id" UUID NOT NULL PRIMARY KEY,
  "ownerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "practiceType" VARCHAR(20) NOT NULL,
  "wordListId" UUID REFERENCES "WordList"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "scopeKey" TEXT NOT NULL,
  "listTitle" VARCHAR(100) NOT NULL,
  "percentage" INTEGER NOT NULL CHECK ("percentage" IN (15,25,50,100)),
  "eligibleCount" INTEGER NOT NULL CHECK ("eligibleCount" > 0),
  "questionCount" INTEGER NOT NULL CHECK ("questionCount" > 0 AND "questionCount" <= "eligibleCount"),
  "currentPosition" INTEGER NOT NULL DEFAULT 0 CHECK ("currentPosition" >= 0 AND "currentPosition" <= "questionCount"),
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "status" "PracticeStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  "canceledAt" TIMESTAMPTZ(3),
  "completedGameId" UUID REFERENCES "CompletedGame"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PracticeSession_finished_check" CHECK (
    ("status" = 'ACTIVE' AND "completedAt" IS NULL AND "canceledAt" IS NULL AND "completedGameId" IS NULL)
    OR ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "canceledAt" IS NULL)
    OR ("status" = 'CANCELED' AND "canceledAt" IS NOT NULL AND "completedAt" IS NULL AND "completedGameId" IS NULL)
  )
);
CREATE UNIQUE INDEX "PracticeSession_completedGameId_key" ON "PracticeSession"("completedGameId");
CREATE UNIQUE INDEX "PracticeSession_active_scope_key" ON "PracticeSession"("ownerId", "practiceType", "scopeKey") WHERE "status" = 'ACTIVE';
CREATE INDEX "PracticeSession_ownerId_createdAt_idx" ON "PracticeSession"("ownerId", "createdAt");
CREATE TABLE "PracticeQuestion" (
  "id" UUID NOT NULL PRIMARY KEY,
  "sessionId" UUID NOT NULL REFERENCES "PracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "wordId" UUID REFERENCES "Word"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "sourceWordId" UUID NOT NULL,
  "position" INTEGER NOT NULL CHECK ("position" >= 0),
  "english" VARCHAR(120) NOT NULL,
  "meanings" TEXT[] NOT NULL CHECK (cardinality("meanings") > 0),
  "acceptedAnswers" TEXT[] NOT NULL CHECK (cardinality("acceptedAnswers") > 0),
  "overlappingAnswers" TEXT[] NOT NULL,
  "answer" TEXT,
  "normalizedAnswer" TEXT,
  "correct" BOOLEAN,
  "masteryEligible" BOOLEAN NOT NULL DEFAULT false,
  "masteryApplied" BOOLEAN NOT NULL DEFAULT false,
  "answeredAt" TIMESTAMPTZ(3),
  CONSTRAINT "PracticeQuestion_answer_check" CHECK (
    ("answer" IS NULL AND "normalizedAnswer" IS NULL AND "correct" IS NULL AND "answeredAt" IS NULL AND NOT "masteryEligible")
    OR ("answer" IS NOT NULL AND "normalizedAnswer" IS NOT NULL AND "correct" IS NOT NULL AND "answeredAt" IS NOT NULL)
  ),
  CONSTRAINT "PracticeQuestion_mastery_check" CHECK (
    (NOT "masteryEligible" OR "correct" IS TRUE) AND (NOT "masteryApplied" OR "masteryEligible")
  )
);
CREATE UNIQUE INDEX "PracticeQuestion_sessionId_position_key" ON "PracticeQuestion"("sessionId", "position");
CREATE UNIQUE INDEX "PracticeQuestion_sessionId_sourceWordId_key" ON "PracticeQuestion"("sessionId", "sourceWordId");
CREATE INDEX "PracticeQuestion_wordId_idx" ON "PracticeQuestion"("wordId");
