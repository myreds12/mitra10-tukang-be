-- Vendor recruitment feature (Rekrut Vendor):
-- 1. Kolom user_id di vendor_registration -> akun "Pendaftar Vendor" (auto-create saat registrasi).
--    Data vendor yang masih proses pendaftaran TETAP terpisah dari tabel vendor aktif.
-- 2. Tabel vendor_terms_and_conditions: konten T&C sebagai HTML yang bisa diedit Admin HO
--    tanpa redeploy (lebih mudah diupdate dibanding PDF statis).
-- 3. Role "Pendaftar Vendor" (is_active = 0 secara default): membedakan user pendaftar dari
--    vendor aktif (Owner Vendor / Admin Vendor) dan role internal. Role ini TIDAK punya
--    role_permissions, sehingga tidak bisa mengakses menu/endpoint vendor aktif.

-- 1. Kolom user_id + index
IF COL_LENGTH('vendor_registration', 'user_id') IS NULL
BEGIN
    ALTER TABLE [vendor_registration]
    ADD [user_id] INT NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'vendor_registration_user_id_idx'
      AND object_id = OBJECT_ID('vendor_registration')
)
BEGIN
    CREATE INDEX [vendor_registration_user_id_idx]
    ON [vendor_registration]([user_id]);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys fk
    WHERE fk.name = 'FK_vendor_registration_user'
)
BEGIN
    ALTER TABLE [vendor_registration]
    ADD CONSTRAINT [FK_vendor_registration_user]
    FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

-- 2. Tabel T&C pendaftaran vendor (HTML content, editable Admin)
IF OBJECT_ID(N'[dbo].[vendor_terms_and_conditions]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[vendor_terms_and_conditions] (
        [id] INT NOT NULL IDENTITY(1, 1),
        [title] NVARCHAR(255) NOT NULL CONSTRAINT [DF_vendor_terms_and_conditions_title]
            DEFAULT N'Syarat dan Ketentuan Pendaftaran Vendor Mitra10',
        [content] NVARCHAR(MAX) NOT NULL,
        [version] INT NOT NULL CONSTRAINT [DF_vendor_terms_and_conditions_version] DEFAULT 1,
        [is_active] BIT NOT NULL CONSTRAINT [DF_vendor_terms_and_conditions_is_active] DEFAULT 1,
        [created_at] DATETIME NOT NULL CONSTRAINT [DF_vendor_terms_and_conditions_created_at] DEFAULT CURRENT_TIMESTAMP,
        [updated_at] DATETIME NULL,
        [deleted_at] DATETIME NULL,
        [created_by] INT NULL,
        [updated_by] INT NULL,
        CONSTRAINT [PK_vendor_terms_and_conditions] PRIMARY KEY ([id])
    );

    CREATE INDEX [vendor_terms_and_conditions_is_active_idx]
        ON [dbo].[vendor_terms_and_conditions]([is_active]);
END;

-- Seed awal T&C.
-- PLACEHOLDER: konten berikut masih placeholder dan PERLU DIGANTI dengan konten resmi
-- oleh tim/admin melalui endpoint admin (PUT /vendor-registration/terms-and-conditions)
-- atau update baris ini sebelum go-live.
IF NOT EXISTS (SELECT 1 FROM [dbo].[vendor_terms_and_conditions] WHERE [is_active] = 1)
BEGIN
    INSERT INTO [dbo].[vendor_terms_and_conditions] ([title], [content], [version], [is_active])
    VALUES (
        N'Syarat dan Ketentuan Pendaftaran Vendor Mitra10',
        N'<h2>Syarat dan Ketentuan Pendaftaran Vendor Mitra10</h2>
<p><em>[PLACEHOLDER] Dokumen ini adalah placeholder dan akan diganti dengan konten resmi oleh tim Mitra10.</em></p>
<ol>
<li>Pendaftar wajib mengisi seluruh data perusahaan, PIC, dan mengunggah dokumen persyaratan dengan data yang benar dan valid.</li>
<li>Pendaftar menyetujui pemrosesan data pribadi sesuai Undang-Undang Pelindungan Data Pribadi (UU PDP).</li>
<li>Pendaftaran akan melalui tahapan: Pendaftaran, Verifikasi, Review Admin, dan Approval oleh Admin/Super User Instalasi Mitra10.</li>
<li>Mitra10 berhak menolak pendaftaran apabila data atau dokumen tidak memenuhi persyaratan.</li>
<li>Setelah pendaftaran disetujui, vendor resmi menjadi Vendor Instalasi Mitra10 dan tunduk pada ketentuan kerja sama yang berlaku.</li>
</ol>',
        1,
        1
    );
END;

-- 3. Role "Pendaftar Vendor" (tidak aktif di daftar role internal; dipakai sebagai penanda user pendaftar)
IF NOT EXISTS (SELECT 1 FROM [dbo].[roles] WHERE [name] = N'Pendaftar Vendor')
BEGIN
    INSERT INTO [dbo].[roles] ([name], [is_active]) VALUES (N'Pendaftar Vendor', 0);
END;
