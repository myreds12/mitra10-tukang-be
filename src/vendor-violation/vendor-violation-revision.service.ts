/* eslint-disable prettier/prettier */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, users } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SPAllocationReduction,
  SPThreshold,
  ViolationRevisionStatus,
  ViolationRevisionType,
} from '../common/enum/violation-type.enum';
import {
  CreateViolationRevisionRequestDto,
  QueryViolationRevisionRequestDto,
  ReviewViolationRevisionRequestDto,
} from './dto/violation-revision-request.dto';

@Injectable()
export class VendorViolationRevisionService {
  constructor(private readonly dbService: PrismaService) {}

  async createRequest(dto: CreateViolationRevisionRequestDto, user: users) {
    await this.assertRole(user, ['Admin HO', 'Super User']);

    const vendor = await this.dbService.vendor.findFirst({
      where: { id: dto.vendor_id, deleted_at: null },
    });

    if (!vendor) {
      throw new NotFoundException(`Vendor dengan ID ${dto.vendor_id} tidak ditemukan.`);
    }

    if (dto.type === ViolationRevisionType.REVISE) {
      if (!dto.target_log_id || dto.new_point === undefined) {
        throw new BadRequestException('target_log_id dan new_point wajib diisi untuk revisi poin.');
      }

      const log = await this.dbService.vendor_violation_log.findFirst({
        where: {
          id: dto.target_log_id,
          vendor_id: dto.vendor_id,
          deleted_at: null,
        },
      });

      if (!log) {
        throw new NotFoundException('Log pelanggaran yang akan direvisi tidak ditemukan.');
      }
    }

    const existingPending = await this.dbService.vendor_violation_revision_request.findFirst({
      where: {
        vendor_id: dto.vendor_id,
        type: dto.type,
        target_log_id: dto.target_log_id,
        status: ViolationRevisionStatus.PENDING,
        deleted_at: null,
      },
    });

    if (existingPending) {
      throw new BadRequestException('Masih ada request revisi/reset yang pending untuk data ini.');
    }

    return this.dbService.vendor_violation_revision_request.create({
      data: {
        vendor_id: dto.vendor_id,
        requested_by: user.id,
        type: dto.type,
        target_log_id: dto.target_log_id,
        new_point: dto.new_point,
        reason: dto.reason,
        status: ViolationRevisionStatus.PENDING,
      },
      include: this.revisionInclude(),
    });
  }

