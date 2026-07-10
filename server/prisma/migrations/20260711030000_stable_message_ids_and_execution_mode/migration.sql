ALTER TABLE `messages`
  ADD COLUMN `platform_msg_id` VARCHAR(191) NULL,
  ADD COLUMN `platform_new_msg_id` VARCHAR(191) NULL,
  ADD COLUMN `platform_create_time` VARCHAR(191) NULL;

UPDATE `messages`
SET `platform_new_msg_id` = `raw_message_id`
WHERE `raw_message_id` IS NOT NULL;

UPDATE `messages` AS `m`
INNER JOIN `send_requests` AS `sr` ON `sr`.`id` = `m`.`send_request_id`
SET
  `m`.`platform_msg_id` = `sr`.`result_msg_id`,
  `m`.`platform_new_msg_id` = COALESCE(`sr`.`result_new_msg_id`, `m`.`platform_new_msg_id`),
  `m`.`platform_create_time` = `sr`.`result_create_time`;

ALTER TABLE `send_requests`
  ADD COLUMN `execution_mode` ENUM('sync', 'async') NOT NULL DEFAULT 'sync' AFTER `delivery_mode`;

DROP INDEX `messages_raw_message_id_idx` ON `messages`;
ALTER TABLE `messages`
  DROP COLUMN `raw_message_id`,
  ADD INDEX `messages_platform_new_msg_id_idx` (`platform_new_msg_id`);

ALTER TABLE `send_requests`
  DROP COLUMN `result_msg_id`,
  DROP COLUMN `result_new_msg_id`,
  DROP COLUMN `result_create_time`;
