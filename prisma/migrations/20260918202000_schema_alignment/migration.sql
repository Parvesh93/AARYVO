-- Align fields that exist in the current Prisma schema but were historically
-- added outside the tracked migration chain. Run this only after the four
-- 20260914 migrations have been applied.

ALTER TABLE `agent`
  ADD COLUMN `widgetWhatsappEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `widgetWhatsappNumber` VARCHAR(191) NULL,
  ADD COLUMN `widgetWhatsappLabel` VARCHAR(191) NOT NULL DEFAULT 'Continue on WhatsApp',
  ADD COLUMN `widgetWhatsappMessage` TEXT NOT NULL,
  ADD COLUMN `widgetLauncherAnimation` VARCHAR(191) NOT NULL DEFAULT 'PULSE',
  ADD COLUMN `widgetLauncherLabel` VARCHAR(191) NOT NULL DEFAULT 'Chat with us',
  ADD COLUMN `widgetLauncherLabelEnabled` BOOLEAN NOT NULL DEFAULT true;

UPDATE `agent`
SET `widgetWhatsappMessage` = 'Hi, I was speaking with your AI assistant on your website and would like to continue the conversation on WhatsApp.'
WHERE `widgetWhatsappMessage` IS NULL OR `widgetWhatsappMessage` = '';

ALTER TABLE `business`
  ADD COLUMN `notificationEmail` VARCHAR(191) NULL,
  ADD COLUMN `customSmtpEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `smtpHost` VARCHAR(191) NULL,
  ADD COLUMN `smtpPort` INTEGER NULL,
  ADD COLUMN `smtpSecure` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `smtpUser` VARCHAR(191) NULL,
  ADD COLUMN `smtpPasswordEncrypted` TEXT NULL,
  ADD COLUMN `smtpFromName` VARCHAR(191) NULL,
  ADD COLUMN `smtpFromEmail` VARCHAR(191) NULL,
  ADD COLUMN `plan` VARCHAR(191) NOT NULL DEFAULT 'FREE',
  ADD COLUMN `subscriptionStatus` VARCHAR(191) NOT NULL DEFAULT 'FREE',
  ADD COLUMN `razorpaySubscriptionId` VARCHAR(191) NULL,
  ADD COLUMN `razorpayPlanId` VARCHAR(191) NULL,
  ADD COLUMN `subscriptionCurrentStart` DATETIME(3) NULL,
  ADD COLUMN `subscriptionCurrentEnd` DATETIME(3) NULL,
  ADD COLUMN `subscriptionCancelAtEnd` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `monthlyConversationLimit` INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN `usagePeriodStart` DATETIME(3) NULL,
  ADD COLUMN `usagePeriodEnd` DATETIME(3) NULL,
  ADD COLUMN `bookingTimeZone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN `bookingSlotMinutes` INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN `bookingStartHour` INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN `bookingEndHour` INTEGER NOT NULL DEFAULT 18,
  ADD COLUMN `bookingDaysAhead` INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN `bookingWorkingDays` VARCHAR(191) NOT NULL DEFAULT '1,2,3,4,5',
  ADD COLUMN `googleAccessToken` TEXT NULL,
  ADD COLUMN `googleRefreshToken` TEXT NULL,
  ADD COLUMN `googleTokenExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `googleCalendarId` VARCHAR(191) NULL,
  ADD COLUMN `googleCalendarName` VARCHAR(191) NULL,
  ADD COLUMN `googleAccountEmail` VARCHAR(191) NULL,
  ADD COLUMN `googleCalendarConnectedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `business_razorpaySubscriptionId_key`
  ON `business`(`razorpaySubscriptionId`);
