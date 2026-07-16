IF COL_LENGTH(N'[dbo].[vendor_registration]', N'rejected_at') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor_registration]
    ADD [rejected_at] DATETIME NULL;
END;

IF COL_LENGTH(N'[dbo].[vendor_registration]', N'anonymized_at') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor_registration]
    ADD [anonymized_at] DATETIME NULL;
END;

UPDATE [dbo].[vendor_registration]
SET [rejected_at] = COALESCE([reviewed_at], [updated_at], [created_at])
WHERE [status] = 4
  AND [rejected_at] IS NULL;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'vendor_registration_rejected_at_idx'
    AND object_id = OBJECT_ID(N'[dbo].[vendor_registration]')
)
BEGIN
  CREATE INDEX [vendor_registration_rejected_at_idx]
    ON [dbo].[vendor_registration]([rejected_at]);
END;
