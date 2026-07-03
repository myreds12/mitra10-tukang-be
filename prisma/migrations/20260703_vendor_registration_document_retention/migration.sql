IF COL_LENGTH('vendor_registration', 'documents_deleted_at') IS NULL
BEGIN
    ALTER TABLE [vendor_registration]
    ADD [documents_deleted_at] DATETIME2 NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'vendor_registration_documents_deleted_at_idx'
      AND object_id = OBJECT_ID('vendor_registration')
)
BEGIN
    CREATE INDEX [vendor_registration_documents_deleted_at_idx]
    ON [vendor_registration]([documents_deleted_at]);
END;
