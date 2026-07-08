-- AlterTable
ALTER TABLE `send_requests`
  ADD COLUMN `idempotency_key` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `send_requests_app_id_conversation_id_idempotency_key_key`
  ON `send_requests`(`app_id`, `conversation_id`, `idempotency_key`);
