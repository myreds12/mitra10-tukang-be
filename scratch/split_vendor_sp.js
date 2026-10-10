const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'vendor-sp');
const servicePath = path.join(srcDir, 'vendor-sp.service.ts');
const raw = fs.readFileSync(servicePath, 'utf8');
const lines = raw.split(/\r?\n/);

// lines: 0-indexed
// Lines 0 to 557: header, cache, constructor, getRoleName, findAll, findOne, findByVendor, checkVendorSpStatus, extendSpDuration, completeSp, reactivateVendor, getReactivationLogs, findReactivationLogs, getVendorsWithSpStatus, getSpStatusText
// Lines 558 to 1099: POIN 3 & 4 & 5 PDF methods (generatePenaltyReceiptPdf, generateNoViolationCertificatePdf, generateCleanVendorRecapPdf)
// Lines 1100 to 1331: POIN 7 Warning methods (getVendorsApproachingThreshold, sendWeeklyWarningNotifications)

const pdfLines = lines.slice(558, 1100);
const warnLines = lines.slice(1100);

const pdfServiceContent = `/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../common/services/pdf.service';
import { ReportQueryHelper } from './helpers/report-query.helper';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class VendorSpPdfService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
    private readonly reportQuery: ReportQueryHelper,
  ) {}

  private getSpStatusText(level: number): string {
    const statusMap: Record<number, string> = {
      1: 'SP1',
      2: 'SP2',
      3: 'SP3',
    };
    return statusMap[level] || 'UNKNOWN';
  }

${pdfLines.join('\n')}
}
`;

fs.writeFileSync(path.join(srcDir, 'vendor-sp-pdf.service.ts'), pdfServiceContent);

const warnServiceContent = `/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  evaluateSPWarning,
  getIsoWeekAndYear,
  getIsoWeekRange,
} from '../common/constants/vendor-sp.constant';

@Injectable()
export class VendorSpWarningService {
  constructor(private readonly dbService: PrismaService) {}

${warnLines.join('\n')}
`;

fs.writeFileSync(path.join(srcDir, 'vendor-sp-warning.service.ts'), warnServiceContent);

// Build updated vendor-sp.service.ts
const coreLines = lines.slice(0, 558);

// Remove last closing brace if any
let coreText = coreLines.join('\n');

const facadeMethods = `
  // ================================
  // DELEGATED PDF METHODS
  // ================================
  async generatePenaltyReceiptPdf(
    vendorId: number,
    quarter: number,
    year: number,
    generatedBy?: number,
  ): Promise<{ filePath: string; userFileName: string }> {
    return this.actualPdfService.generatePenaltyReceiptPdf(vendorId, quarter, year, generatedBy);
  }

  async generateNoViolationCertificatePdf(
    vendorId: number,
    quarter: number,
    year: number,
    generatedBy?: number,
  ): Promise<{ filePath: string; userFileName: string }> {
    return this.actualPdfService.generateNoViolationCertificatePdf(vendorId, quarter, year, generatedBy);
  }

  async generateCleanVendorRecapPdf(
    quarter: number,
    year: number,
    generatedBy?: number,
  ): Promise<{ filePath: string; userFileName: string }> {
    return this.actualPdfService.generateCleanVendorRecapPdf(quarter, year, generatedBy);
  }

  // ================================
  // DELEGATED WARNING METHODS
  // ================================
  async getVendorsApproachingThreshold(
    quarter?: number,
    year?: number,
    checkDate: Date = new Date(),
  ) {
    return this.actualWarningService.getVendorsApproachingThreshold(quarter, year, checkDate);
  }

  async sendWeeklyWarningNotifications(issuerId?: number, checkDate: Date = new Date()) {
    return this.actualWarningService.sendWeeklyWarningNotifications(issuerId, checkDate);
  }
}
`;

// Inject sub-services optionally with fallback in constructor
const constructorSearch = `  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
    private readonly reportQuery: ReportQueryHelper,
  ) {}`;

const constructorReplacement = `  private actualPdfService: VendorSpPdfService;
  private actualWarningService: VendorSpWarningService;

  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
    private readonly reportQuery: ReportQueryHelper,
    @Optional() private readonly spPdfService?: VendorSpPdfService,
    @Optional() private readonly spWarningService?: VendorSpWarningService,
  ) {
    this.actualPdfService = spPdfService ?? new VendorSpPdfService(this.dbService, this.pdfService, this.reportQuery);
    this.actualWarningService = spWarningService ?? new VendorSpWarningService(this.dbService);
  }`;

coreText = coreText.replace(constructorSearch, constructorReplacement);

// Add imports
coreText = coreText.replace(
  "import {\n  Injectable,",
  "import {\n  Injectable,\n  Optional,"
);
coreText = coreText.replace(
  "import { ReportQueryHelper } from './helpers/report-query.helper';",
  `import { ReportQueryHelper } from './helpers/report-query.helper';
import { VendorSpPdfService } from './vendor-sp-pdf.service';
import { VendorSpWarningService } from './vendor-sp-warning.service';`
);

const updatedVendorSpService = coreText + facadeMethods;
fs.writeFileSync(servicePath, updatedVendorSpService);

console.log('VendorSp split successfully created');
