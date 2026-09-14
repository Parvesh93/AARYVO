ALTER TABLE `business`
  ADD COLUMN `googleAccessToken` TEXT NULL,
  ADD COLUMN `googleRefreshToken` TEXT NULL,
  ADD COLUMN `googleTokenExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `googleCalendarId` VARCHAR(191) NULL,
  ADD COLUMN `googleCalendarName` VARCHAR(191) NULL,
  ADD COLUMN `googleAccountEmail` VARCHAR(191) NULL,
  ADD COLUMN `googleCalendarConnectedAt` DATETIME(3) NULL;
