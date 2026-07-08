-- AlterTable
ALTER TABLE `wechat_accounts`
  ADD COLUMN `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  ADD COLUMN `status_changed_at` DATETIME(3) NULL;
