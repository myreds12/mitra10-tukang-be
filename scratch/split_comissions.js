const fs = require('fs');
const path = require('path');

// 1. Split comission_sales_incentive
{
  const dir = path.join(__dirname, '..', 'src', 'comission_sales_incentive');
  const servicePath = path.join(dir, 'comission_sales_incentive.service.ts');
  const lines = fs.readFileSync(servicePath, 'utf8').split(/\r?\n/);

  // Export methods start at line index 441 (442 in 1-based: async comissionSalesIncentiveDetailExportExcel)
  const crudLines = lines.slice(0, 441);
  const exportLines = lines.slice(441);

  const exportServiceContent = `/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PdfService } from 'src/common/service/pdf.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';

@Injectable()
export class ComissionSalesIncentiveExportService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

${exportLines.join('\n')}
`;

  fs.writeFileSync(path.join(dir, 'comission_sales_incentive_export.service.ts'), exportServiceContent);

  const facadeMethods = `
  async comissionSalesIncentiveDetailExportExcel(id: number, res: Response) {
    return this.exportService.comissionSalesIncentiveDetailExportExcel(id, res);
  }

  async comissionSalesIncentiveExportPdf(id: number, res: Response) {
    return this.exportService.comissionSalesIncentiveExportPdf(id, res);
  }

  async comissionSalesIncentiveExportExcel(
    query: QueryParamsDto,
    res: Response,
  ) {
    return this.exportService.comissionSalesIncentiveExportExcel(query, res);
  }
}
`;

  let newServiceContent = crudLines.join('\n');
  newServiceContent = newServiceContent.replace(
    `  constructor(
    private readonly dbService: PrismaService,
    private pdfService: PdfService,
  ) {}`,
    `  constructor(
    private readonly dbService: PrismaService,
    private pdfService: PdfService,
    private readonly exportService: ComissionSalesIncentiveExportService,
  ) {}`
  );

  newServiceContent = newServiceContent.replace(
    "import { PdfService } from 'src/common/service/pdf.service';",
    `import { PdfService } from 'src/common/service/pdf.service';
import { ComissionSalesIncentiveExportService } from './comission_sales_incentive_export.service';`
  );

  newServiceContent += facadeMethods;
  fs.writeFileSync(servicePath, newServiceContent);
}

// 2. Split comission_store_incentive
{
  const dir = path.join(__dirname, '..', 'src', 'comission_store_incentive');
  const servicePath = path.join(dir, 'comission_store_incentive.service.ts');
  const lines = fs.readFileSync(servicePath, 'utf8').split(/\r?\n/);

  // Export methods start at line index 436 (437 in 1-based: async comissionSalesIncentiveDetailExportExcel)
  const crudLines = lines.slice(0, 436);
  const exportLines = lines.slice(436);

  const exportServiceContent = `/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PdfService } from 'src/common/service/pdf.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';

@Injectable()
export class ComissionStoreIncentiveExportService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

${exportLines.join('\n')}
`;

  fs.writeFileSync(path.join(dir, 'comission_store_incentive_export.service.ts'), exportServiceContent);

  const facadeMethods = `
  async comissionSalesIncentiveDetailExportExcel(id: number, res: Response) {
    return this.exportService.comissionSalesIncentiveDetailExportExcel(id, res);
  }

  async comissionSalesIncentiveExportPdf(id: number, res: Response) {
    return this.exportService.comissionSalesIncentiveExportPdf(id, res);
  }

  async comissionSalesIncentiveExportExcel(
    query: QueryParamsDto,
    res: Response,
  ) {
    return this.exportService.comissionSalesIncentiveExportExcel(query, res);
  }
}
`;

  let newServiceContent = crudLines.join('\n');
  newServiceContent = newServiceContent.replace(
    `  constructor(
    private readonly dbService: PrismaService,
    private pdfService: PdfService,
  ) {}`,
    `  constructor(
    private readonly dbService: PrismaService,
    private pdfService: PdfService,
    private readonly exportService: ComissionStoreIncentiveExportService,
  ) {}`
  );

  newServiceContent = newServiceContent.replace(
    "import { PdfService } from 'src/common/service/pdf.service';",
    `import { PdfService } from 'src/common/service/pdf.service';
import { ComissionStoreIncentiveExportService } from './comission_store_incentive_export.service';`
  );

  newServiceContent += facadeMethods;
  fs.writeFileSync(servicePath, newServiceContent);
}

console.log('Commission incentives split completed cleanly');
