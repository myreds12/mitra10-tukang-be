const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'tukang');
const servicePath = path.join(srcDir, 'tukang.service.ts');
const raw = fs.readFileSync(servicePath, 'utf8');
const lines = raw.split(/\r?\n/);

// lines 0 to 664: CRUD + getCode
// lines 665 to 1077: tukangExportExcel, tukangOrderPdf, tukangExportOrderExcel
// lines 1078 to 1146: deleteDuplicateRelationTukang

const exportLines = lines.slice(665, 1078);
let exportContent = exportLines.join('\n');

// Adjust tukangExportExcel signature in TukangExportService
exportContent = exportContent.replace(
  'async tukangExportExcel(res: Response, queryParams: QueryParamsDto) {\n    try {\n      const { data } = await this.findAll(queryParams);',
  'async tukangExportExcel(res: Response, data: any[]) {\n    try {'
);

const tukangExportServiceFile = `/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { PdfService } from 'src/common/service/pdf.service';

@Injectable()
export class TukangExportService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

${exportContent}
}
`;

fs.writeFileSync(path.join(srcDir, 'tukang-export.service.ts'), tukangExportServiceFile);

// Now update tukang.service.ts
const beforeExport = lines.slice(0, 665).join('\n');
const afterExport = lines.slice(1078).join('\n');

const facadeMethods = `
  async tukangExportExcel(res: Response, queryParams: QueryParamsDto) {
    const { data } = await this.findAll(queryParams);
    return this.tukangExportService.tukangExportExcel(res, data);
  }

  async tukangOrderPdf(res: Response, queryParams: QueryParamsDto) {
    return this.tukangExportService.tukangOrderPdf(res, queryParams);
  }

  async tukangExportOrderExcel(res: Response, queryParams: QueryParamsDto) {
    return this.tukangExportService.tukangExportOrderExcel(res, queryParams);
  }
`;

let updatedMain = `${beforeExport}\n${facadeMethods}\n${afterExport}`;

// Update constructor & import in tukang.service.ts
updatedMain = updatedMain.replace(
  `  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
    private pdfService: PdfService,
  ) {}`,
  `  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
    private pdfService: PdfService,
    private readonly tukangExportService: TukangExportService,
  ) {}`
);

updatedMain = updatedMain.replace(
  "import { PdfService } from 'src/common/service/pdf.service';",
  `import { PdfService } from 'src/common/service/pdf.service';
import { TukangExportService } from './tukang-export.service';`
);

fs.writeFileSync(servicePath, updatedMain);
console.log('Tukang split completed');
