CREATE TABLE `shopifystore` (
  `id` VARCHAR(191) NOT NULL,
  `businessId` VARCHAR(191) NOT NULL,
  `shopDomain` VARCHAR(191) NOT NULL,
  `accessTokenEncrypted` TEXT NOT NULL,
  `scope` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'CONNECTED',
  `connectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSyncAt` DATETIME(3) NULL,
  `lastSyncStatus` VARCHAR(191) NULL,
  `lastSyncError` TEXT NULL,
  UNIQUE INDEX `shopifystore_businessId_key`(`businessId`),
  UNIQUE INDEX `shopifystore_shopDomain_key`(`shopDomain`),
  PRIMARY KEY (`id`),
  CONSTRAINT `shopifystore_businessId_fkey`
    FOREIGN KEY (`businessId`) REFERENCES `business`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shopifyproduct` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `shopifyProductId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `handle` VARCHAR(191) NULL,
  `description` LONGTEXT NULL,
  `vendor` VARCHAR(191) NULL,
  `productType` VARCHAR(191) NULL,
  `status` VARCHAR(191) NULL,
  `tags` TEXT NULL,
  `featuredImageUrl` TEXT NULL,
  `onlineStoreUrl` TEXT NULL,
  `minPrice` DOUBLE NULL,
  `maxPrice` DOUBLE NULL,
  `currencyCode` VARCHAR(191) NULL,
  `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `shopifyUpdatedAt` DATETIME(3) NULL,
  UNIQUE INDEX `shopifyproduct_storeId_shopifyProductId_key`(`storeId`, `shopifyProductId`),
  INDEX `shopifyproduct_storeId_title_idx`(`storeId`, `title`),
  INDEX `shopifyproduct_storeId_productType_idx`(`storeId`, `productType`),
  PRIMARY KEY (`id`),
  CONSTRAINT `shopifyproduct_storeId_fkey`
    FOREIGN KEY (`storeId`) REFERENCES `shopifystore`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shopifyvariant` (
  `id` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `shopifyVariantId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `sku` VARCHAR(191) NULL,
  `price` DOUBLE NULL,
  `compareAtPrice` DOUBLE NULL,
  `availableForSale` BOOLEAN NOT NULL DEFAULT false,
  `inventoryQuantity` INTEGER NULL,
  `imageUrl` TEXT NULL,
  `optionSummary` TEXT NULL,
  `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `shopifyvariant_productId_shopifyVariantId_key`(`productId`, `shopifyVariantId`),
  INDEX `shopifyvariant_productId_idx`(`productId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `shopifyvariant_productId_fkey`
    FOREIGN KEY (`productId`) REFERENCES `shopifyproduct`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
