CREATE TABLE `shopifymerchantlink` (
    `id` VARCHAR(191) NOT NULL,
    `shopDomain` VARCHAR(191) NOT NULL,
    `appClientId` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `shopifymerchantlink_shopDomain_appClientId_key`(`shopDomain`, `appClientId`),
    INDEX `shopifymerchantlink_businessId_idx`(`businessId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `shopifymerchantlink`
ADD CONSTRAINT `shopifymerchantlink_businessId_fkey`
FOREIGN KEY (`businessId`) REFERENCES `business`(`id`)
ON DELETE CASCADE ON UPDATE CASCADE;
