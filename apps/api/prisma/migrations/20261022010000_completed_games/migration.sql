CREATE TABLE "CompletedGame" (
  "id" UUID NOT NULL PRIMARY KEY,
  "ownerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "completionId" UUID NOT NULL,
  "wordListId" UUID NOT NULL REFERENCES "WordList"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "listTitle" VARCHAR(100) NOT NULL,
  "gameType" VARCHAR(20) NOT NULL CHECK ("gameType" IN ('quiz', 'matching', 'assembly', 'memory')),
  "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestHash" VARCHAR(64) NOT NULL,
  "items" JSONB NOT NULL CHECK (jsonb_typeof("items") = 'array' AND jsonb_array_length("items") BETWEEN 1 AND 10)
);
CREATE UNIQUE INDEX "CompletedGame_ownerId_completionId_key" ON "CompletedGame"("ownerId", "completionId");
CREATE INDEX "CompletedGame_ownerId_completedAt_id_idx" ON "CompletedGame"("ownerId", "completedAt", "id");
