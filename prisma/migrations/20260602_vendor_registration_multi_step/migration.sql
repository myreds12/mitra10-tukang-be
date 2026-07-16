-- Vendor registration multi-step approval flow.
-- New status map:
-- 1 = MENUNGGU_APPROVE, 2 = PROSES_PITCHING, 3 = DISETUJUI, 4 = DITOLAK

IF OBJECT_ID(N'[dbo].[vendor_registration_history]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[vendor_registration_history] (
    [id] INT NOT NULL IDENTITY(1, 1),
    [vendor_registration_id] INT NOT NULL,
    [from_status] INT NULL,
    [to_status] INT NOT NULL,
    [action] VARCHAR(100) NOT NULL,
    [notes] NVARCHAR(MAX) NULL,
    [actor_id] INT NULL,
    [created_at] DATETIME NOT NULL CONSTRAINT [DF_vendor_registration_history_created_at] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_vendor_registration_history] PRIMARY KEY ([id]),
    CONSTRAINT [FK_vendor_registration_history_registration] FOREIGN KEY ([vendor_registration_id])
      REFERENCES [dbo].[vendor_registration]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
  );

  CREATE INDEX [vendor_registration_history_vendor_registration_id_idx]
    ON [dbo].[vendor_registration_history]([vendor_registration_id]);

  CREATE INDEX [vendor_registration_history_to_status_idx]
    ON [dbo].[vendor_registration_history]([to_status]);

  CREATE INDEX [vendor_registration_history_created_at_idx]
    ON [dbo].[vendor_registration_history]([created_at]);
END;

IF COL_LENGTH(N'[dbo].[vendor_registration]', N'pdp_consent') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor_registration]
    ADD [pdp_consent] BIT NOT NULL CONSTRAINT [DF_vendor_registration_pdp_consent] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[vendor_registration]', N'pdp_consent_at') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor_registration]
    ADD [pdp_consent_at] DATETIME NULL;
END;

-- Remap existing data from old status map:
-- old 2 = APPROVED -> new 3 = DISETUJUI
-- old 3 = REJECTED -> new 4 = DITOLAK
UPDATE [dbo].[vendor_registration]
SET [status] = 4
WHERE [status] = 3;

UPDATE [dbo].[vendor_registration]
SET [status] = 3
WHERE [status] = 2;

IF NOT EXISTS (SELECT 1 FROM [dbo].[vendor_registration_history])
BEGIN
  INSERT INTO [dbo].[vendor_registration_history] (
    [vendor_registration_id],
    [from_status],
    [to_status],
    [action],
    [notes],
    [actor_id],
    [created_at]
  )
  SELECT
    [id],
    NULL,
    [status],
    'MIGRATED_STATUS',
    'Histori awal dari data existing sebelum flow multi-step.',
    [reviewed_by],
    COALESCE([reviewed_at], [created_at])
  FROM [dbo].[vendor_registration]
  WHERE [deleted_at] IS NULL;
END;
