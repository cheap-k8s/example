-- CreateTable
CREATE TABLE "Counter" (
    "id" SERIAL NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateRecord
INSERT INTO "Counter" VALUES (0, 0);
