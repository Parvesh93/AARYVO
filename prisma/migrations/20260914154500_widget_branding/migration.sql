ALTER TABLE `agent`
  ADD COLUMN `widgetAccentColor` VARCHAR(191) NOT NULL DEFAULT '#111319',
  ADD COLUMN `widgetTheme` VARCHAR(191) NOT NULL DEFAULT 'LIGHT',
  ADD COLUMN `widgetTitle` VARCHAR(191) NOT NULL DEFAULT 'AARYVO',
  ADD COLUMN `widgetSubtitle` VARCHAR(191) NOT NULL DEFAULT 'AI sales agent online',
  ADD COLUMN `widgetWelcomeMessage` TEXT NOT NULL,
  ADD COLUMN `widgetStartLabel` VARCHAR(191) NOT NULL DEFAULT 'Start conversation →',
  ADD COLUMN `widgetBookLabel` VARCHAR(191) NOT NULL DEFAULT 'Book a consultation',
  ADD COLUMN `widgetPosition` VARCHAR(191) NOT NULL DEFAULT 'RIGHT',
  ADD COLUMN `widgetLauncherStyle` VARCHAR(191) NOT NULL DEFAULT 'SPARKLE',
  ADD COLUMN `widgetShowPoweredBy` BOOLEAN NOT NULL DEFAULT true;

UPDATE `agent`
SET `widgetWelcomeMessage` = 'Hi 👋 Thanks for sharing your details. How can I help you today?'
WHERE `widgetWelcomeMessage` IS NULL OR `widgetWelcomeMessage` = '';
