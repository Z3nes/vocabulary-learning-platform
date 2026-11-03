-- Forward-only board session extension. No existing data or indexes are removed.
CREATE TABLE "PuzzleSession" (
  "id" UUID NOT NULL PRIMARY KEY,
  "ownerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "wordListId" UUID REFERENCES "WordList"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "scopeKey" TEXT NOT NULL,
  "listTitle" VARCHAR(100) NOT NULL,
  "gameType" VARCHAR(20) NOT NULL CHECK ("gameType" IN ('word-search','crossword')),
  "percentage" INTEGER NOT NULL CHECK ("percentage" IN (15,25,50,100)),
  "eligibleCount" INTEGER NOT NULL,
  "selectedCount" INTEGER NOT NULL,
  "placedCount" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "status" "PracticeStatus" NOT NULL DEFAULT 'ACTIVE',
  "document" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  "canceledAt" TIMESTAMPTZ(3),
  "completedGameId" UUID REFERENCES "CompletedGame"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PuzzleSession_counts_check" CHECK (
    "eligibleCount" >= "selectedCount" AND "selectedCount" >= "placedCount" AND "placedCount" > 0),
  CONSTRAINT "PuzzleSession_scope_check" CHECK ("scopeKey" ~ '^LIST:[0-9a-f-]{36}$'),
  CONSTRAINT "PuzzleSession_document_check" CHECK (
    (jsonb_typeof("document") = 'object' AND "document"->>'schemaVersion' = '1'
      AND jsonb_typeof("document"->'boards') = 'array'
      AND jsonb_array_length("document"->'boards') > 0
      AND jsonb_typeof("document"->'selected') = 'array'
      AND jsonb_array_length("document"->'selected') = "selectedCount"
      AND jsonb_typeof("document"->'omitted') = 'array') IS TRUE),
  CONSTRAINT "PuzzleSession_lifecycle_check" CHECK (
    ("status" = 'ACTIVE' AND "completedAt" IS NULL AND "canceledAt" IS NULL AND "completedGameId" IS NULL)
    OR ("status" = 'CANCELED' AND "canceledAt" IS NOT NULL AND "completedAt" IS NULL AND "completedGameId" IS NULL)
    OR ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "canceledAt" IS NULL))
);
CREATE UNIQUE INDEX "PuzzleSession_completedGameId_key" ON "PuzzleSession"("completedGameId");
CREATE UNIQUE INDEX "PuzzleSession_active_scope_key" ON "PuzzleSession"("ownerId","gameType","scopeKey") WHERE "status" = 'ACTIVE';
CREATE INDEX "PuzzleSession_ownerId_createdAt_idx" ON "PuzzleSession"("ownerId","createdAt");
CREATE TABLE "PuzzleCommand" (
  "id" UUID NOT NULL PRIMARY KEY,
  "sessionId" UUID NOT NULL REFERENCES "PuzzleSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "commandId" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "correct" BOOLEAN
);
CREATE UNIQUE INDEX "PuzzleCommand_sessionId_commandId_key" ON "PuzzleCommand"("sessionId","commandId");
-- Preserve the ten-item bound on all four legacy client-reported games.
ALTER TABLE "CompletedGame" DROP CONSTRAINT "CompletedGame_gameType_check";
ALTER TABLE "CompletedGame" ADD CONSTRAINT "CompletedGame_gameType_check"
  CHECK ("gameType" IN ('quiz','matching','assembly','memory','written-recall','listening','word-search','crossword'));
ALTER TABLE "CompletedGame" DROP CONSTRAINT "CompletedGame_items_check";
ALTER TABLE "CompletedGame" ADD CONSTRAINT "CompletedGame_items_check" CHECK (
  jsonb_typeof("items") = 'array' AND jsonb_array_length("items") >= 1
  AND ("gameType" IN ('written-recall','listening','word-search','crossword') OR jsonb_array_length("items") <= 10)
);
