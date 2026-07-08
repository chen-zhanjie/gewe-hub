ALTER TABLE `messages`
  MODIFY `type` ENUM('text', 'image', 'voice', 'video', 'file', 'emoji', 'link', 'html', 'mini_program', 'chat_record', 'location', 'card', 'transfer', 'red_packet', 'system', 'unsupported') NOT NULL;

CREATE TABLE IF NOT EXISTS `html_pages` (
  `id` VARCHAR(191) NOT NULL,
  `token` VARCHAR(191) NOT NULL,
  `account_id` VARCHAR(191) NOT NULL,
  `conversation_id` VARCHAR(191) NOT NULL,
  `app_id` VARCHAR(191) NULL,
  `send_request_id` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `desc` TEXT NULL,
  `file_name` VARCHAR(191) NULL,
  `storage_key` VARCHAR(1024) NOT NULL,
  `public_url` TEXT NOT NULL,
  `size` INTEGER NOT NULL,
  `status` ENUM('active', 'archived', 'deleted') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `html_pages_token_key`(`token`),
  UNIQUE INDEX `html_pages_send_request_id_key`(`send_request_id`),
  INDEX `html_pages_account_id_created_at_idx`(`account_id`, `created_at`),
  INDEX `html_pages_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
  INDEX `html_pages_status_created_at_idx`(`status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @html_pages_account_fk_exists = (
  SELECT COUNT(1)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'html_pages'
    AND constraint_name = 'html_pages_account_id_fkey'
);
SET @html_pages_account_fk_sql = IF(
  @html_pages_account_fk_exists = 0,
  'ALTER TABLE `html_pages` ADD CONSTRAINT `html_pages_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `wechat_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE html_pages_account_fk_stmt FROM @html_pages_account_fk_sql;
EXECUTE html_pages_account_fk_stmt;
DEALLOCATE PREPARE html_pages_account_fk_stmt;

SET @html_pages_conversation_fk_exists = (
  SELECT COUNT(1)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'html_pages'
    AND constraint_name = 'html_pages_conversation_id_fkey'
);
SET @html_pages_conversation_fk_sql = IF(
  @html_pages_conversation_fk_exists = 0,
  'ALTER TABLE `html_pages` ADD CONSTRAINT `html_pages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE html_pages_conversation_fk_stmt FROM @html_pages_conversation_fk_sql;
EXECUTE html_pages_conversation_fk_stmt;
DEALLOCATE PREPARE html_pages_conversation_fk_stmt;

SET @html_pages_app_fk_exists = (
  SELECT COUNT(1)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'html_pages'
    AND constraint_name = 'html_pages_app_id_fkey'
);
SET @html_pages_app_fk_sql = IF(
  @html_pages_app_fk_exists = 0,
  'ALTER TABLE `html_pages` ADD CONSTRAINT `html_pages_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `hub_apps`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE html_pages_app_fk_stmt FROM @html_pages_app_fk_sql;
EXECUTE html_pages_app_fk_stmt;
DEALLOCATE PREPARE html_pages_app_fk_stmt;

SET @html_pages_send_request_fk_exists = (
  SELECT COUNT(1)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'html_pages'
    AND constraint_name = 'html_pages_send_request_id_fkey'
);
SET @html_pages_send_request_fk_sql = IF(
  @html_pages_send_request_fk_exists = 0,
  'ALTER TABLE `html_pages` ADD CONSTRAINT `html_pages_send_request_id_fkey` FOREIGN KEY (`send_request_id`) REFERENCES `send_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE html_pages_send_request_fk_stmt FROM @html_pages_send_request_fk_sql;
EXECUTE html_pages_send_request_fk_stmt;
DEALLOCATE PREPARE html_pages_send_request_fk_stmt;
