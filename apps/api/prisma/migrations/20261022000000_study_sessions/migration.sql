-- CreateEnum
CREATE TYPE "StudyDirection" AS ENUM ('EN_TR', 'TR_EN');

-- CreateEnum
CREATE TYPE "StudySessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ENDED_EARLY');

-- CreateEnum
CREATE TYPE "StudyOutcome" AS ENUM ('KNOWN', 'MISSED', 'REMOVED');

-- CreateTable
CREATE TABLE "StudySession" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "wordListId" UUID NOT NULL,
    "activeListId" UUID,
    "listTitle" VARCHAR(100) NOT NULL,
    "direction" "StudyDirection" NOT NULL,
    "percentage" INTEGER NOT NULL,
    "cardCount" INTEGER NOT NULL,
    "status" "StudySessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyCard" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "wordId" UUID,
    "english" VARCHAR(120) NOT NULL,
    "meanings" TEXT[],
    "position" INTEGER NOT NULL,
    "queueOrder" INTEGER NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "StudyOutcome",
    "answeredAt" TIMESTAMPTZ(3),

    CONSTRAINT "StudyCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordProgress" (
    "wordId" UUID NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "knownStreak" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WordProgress_pkey" PRIMARY KEY ("wordId")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudySession_activeListId_key" ON "StudySession"("activeListId");

-- CreateIndex
CREATE INDEX "StudySession_ownerId_wordListId_startedAt_idx" ON "StudySession"("ownerId", "wordListId", "startedAt");

-- CreateIndex
CREATE INDEX "StudyCard_wordId_idx" ON "StudyCard"("wordId");

-- CreateIndex
CREATE UNIQUE INDEX "StudyCard_sessionId_position_key" ON "StudyCard"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "StudyCard_sessionId_queueOrder_key" ON "StudyCard"("sessionId", "queueOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StudyCard_sessionId_wordId_key" ON "StudyCard"("sessionId", "wordId");

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_wordListId_fkey" FOREIGN KEY ("wordListId") REFERENCES "WordList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyCard" ADD CONSTRAINT "StudyCard_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyCard" ADD CONSTRAINT "StudyCard_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordProgress" ADD CONSTRAINT "WordProgress_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Invariants that Prisma's schema language cannot express. Additive and checked
-- on new rows only (the tables above are new, so no existing data is affected).
ALTER TABLE "StudySession"
    ADD CONSTRAINT "StudySession_percentage_check" CHECK ("percentage" IN (15, 25, 50, 100)),
    ADD CONSTRAINT "StudySession_cardCount_check" CHECK ("cardCount" > 0),
    ADD CONSTRAINT "StudySession_version_check" CHECK ("version" >= 0),
    -- One active session per list: activeListId mirrors wordListId only while ACTIVE.
    ADD CONSTRAINT "StudySession_active_check" CHECK (
        ("status" = 'ACTIVE') = ("activeListId" IS NOT NULL)
        AND ("activeListId" IS NULL OR "activeListId" = "wordListId")
    ),
    ADD CONSTRAINT "StudySession_finished_check" CHECK (("status" = 'ACTIVE') = ("finishedAt" IS NULL));

ALTER TABLE "StudyCard"
    ADD CONSTRAINT "StudyCard_meanings_check" CHECK ("meanings" IS NOT NULL AND cardinality("meanings") > 0),
    ADD CONSTRAINT "StudyCard_order_check" CHECK ("position" >= 0 AND "queueOrder" >= 0),
    ADD CONSTRAINT "StudyCard_answered_check" CHECK (("outcome" IS NULL) = ("answeredAt" IS NULL)),
    -- A card can only be removed after it was skipped once.
    ADD CONSTRAINT "StudyCard_removed_check" CHECK ("outcome" IS DISTINCT FROM 'REMOVED' OR "skipped");

ALTER TABLE "WordProgress"
    ADD CONSTRAINT "WordProgress_knownStreak_check" CHECK ("knownStreak" >= 0);
