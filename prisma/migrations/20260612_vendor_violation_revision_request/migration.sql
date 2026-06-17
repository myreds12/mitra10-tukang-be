-- Vendor violation revision/reset request with Super User approval.

IF COL_LENGTH(N'[dbo].[vendor_violation_log]', N'adjusted_point') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor_violation_log]
    ADD [adjusted_point] INT NULL;
END;

IF COL_LENGTH(N'[dbo].[vendor_violation_log]', N'revision_note') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor_violation_log]
    ADD [revision_note] NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH(N'[dbo].[vendor_violation_log]', N'revised_at') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor_violation_log]
    ADD [revised_at] DATETIME NULL;
END;

IF COL_LENGTH(N'[dbo].[vendor_violation_log]', N'revised_by') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor_violation_log]
    ADD [revised_by] INT NULL;
END;

IF OBJECT_ID(N'[dbo].[vendor_violation_revision_request]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[vendor_violation_revision_request] (
    [id] INT NOT NULL IDENTITY(1, 1),
    [vendor_id] INT NOT NULL,
    [requested_by] INT NOT NULL,
    [type] VARCHAR(20) NOT NULL,
    [target_log_id] INT NULL,
    [new_point] INT NULL,
    [reason] NVARCHAR(MAX) NOT NULL,
    [status] VARCHAR(20) NOT NULL CONSTRAINT [DF_vendor_violation_revision_request_status] DEFAULT 'PENDING',
    [reviewed_by] INT NULL,
    [review_note] NVARCHAR(MAX) NULL,
    [reviewed_at] DATETIME NULL,
    [created_at] DATETIME NOT NULL CONSTRAINT [DF_vendor_violation_revision_request_created_at] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME NULL,
    [deleted_at] DATETIME NULL,
    CONSTRAINT [PK_vendor_violation_revision_request] PRIMARY KEY ([id]),
    CONSTRAINT [FK_vendor_violation_revision_request_vendor] FOREIGN KEY ([vendor_id])
      REFERENCES [dbo].[vendor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [FK_vendor_violation_revision_request_log] FOREIGN KEY ([target_log_id])
      REFERENCES [dbo].[vendor_violation_log]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [CK_vendor_violation_revision_request_type] CHECK ([type] IN ('REVISE', 'RESET')),
    CONSTRAINT [CK_vendor_violation_revision_request_status] CHECK ([status] IN ('PENDING', 'APPROVED', 'REJECTED'))
  );

  CREATE INDEX [vendor_violation_revision_request_vendor_id_idx]
    ON [dbo].[vendor_violation_revision_request]([vendor_id]);

  CREATE INDEX [vendor_violation_revision_request_status_idx]
    ON [dbo].[vendor_violation_revision_request]([status]);

  CREATE INDEX [vendor_violation_revision_request_created_at_idx]
    ON [dbo].[vendor_violation_revision_request]([created_at]);
END;

-- BRD Juni 2026: every violation record counts as 1 point.
UPDATE [dbo].[vendor_violation_type]
SET [point] = 1,
    [updated_at] = GETDATE()
WHERE [deleted_at] IS NULL
  AND [point] <> 1;
