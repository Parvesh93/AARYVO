ALTER TABLE `agent`
  ADD COLUMN `tone` VARCHAR(191) NOT NULL DEFAULT 'Professional',
  ADD COLUMN `qualificationQuestions` TEXT NULL,
  ADD COLUMN `bookingScoreThreshold` INTEGER NOT NULL DEFAULT 65,
  ADD COLUMN `handoffInstructions` TEXT NULL;
