CREATE TABLE `User` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NULL,
  `email` VARCHAR(191) NOT NULL,
  `passwordHash` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `User_email_key` (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Business` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `websiteUrl` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Business_slug_key` (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BusinessMember` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `businessId` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL DEFAULT 'OWNER',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `BusinessMember_userId_businessId_key` (`userId`, `businessId`),
  CONSTRAINT `BusinessMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `BusinessMember_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Agent` (
  `id` VARCHAR(191) NOT NULL,
  `businessId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `goal` VARCHAR(191) NOT NULL,
  `systemPrompt` TEXT NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (`id`),
  CONSTRAINT `Agent_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `KnowledgeItem` (
  `id` VARCHAR(191) NOT NULL,
  `agentId` VARCHAR(191) NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NULL,
  `content` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `KnowledgeItem_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Conversation` (
  `id` VARCHAR(191) NOT NULL,
  `agentId` VARCHAR(191) NOT NULL,
  `channel` ENUM('WEBSITE','WHATSAPP','INSTAGRAM','VOICE') NOT NULL DEFAULT 'WEBSITE',
  `visitorId` VARCHAR(191) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Conversation_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Message` (
  `id` VARCHAR(191) NOT NULL,
  `conversationId` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL,
  `content` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Lead` (
  `id` VARCHAR(191) NOT NULL,
  `businessId` VARCHAR(191) NOT NULL,
  `conversationId` VARCHAR(191) NULL,
  `name` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `requirement` TEXT NULL,
  `budget` VARCHAR(191) NULL,
  `score` INTEGER NOT NULL DEFAULT 0,
  `status` ENUM('NEW','WARM','HOT','QUALIFIED','WON','LOST') NOT NULL DEFAULT 'NEW',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Lead_conversationId_key` (`conversationId`),
  CONSTRAINT `Lead_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Lead_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Appointment` (
  `id` VARCHAR(191) NOT NULL,
  `businessId` VARCHAR(191) NOT NULL,
  `leadId` VARCHAR(191) NULL,
  `startsAt` DATETIME(3) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'REQUESTED',
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Appointment_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Appointment_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
