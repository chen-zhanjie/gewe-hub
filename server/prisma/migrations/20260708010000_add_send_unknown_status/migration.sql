ALTER TABLE `send_requests`
  MODIFY `status` ENUM('pending', 'sent', 'failed', 'unknown') NOT NULL DEFAULT 'pending';
