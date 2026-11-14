IF COL_LENGTH(N'[dbo].[vendor]', N'q1') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor]
    ADD [q1] INT NOT NULL CONSTRAINT [DF_vendor_q1] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[vendor]', N'q2') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor]
    ADD [q2] INT NOT NULL CONSTRAINT [DF_vendor_q2] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[vendor]', N'q3') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor]
    ADD [q3] INT NOT NULL CONSTRAINT [DF_vendor_q3] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[vendor]', N'q4') IS NULL
BEGIN
  ALTER TABLE [dbo].[vendor]
    ADD [q4] INT NOT NULL CONSTRAINT [DF_vendor_q4] DEFAULT 0;
END;
