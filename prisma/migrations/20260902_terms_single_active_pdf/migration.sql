-- T&C single-active enforcement + dukungan dokumen tipe PDF (no download).
-- 1. Kolom document_type ('HTML' default | 'PDF') dan file_path (path PDF di storage).
-- 2. Unique filtered index pada is_active WHERE is_active = 1 -> DB-level guarantee
--    bahwa HANYA SATU versi T&C yang aktif (single-active).
-- 3. Nonaktifkan versi aktif ganda (jika ada data duplikat dari sebelumnya),
--    hanya versi tertinggi yang tetap aktif.

-- 1. Kolom baru
IF COL_LENGTH('vendor_terms_and_conditions', 'document_type') IS NULL
BEGIN
    ALTER TABLE [vendor_terms_and_conditions]
    ADD [document_type] VARCHAR(10) NOT NULL
        CONSTRAINT [DF_vendor_terms_and_conditions_document_type] DEFAULT 'HTML';
END;

IF COL_LENGTH('vendor_terms_and_conditions', 'file_path') IS NULL
BEGIN
    ALTER TABLE [vendor_terms_and_conditions]
    ADD [file_path] VARCHAR(500) NULL;
END;

-- 2. Unique filtered index: maksimal 1 row aktif.
--    SQL Server: hanya boleh ada satu nilai unik pada kolom nullable yang
--    memenuhi filter -> pakai kolom is_active sebagai value unik.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'uq_vendor_terms_and_conditions_single_active'
      AND object_id = OBJECT_ID('vendor_terms_and_conditions')
)
BEGIN
    CREATE UNIQUE INDEX [uq_vendor_terms_and_conditions_single_active]
    ON [vendor_terms_and_conditions]([is_active])
    WHERE [is_active] = 1 AND [deleted_at] IS NULL;
END;

-- 3. Cleanup data duplikat: jika ada lebih dari 1 versi aktif,
--    hanya versi tertinggi yang tetap aktif, sisanya dinonaktifkan.
;WITH active_terms AS (
    SELECT [id], [version],
           ROW_NUMBER() OVER (ORDER BY [version] DESC, [created_at] DESC) AS rn
    FROM [dbo].[vendor_terms_and_conditions]
    WHERE [is_active] = 1 AND [deleted_at] IS NULL
)
UPDATE [dbo].[vendor_terms_and_conditions]
SET [is_active] = 0, [updated_at] = CURRENT_TIMESTAMP
FROM [dbo].[vendor_terms_and_conditions] t
INNER JOIN active_terms a ON t.[id] = a.[id]
WHERE a.rn > 1;
