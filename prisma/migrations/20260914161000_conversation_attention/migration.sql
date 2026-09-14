ALTER TABLE `conversation`
  ADD COLUMN `needsHuman` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `attentionReason` TEXT NULL,
  ADD COLUMN `resolvedAt` DATETIME(3) NULL;
