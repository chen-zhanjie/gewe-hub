ALTER TABLE `send_requests`
  MODIFY `status` ENUM('held', 'pending', 'sent', 'failed', 'unknown') NOT NULL DEFAULT 'pending';

ALTER TABLE `messages`
  ADD COLUMN `is_sent` BOOLEAN NOT NULL DEFAULT true;
