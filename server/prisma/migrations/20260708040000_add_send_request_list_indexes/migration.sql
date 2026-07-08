SET @send_requests_created_at_id_idx_exists = (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'send_requests'
    AND index_name = 'send_requests_created_at_id_idx'
);
SET @send_requests_created_at_id_idx_sql = IF(
  @send_requests_created_at_id_idx_exists = 0,
  'CREATE INDEX `send_requests_created_at_id_idx` ON `send_requests`(`created_at`, `id`)',
  'SELECT 1'
);
PREPARE send_requests_created_at_id_idx_stmt FROM @send_requests_created_at_id_idx_sql;
EXECUTE send_requests_created_at_id_idx_stmt;
DEALLOCATE PREPARE send_requests_created_at_id_idx_stmt;

SET @send_requests_status_created_at_id_idx_exists = (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'send_requests'
    AND index_name = 'send_requests_status_created_at_id_idx'
);
SET @send_requests_status_created_at_id_idx_sql = IF(
  @send_requests_status_created_at_id_idx_exists = 0,
  'CREATE INDEX `send_requests_status_created_at_id_idx` ON `send_requests`(`status`, `created_at`, `id`)',
  'SELECT 1'
);
PREPARE send_requests_status_created_at_id_idx_stmt FROM @send_requests_status_created_at_id_idx_sql;
EXECUTE send_requests_status_created_at_id_idx_stmt;
DEALLOCATE PREPARE send_requests_status_created_at_id_idx_stmt;
