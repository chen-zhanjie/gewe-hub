ALTER TABLE `outbox_tasks`
  MODIFY `task_type` ENUM(
    'process_webhook',
    'normalize',
    'download_media',
    'deliver',
    'send',
    'sync_contacts',
    'sync_group_members'
  ) NOT NULL;
