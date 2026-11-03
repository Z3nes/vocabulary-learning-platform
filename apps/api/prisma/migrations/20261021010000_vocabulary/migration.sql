CREATE TABLE "Word" (
    "id" UUID NOT NULL,
    "wordListId" UUID NOT NULL,
    "english" VARCHAR(120) NOT NULL,
    "normalizedEnglishKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Word_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WordMeaning" (
    "id" UUID NOT NULL,
    "wordId" UUID NOT NULL,
    "turkish" VARCHAR(160) NOT NULL,
    "normalizedMeaningKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "WordMeaning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Word_wordListId_normalizedEnglishKey_key" ON "Word"("wordListId", "normalizedEnglishKey");
CREATE INDEX "Word_wordListId_createdAt_id_idx" ON "Word"("wordListId", "createdAt", "id");
CREATE UNIQUE INDEX "WordMeaning_wordId_normalizedMeaningKey_key" ON "WordMeaning"("wordId", "normalizedMeaningKey");
CREATE INDEX "WordMeaning_wordId_position_idx" ON "WordMeaning"("wordId", "position");

ALTER TABLE "Word" ADD CONSTRAINT "Word_wordListId_fkey" FOREIGN KEY ("wordListId") REFERENCES "WordList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WordMeaning" ADD CONSTRAINT "WordMeaning_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
