-- Align columns that were historically added outside Prisma migrations.
-- IF NOT EXISTS keeps this safe for environments where these fields were applied manually.

ALTER TABLE `agent`
  ADD COLUMN IF NOT EXISTS `widgetWhatsappEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS `widgetWhatsappNumber` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `widgetWhatsappLabel` VARCHAR(191) NOT NULL DEFAULT 'Continue on WhatsApp',
  ADD COLUMN IF NOT EXISTS `widgetWhatsappMessage` TEXT NOT NULL DEFAULT 'Hi, I was speaking with your AI assistant on your website and would like to continue the conversation on WhatsApp.',
  ADD COLUMN IF NOT EXISTS `widgetLauncherAnimation` VARCHAR(191) NOT NULL DEFAULT 'PULSE',
  ADD COLUMN IF NOT EXISTS `widgetLauncherLabel` VARCHAR(191) NOT NULL DEFAULT 'Chat with us',
  ADD COLUMN IF NOT EXISTS `widgetLauncherLabelEnabled` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `business`
  ADD COLUMN IF NOT EXISTS `notificationEmail` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `customSmtpEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS `smtpHost` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `smtpPort` INTEGER NULL,
  ADD COLUMN IF NOT EXISTS `smtpSecure` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS `smtpUser` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `smtpPasswordEncrypted` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `smtpFromName` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `smtpFromEmail` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `plan` VARCHAR(191) NOT NULL DEFAULT 'FREE',
  ADD COLUMN IF NOT EXISTS `subscriptionStatus` VARCHAR(191) NOT NULL DEFAULT 'FREE',
  ADD COLUMN IF NOT EXISTS `razorpaySubscriptionId` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `razorpayPlanId` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `subscriptionCurrentStart` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `subscriptionCurrentEnd` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `subscriptionCancelAtEnd` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS `monthlyConversationLimit` INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS `usagePeriodStart` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `usagePeriodEnd` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `bookingTimeZone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS `bookingSlotMinutes` INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS `bookingStartHour` INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS `bookingEndHour` INTEGER NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS `bookingDaysAhead` INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS `bookingWorkingDays` VARCHAR(191) NOT NULL DEFAULT '1,2,3,4,5',
  ADD COLUMN IF NOT EXISTS `googleAccessToken` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `googleRefreshToken` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `googleTokenExpiresAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `googleCalendarId` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `googleCalendarName` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `googleAccountEmail` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `googleCalendarConnectedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `business_razorpaySubscriptionId_key`
  ON `business`(`razorpaySubscriptionId`);
