ALTER TABLE `shopifystore`
  ADD COLUMN `refreshTokenEncrypted` TEXT NULL,
  ADD COLUMN `accessTokenExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `refreshTokenExpiresAt` DATETIME(3) NULL;
