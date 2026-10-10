const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'refund');
const servicePath = path.join(srcDir, 'refund.service.ts');
const raw = fs.readFileSync(servicePath, 'utf8');
const lines = raw.split(/\r?\n/);

// lines 0 to 657: CRUD, violations, etc.
// lines 658 to 1043: refundExportExcel
// line 1044: closing brace }

const exportLines = lines.slice(658, 1043);

const exportServiceContent = `/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RefundExportService {
  constructor(private readonly dbService: PrismaService) {}

${exportLines.join('\n')}
}
`;

fs.writeFileSync(path.join(srcDir, 'refund-export.service.ts'), exportServiceContent);

// Main service
const mainLines = lines.slice(0, 658);
let mainContent = mainLines.join('\n');

const facadeMethod = `
  async refundExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.actualRefundExportService.refundExportExcel(res, queryParams);
  }
}
`;

// Update constructor & imports
mainContent = mainContent.replace(
  "import { ViolationDetectorService } from 'src/common/services/violation-detector.service';",
  `import { ViolationDetectorService } from 'src/common/services/violation-detector.service';
import { Optional } from '@nestjs/common';
import { RefundExportService } from './refund-export.service';`
);

const oldConstructor = `  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
    private notifService: NotificationsService,
    private violationDetector: ViolationDetectorService,
  ) { }`;

const newConstructor = `  private actualRefundExportService: RefundExportService;

  constructor(
    private readonly dbService: PrismaService,
    private readonly orderService: OrderService,
    private notifService: NotificationsService,
    private violationDetector: ViolationDetectorService,
    @Optional() private readonly refundExportService?: RefundExportService,
  ) {
    this.actualRefundExportService = refundExportService ?? new RefundExportService(this.dbService);
  }`;

mainContent = mainContent.replace(oldConstructor, newConstructor);
mainContent = mainContent + facadeMethod;

fs.writeFileSync(servicePath, mainContent);

console.log('Refund split completed');