  async findAll(query: QueryViolationRevisionRequestDto) {
    const { page = 1, take = 10, vendor_id, status } = query;
    const skip = page * take - take;

    const where: Prisma.vendor_violation_revision_requestWhereInput = {
      deleted_at: null,
      ...(vendor_id ? { vendor_id } : {}),
      ...(status ? { status } : {}),
    };

    const [data, total] = await Promise.all([
      this.dbService.vendor_violation_revision_request.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: this.revisionInclude(),
      }),
      this.dbService.vendor_violation_revision_request.count({ where }),
    ]);

    return { data, meta: { total, page, take, skip } };
  }

  async findOne(id: number) {
    const request = await this.dbService.vendor_violation_revision_request.findFirst({
      where: { id, deleted_at: null },
      include: this.revisionInclude(),
    });

    if (!request) {
      throw new NotFoundException(`Request revisi/reset dengan ID ${id} tidak ditemukan.`);
    }

    return request;
  }

  async approve(id: number, dto: ReviewViolationRevisionRequestDto, user: users) {
    await this.assertRole(user, ['Super User']);

    return this.dbService.$transaction(async (tx) => {
      const request = await tx.vendor_violation_revision_request.findFirst({
        where: { id, deleted_at: null },
      });

      if (!request) {
        throw new NotFoundException(`Request revisi/reset dengan ID ${id} tidak ditemukan.`);
      }

      if (request.status !== ViolationRevisionStatus.PENDING) {
        throw new BadRequestException('Request ini sudah direview.');
      }

      const { quarter, year } = this.getCurrentQuarterYear();
      const reviewNote = dto.review_note || null;

      if (request.type === ViolationRevisionType.RESET) {
        await tx.vendor_violation_log.updateMany({
          where: {
            vendor_id: request.vendor_id,
            quarter,
            year,
            deleted_at: null,
          },
          data: {
            adjusted_point: 0,
            revision_note: reviewNote || request.reason,
            revised_at: new Date(),
            revised_by: user.id,
            updated_at: new Date(),
            updated_by: user.id,
          },
        });
      } else {
        if (!request.target_log_id || request.new_point === null) {
          throw new BadRequestException('Request revisi tidak memiliki target log atau new_point.');
        }

        const log = await tx.vendor_violation_log.findFirst({
          where: {
            id: request.target_log_id,
            vendor_id: request.vendor_id,
            deleted_at: null,
          },
        });

        if (!log) {
          throw new NotFoundException('Log pelanggaran yang akan direvisi tidak ditemukan.');
        }

        await tx.vendor_violation_log.update({
          where: { id: request.target_log_id },
          data: {
            adjusted_point: request.new_point,
            revision_note: reviewNote || request.reason,
            revised_at: new Date(),
            revised_by: user.id,
            updated_at: new Date(),
            updated_by: user.id,
          },
        });
      }

      const reviewed = await tx.vendor_violation_revision_request.update({
        where: { id },
        data: {
          status: ViolationRevisionStatus.APPROVED,
          reviewed_by: user.id,
          review_note: reviewNote,
          reviewed_at: new Date(),
          updated_at: new Date(),
        },
        include: this.revisionInclude(),
      });

      await this.syncVendorSpAfterPointChange(tx, request.vendor_id, user.id);

      return reviewed;
    });
  }

  async reject(id: number, dto: ReviewViolationRevisionRequestDto, user: users) {
    await this.assertRole(user, ['Super User']);

    return this.dbService.$transaction(async (tx) => {
      const request = await tx.vendor_violation_revision_request.findFirst({
        where: { id, deleted_at: null },
      });

      if (!request) {
        throw new NotFoundException(`Request revisi/reset dengan ID ${id} tidak ditemukan.`);
      }

      if (request.status !== ViolationRevisionStatus.PENDING) {
        throw new BadRequestException('Request ini sudah direview.');
      }

      return tx.vendor_violation_revision_request.update({
        where: { id },
        data: {
          status: ViolationRevisionStatus.REJECTED,
          reviewed_by: user.id,
          review_note: dto.review_note,
          reviewed_at: new Date(),
          updated_at: new Date(),
        },
        include: this.revisionInclude(),
      });
    });
  }

  private async assertRole(user: users, allowedRoles: string[]) {
    if (!user?.id) {
      throw new ForbiddenException('User tidak valid.');
    }

    const currentUser = await this.dbService.users.findFirst({
      where: { id: user.id },
      include: { roles: true },
    });

    const roleName = currentUser?.roles?.name;
    if (!roleName || !allowedRoles.includes(roleName)) {
      throw new ForbiddenException(`Akses hanya untuk role: ${allowedRoles.join(', ')}.`);
    }
  }

  private async syncVendorSpAfterPointChange(
    tx: Prisma.TransactionClient,
    vendorId: number,
    userId: number,
  ) {
    const { quarter, year } = this.getCurrentQuarterYear();
    const totalPoints = await this.calculateTotalPoints(tx, vendorId, quarter, year);
    const spLevel = this.getSPLevel(totalPoints);
    const activeSp = await tx.vendor_sp.findFirst({
      where: {
        vendor_id: vendorId,
        status: { in: [1, 3] },
        deleted_at: null,
      },
      orderBy: { sp_level: 'desc' },
    });

    if (!spLevel) {
      if (activeSp) {
        await tx.vendor_sp.update({
          where: { id: activeSp.id },
          data: {
            status: 2,
            total_point: totalPoints,
            notes: `${activeSp.notes || ''}\nPoin dikoreksi melalui approval revisi/reset.`,
            updated_by: userId,
            updated_at: new Date(),
          },
        });
      }

      await tx.vendor.update({
        where: { id: vendorId },
        data: { is_active: true },
      });
      return;
    }

    if (activeSp) {
      await tx.vendor_sp.update({
        where: { id: activeSp.id },
        data: {
          sp_level: spLevel,
          total_point: totalPoints,
          allocation_reduction: this.getAllocationReduction(spLevel),
          updated_by: userId,
          updated_at: new Date(),
        },
      });
    } else {
      const now = new Date();
      await tx.vendor_sp.create({
        data: {
          vendor_id: vendorId,
          sp_level: spLevel,
          total_point: totalPoints,
          quarter,
          year,
          start_date: now,
          end_date: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          status: 1,
          allocation_reduction: this.getAllocationReduction(spLevel),
          notes: 'SP issued after approved violation point revision/reset.',
          created_by: userId,
        },
      });
    }

    await tx.vendor.update({
      where: { id: vendorId },
      data: { is_active: spLevel !== 3 },
    });
  }

  private async calculateTotalPoints(
    tx: Prisma.TransactionClient,
    vendorId: number,
    quarter: number,
    year: number,
  ) {
    const violations = await tx.vendor_violation_log.findMany({
      where: {
        vendor_id: vendorId,
        quarter,
        year,
        deleted_at: null,
      },
      include: { violation_type: true },
    });

    return violations.reduce(
      (sum, violation) => sum + (violation.adjusted_point ?? violation.violation_type.point),
      0,
    );
  }

  private getSPLevel(totalPoints: number): number | null {
    if (totalPoints >= SPThreshold.SP3) return 3;
    if (totalPoints >= SPThreshold.SP2) return 2;
    if (totalPoints >= SPThreshold.SP1) return 1;
    return null;
  }

  private getAllocationReduction(spLevel: number): number {
    if (spLevel === 1) return SPAllocationReduction.SP1_MAX;
    if (spLevel === 2) return SPAllocationReduction.SP2_MAX;
    if (spLevel === 3) return SPAllocationReduction.SP3;
    return 0;
  }

  private getCurrentQuarterYear(): { quarter: number; year: number } {
    const now = new Date();
    return {
      quarter: Math.ceil((now.getMonth() + 1) / 3),
      year: now.getFullYear(),
    };
  }

  private revisionInclude() {
    return {
      vendor: {
        select: {
          id: true,
          company_name: true,
          pic_name: true,
        },
      },
      target_log: {
        include: {
          violation_type: true,
          orders: {
            select: {
              id: true,
              project_number: true,
            },
          },
        },
      },
    };
  }
}
