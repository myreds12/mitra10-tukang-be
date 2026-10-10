const fs = require('fs');
const path = require('path');

const memberServicePath = path.join(__dirname, '..', 'src', 'member', 'member.service.ts');
const raw = fs.readFileSync(memberServicePath, 'utf8');
const lines = raw.split(/\r?\n/);

// Lines index (0-based)
// Lines 0 to 465: imports, class, create, normalizePhone, normalizePhoneNumbers, findAll, findOne, update, remove
// Lines 466 to 720: memberExportExcel (inclusive)
// Lines 722 to 1477: orderMemberExportExcel (inclusive)
// Lines 1478 to 1481: catch(error)
// Line 1482: closing brace }

const memberExportLines = lines.slice(466, 721);
const orderMemberExportLines = lines.slice(722, 1478);

const memberExportContent = `/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MemberExportService {
  constructor(private readonly dbService: PrismaService) {}

${memberExportLines.join('\n')}
}
`;

const orderMemberExportContent = `/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MemberOrderExportService {
  constructor(private readonly dbService: PrismaService) {}

  try {
${orderMemberExportLines.map(l => '  ' + l).join('\n')}
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}
`.replace('  async orderMemberExportExcel', 'async orderMemberExportExcel')
 .replace('  try {', '') // Wait, let's format properly!
;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'member', 'member-export.service.ts'), memberExportContent);

// For orderMemberExport, let's format it cleanly:
const orderExportClean = `/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MemberOrderExportService {
  constructor(private readonly dbService: PrismaService) {}

${orderMemberExportLines.join('\n')}
}
`;
fs.writeFileSync(path.join(__dirname, '..', 'src', 'member', 'member-order-export.service.ts'), orderExportClean);

// Update member.service.ts
const coreLines = lines.slice(0, 466);

// We need to inject MemberExportService and MemberOrderExportService
const newMemberService = `${coreLines.join('\n')}
  async memberExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.memberExportService.memberExportExcel(res, queryParams);
  }

  async orderMemberExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.memberOrderExportService.orderMemberExportExcel(res, queryParams);
  }
}
`
.replace(
  'constructor(private readonly dbService: PrismaService) { }',
  `constructor(
    private readonly dbService: PrismaService,
    private readonly memberExportService: MemberExportService,
    private readonly memberOrderExportService: MemberOrderExportService,
  ) { }`
)
.replace(
  "import { Prisma } from '@prisma/client';",
  `import { Prisma } from '@prisma/client';
import { MemberExportService } from './member-export.service';
import { MemberOrderExportService } from './member-order-export.service';`
);

fs.writeFileSync(memberServicePath, newMemberService);

console.log('Member split generated successfully');
