-- CreateTable
CREATE TABLE `wechat_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NOT NULL,
    `wxid` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `region` VARCHAR(191) NULL,
    `online_status` ENUM('online', 'offline', 'unknown') NOT NULL DEFAULT 'unknown',
    `source` ENUM('auto', 'manual') NOT NULL DEFAULT 'auto',
    `platform_remark` VARCHAR(191) NULL,
    `last_synced_at` DATETIME(3) NULL,
    `discovered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wechat_accounts_wxid_key`(`wxid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contacts` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `wxid` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `platform_remark` VARCHAR(191) NULL,
    `status` ENUM('active', 'deleted', 'blocked') NOT NULL DEFAULT 'active',
    `status_changed_at` DATETIME(3) NULL,
    `last_synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `contacts_account_id_wxid_key`(`account_id`, `wxid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `groups` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `wxid` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `owner_wxid` VARCHAR(191) NULL,
    `member_count` INTEGER NULL,
    `status` ENUM('active', 'disbanded', 'quit') NOT NULL DEFAULT 'active',
    `status_changed_at` DATETIME(3) NULL,
    `last_synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `groups_account_id_wxid_key`(`account_id`, `wxid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `group_members` (
    `id` VARCHAR(191) NOT NULL,
    `group_id` VARCHAR(191) NOT NULL,
    `wxid` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(191) NULL,
    `display_name` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `platform_remark` VARCHAR(191) NULL,
    `status` ENUM('active', 'left', 'removed') NOT NULL DEFAULT 'active',
    `status_changed_at` DATETIME(3) NULL,
    `last_synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `group_members_group_id_wxid_key`(`group_id`, `wxid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `peer_wxid` VARCHAR(191) NOT NULL,
    `type` ENUM('private', 'group') NOT NULL,
    `name` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `platform_remark` VARCHAR(191) NULL,
    `app_id` VARCHAR(191) NULL,
    `delivery_filter` ENUM('all', 'at_only') NOT NULL DEFAULT 'all',
    `debounce_ms` INTEGER NULL,
    `max_wait_ms` INTEGER NULL,
    `last_message_at` DATETIME(3) NULL,
    `last_message_text` VARCHAR(500) NULL,
    `message_count` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `conversations_account_id_peer_wxid_key`(`account_id`, `peer_wxid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_events` (
    `id` VARCHAR(191) NOT NULL,
    `secret_ok` BOOLEAN NOT NULL,
    `raw_payload` JSON NOT NULL,
    `event_kind` ENUM('message', 'contact', 'status', 'unknown') NOT NULL,
    `dedupe_key` VARCHAR(191) NULL,
    `process_status` ENUM('stored', 'processing', 'processed', 'skipped', 'failed') NOT NULL DEFAULT 'stored',
    `error_message` TEXT NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `next_retry_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `webhook_events_dedupe_key_key`(`dedupe_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NOT NULL,
    `webhook_event_id` VARCHAR(191) NULL,
    `send_request_id` VARCHAR(191) NULL,
    `source` ENUM('callback', 'hub_send') NOT NULL,
    `message_id` VARCHAR(191) NOT NULL,
    `raw_message_id` VARCHAR(191) NULL,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `type` ENUM('text', 'image', 'voice', 'video', 'file', 'emoji', 'link', 'mini_program', 'chat_record', 'location', 'card', 'transfer', 'red_packet', 'system', 'unsupported') NOT NULL,
    `status` ENUM('normal', 'revoked') NOT NULL DEFAULT 'normal',
    `revoked_at` DATETIME(3) NULL,
    `sender_wxid` VARCHAR(191) NOT NULL,
    `is_self` BOOLEAN NOT NULL DEFAULT false,
    `is_at_me` BOOLEAN NOT NULL DEFAULT false,
    `sent_at` DATETIME(3) NOT NULL,
    `payload` JSON NOT NULL,
    `rendered_text` VARCHAR(500) NULL,
    `payload_version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `messages_send_request_id_key`(`send_request_id`),
    UNIQUE INDEX `messages_message_id_key`(`message_id`),
    UNIQUE INDEX `messages_dedupe_key_key`(`dedupe_key`),
    INDEX `messages_conversation_id_sent_at_idx`(`conversation_id`, `sent_at`),
    INDEX `messages_raw_message_id_idx`(`raw_message_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hub_apps` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `owner_wxid` VARCHAR(191) NULL,
    `main_conversation_id` VARCHAR(191) NULL,
    `default_debounce_ms` INTEGER NULL,
    `default_max_wait_ms` INTEGER NULL,
    `deliver_self_messages` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hub_apps_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_account_remarks` (
    `id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `remark` VARCHAR(191) NULL,
    `tags` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_account_remarks_app_id_account_id_key`(`app_id`, `account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NOT NULL,
    `message_id` VARCHAR(191) NOT NULL,
    `event_id` VARCHAR(191) NOT NULL,
    `event_type` ENUM('message_created', 'message_revoked') NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('queued', 'delivering', 'delivered', 'acked', 'failed') NOT NULL DEFAULT 'queued',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `delivered_at` DATETIME(3) NULL,
    `acked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `deliveries_event_id_key`(`event_id`),
    INDEX `deliveries_app_id_status_idx`(`app_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `send_requests` (
    `id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `request_payload` JSON NOT NULL,
    `gewe_request` JSON NULL,
    `gewe_response` JSON NULL,
    `status` ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    `error_message` TEXT NULL,
    `result_msg_id` VARCHAR(191) NULL,
    `result_new_msg_id` VARCHAR(191) NULL,
    `result_create_time` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `task_type` ENUM('process_webhook', 'normalize', 'download_media', 'deliver', 'send') NOT NULL,
    `ref_id` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('pending', 'running', 'done', 'failed', 'dead') NOT NULL DEFAULT 'pending',
    `priority` INTEGER NOT NULL DEFAULT 100,
    `lease_until` DATETIME(3) NULL,
    `worker_id` VARCHAR(191) NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `max_retry` INTEGER NOT NULL DEFAULT 5,
    `next_retry_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `outbox_tasks_status_next_retry_at_idx`(`status`, `next_retry_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `wechat_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `groups` ADD CONSTRAINT `groups_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `wechat_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `wechat_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `hub_apps`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `wechat_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_webhook_event_id_fkey` FOREIGN KEY (`webhook_event_id`) REFERENCES `webhook_events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_send_request_id_fkey` FOREIGN KEY (`send_request_id`) REFERENCES `send_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `app_account_remarks` ADD CONSTRAINT `app_account_remarks_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `hub_apps`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `app_account_remarks` ADD CONSTRAINT `app_account_remarks_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `wechat_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `hub_apps`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `send_requests` ADD CONSTRAINT `send_requests_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `hub_apps`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `send_requests` ADD CONSTRAINT `send_requests_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `wechat_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `send_requests` ADD CONSTRAINT `send_requests_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
