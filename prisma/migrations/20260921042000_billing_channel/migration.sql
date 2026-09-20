ALTER TABLE `business`
  ADD COLUMN `billingChannel` VARCHAR(191) NOT NULL DEFAULT 'DIRECT';

UPDATE `business` b
INNER JOIN `shopifystore` s ON s.`businessId` = b.`id`
SET b.`billingChannel` = 'SHOPIFY'
WHERE b.`razorpaySubscriptionId` IS NULL;
