ALTER TABLE `send_requests`
  ADD COLUMN `delivery_mode` ENUM('immediate', 'discard', 'confirm') NOT NULL DEFAULT 'immediate' AFTER `idempotency_key`;

UPDATE `send_requests`
SET `delivery_mode` = 'confirm'
WHERE `status` = 'held';
