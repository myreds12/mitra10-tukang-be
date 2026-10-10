const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'manager');
const servicePath = path.join(srcDir, 'manager.service.ts');
const raw = fs.readFileSync(servicePath, 'utf8');
const lines = raw.split(/\r?\n/);

// Extract lines:
// createInsetiveManager: 50 to 76
// getInsentive: 77 to 134
// findOneInsetif: 351 to 381
// syncManagerCommission: 823 to 931
// updateDateManagerIncentive: 1227 to 1294
// deleteManagerIncentive: 1295 to 1310
const incentiveCodeParts = [
  lines.slice(50, 77).join('\n'),
  lines.slice(77, 135).join('\n'),
  lines.slice(351, 382).join('\n'),
  lines.slice(823, 932).join('\n').replace('await this.findOne(pair.manager_id)', 'await this.findManager(pair.manager_id)'),
  lines.slice(1227, 1295).join('\n'),
  lines.slice(1295, 1311).join('\n'),
];

const managerIncentiveServiceContent = `/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { users } from '@prisma/client';
import * as exceljs from 'exceljs';
import { IncentiveStatus } from 'src/incentive/dto/incentive-status.enum';
import { IncentiveType } from 'src/incentive/dto/incentive-type.enum';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';

@Injectable()
export class ManagerIncentiveService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly notifService: NotificationsService,
  ) {}

  private async findManager(id: number) {
    return this.dbService.manager.findFirst({
      where: { id },
      include: {
        bank: true,
        store: true,
        users: true,
      },
    });
  }

${incentiveCodeParts.join('\n\n')}
}
`;

fs.writeFileSync(path.join(srcDir, 'manager-incentive.service.ts'), managerIncentiveServiceContent);

// Export service:
// templateDefaultExcel: 594 to 822
// managerExportExcel: 932 to 1226
const exportCodeParts = [
  lines.slice(594, 823).join('\n'),
  lines.slice(932, 1227).join('\n'),
];

const managerExportServiceContent = `/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Response } from 'express';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ManagerExportService {
  constructor(private readonly dbService: PrismaService) {}

${exportCodeParts.join('\n\n')}
}
`;

fs.writeFileSync(path.join(srcDir, 'manager-export.service.ts'), managerExportServiceContent);

// Main ManagerService:
// Keep header lines 0 to 49
// getCode: 34 to 49
// Skip 50 to 134 (incentive)
// Keep create & findAll: lines 135 to 350
// Skip 351 to 381 (findOneInsetif)
// Keep findOne, update, managerUser, remove: lines 382 to 593
// Skip 594 to 822 (templateDefaultExcel)
// Skip 823 to 931 (syncManagerCommission)
// Skip 932 to 1226 (managerExportExcel)
// Skip 1227 to 1310 (updateDateManagerIncentive & deleteManagerIncentive)

const headerPart = lines.slice(0, 50).join('\n');
const crudPart1 = lines.slice(135, 351).join('\n');
const crudPart2 = lines.slice(382, 594).join('\n');

const facadeDelegates = `
  // ===================================
  // DELEGATED INCENTIVE METHODS
  // ===================================
  async createInsetiveManager(createManagerDto: any, user: users) {
    return this.managerIncentiveService.createInsetiveManager(createManagerDto, user);
  }

  async getInsentive(query: QueryParamsDto) {
    return this.managerIncentiveService.getInsentive(query);
  }

  async findOneInsetif(id: number) {
    return this.managerIncentiveService.findOneInsetif(id);
  }

  async syncManagerCommission(filePath: string, user: users) {
    return this.managerIncentiveService.syncManagerCommission(filePath, user);
  }

  async updateDateManagerIncentive(id: number) {
    return this.managerIncentiveService.updateDateManagerIncentive(id);
  }

  async deleteManagerIncentive(id: number) {
    return this.managerIncentiveService.deleteManagerIncentive(id);
  }

  // ===================================
  // DELEGATED EXPORT METHODS
  // ===================================
  async templateDefaultExcel(res: Response, query: QueryParamsDto) {
    return this.managerExportService.templateDefaultExcel(res, query);
  }

  async managerExportExcel(res: Response, queryParams: QueryParamsDto) {
    return this.managerExportService.managerExportExcel(res, queryParams);
  }
}
`;

let newMainService = [
  headerPart,
  crudPart1,
  crudPart2,
  facadeDelegates,
].join('\n');

// Update constructor & imports in manager.service.ts
newMainService = newMainService.replace(
  'constructor(\n    private readonly dbService: PrismaService,\n    private readonly authService: AuthService,\n    private notifService: NotificationsService,\n    @InjectQueue(\'email\') private emailQueue: Queue,\n  ) {}',
  `constructor(
    private readonly dbService: PrismaService,
    private readonly authService: AuthService,
    private notifService: NotificationsService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly managerExportService: ManagerExportService,
    private readonly managerIncentiveService: ManagerIncentiveService,
  ) {}`
);

newMainService = newMainService.replace(
  "import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';",
  `import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { ManagerExportService } from './manager-export.service';
import { ManagerIncentiveService } from './manager-incentive.service';`
);

fs.writeFileSync(servicePath, newMainService);
console.log('Manager split completed');
