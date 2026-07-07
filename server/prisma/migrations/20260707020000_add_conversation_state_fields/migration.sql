ALTER TABLE `conversations`
  ADD COLUMN `pinned_at` DATETIME(3) NULL,
  ADD COLUMN `is_hidden` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `last_opened_at` DATETIME(3) NULL,
  ADD COLUMN `unread_count` INTEGER NOT NULL DEFAULT 0;
