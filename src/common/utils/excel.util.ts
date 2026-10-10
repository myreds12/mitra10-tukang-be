/* eslint-disable prettier/prettier */
import * as exceljs from 'exceljs';
import { Response } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { basename, join } from 'path';

/**
 * Returns formatted date string YYYY-MM-DD
 */
export function getFormattedDate(date: Date = new Date()): string {
  const tahun = date.getFullYear();
  const bulan = String(date.getMonth() + 1).padStart(2, '0');
  const tanggal = String(date.getDate()).padStart(2, '0');
  return `${tahun}-${bulan}-${tanggal}`;
}

/**
 * Creates directory if not exists and returns unique excel file path
 */
export function createExcelFilePath(
  folderPath: string,
  baseName: string,
): string {
  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true });
  }
  const now = Date.now();
  const excelFileName = `${baseName}-${now}.xlsx`;
  return join(folderPath, excelFileName);
}

/**
 * Writes workbook to disk and pipes it to Express Response as attachment
 */
export async function writeWorkbookAndSendResponse(
  workbook: exceljs.Workbook,
  excelFilePath: string,
  res: Response,
): Promise<void> {
  await workbook.xlsx.writeFile(excelFilePath);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=${basename(excelFilePath)}`,
  );

  const fileStream = createReadStream(excelFilePath);
  fileStream.pipe(res);
}
