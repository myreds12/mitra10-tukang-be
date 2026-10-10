const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'complaints');
const servicePath = path.join(srcDir, 'complaints.service.ts');
const raw = fs.readFileSync(servicePath, 'utf8');
const lines = raw.split(/\r?\n/);

// lines 0 to 902: CRUD, status, etc.
// lines 903 to 1092: complaintExportExcel

const exportLines = lines.slice(903);
let exportContent = exportLines.join('\n');

// Replace method header
exportContent = exportContent.replace(
  'async complaintExportExcel(res: Response, queryParams: QueryParamsDto) {\n    try {\n      const { data } = await this.findAll(queryParams);',
  'async complaintExportExcel(res: Response, data: any[]) {\n    try {'
);

const exportServiceContent = `/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ComplaintsExportService {
${exportContent}
}
`;

fs.writeFileSync(path.join(srcDir, 'complaints-export.service.ts'), exportServiceContent);

// Main ComplaintsService
const mainLines = lines.slice(0, 903);
let mainContent = mainLines.join('\n');

const facadeMethod = `
  async complaintExportExcel(res: Response, queryParams: QueryParamsDto) {
    const { data } = await this.findAll(queryParams);
    return this.complaintsExportService.complaintExportExcel(res, data);
  }
}
`;

// Add ComplaintsExportService to imports & constructor
mainContent = mainContent.replace(
  "import { resolveUploadPath } from 'src/common/utils/upload-path.util';",
  `import { resolveUploadPath } from 'src/common/utils/upload-path.util';
import { ComplaintsExportService } from './complaints-export.service';`
);

mainContent = mainContent.replace(
  `  constructor(
    private readonly dbService: PrismaService,
    private notifService: NotificationsService,
    private readonly violationDetector: ViolationDetectorService,
  ) { }`,
  `  constructor(
    private readonly dbService: PrismaService,
    private notifService: NotificationsService,
    private readonly violationDetector: ViolationDetectorService,
    private readonly complaintsExportService: ComplaintsExportService,
  ) { }`
);

mainContent = mainContent + facadeMethod;
fs.writeFileSync(servicePath, mainContent);

console.log('Complaints split completed');
