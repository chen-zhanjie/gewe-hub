-- CreateTable
CREATE TABLE `media_assets` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `message_id` VARCHAR(191) NOT NULL,
    `node_path` VARCHAR(191) NOT NULL,
    `kind` ENUM('image', 'voice', 'video', 'file', 'emoji') NOT NULL,
    `status` ENUM('pending', 'ready', 'failed') NOT NULL DEFAULT 'pending',
    `source_payload` JSON NOT NULL,
    `local_path` VARCHAR(1024) NULL,
    `public_url` VARCHAR(1024) NULL,
    `mime_type` VARCHAR(191) NULL,
    `file_name` VARCHAR(191) NULL,
    `size` INTEGER NULL,
    `error_message` TEXT NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `media_assets_message_id_node_path_key`(`message_id`, `node_path`),
    INDEX `media_assets_status_idx`(`status`),
    INDEX `media_assets_account_id_idx`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `wechat_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
