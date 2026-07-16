IF COL_LENGTH(N'[dbo].[service_type]', N'is_test') IS NULL
BEGIN
  ALTER TABLE [dbo].[service_type]
    ADD [is_test] BIT NOT NULL CONSTRAINT [DF_service_type_is_test] DEFAULT 0;
END;

UPDATE [dbo].[service_type]
SET [is_test] = 1,
    [updated_at] = GETDATE()
WHERE [is_test] = 0
  AND (
    [service_type] LIKE 'SP_ORDER_RULE%'
    OR [service_type] LIKE 'SP Test%'
  );
