/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  QueryVendorSpDto,
  CreateVendorSpDto,
  UpdateVendorSpDto,
  ReactivateVendorDto,
} from './dto/vendor-sp.dto';
import { Prisma } from '@prisma/client';
import { SpStatus, SpLevel } from './enums/sp-status.enum';

@Injectable()
export class VendorSpService {
  private spStatusCache: Map<number, { data: any; timestamp: number }> = new Map();
  private readonly SP_CACHE_TTL = 5 * 60 * 1000;

  private getCachedSpStatus(vendorId: number): any | null {
    const cached = this.spStatusCache.get(vendorId);
    if (cached && (Date.now() - cached.timestamp) < this.SP_CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  private setCachedSpStatus(vendorId: number, data: any): void {
    this.spStatusCache.set(vendorId, { data, timestamp: Date.now() });
  }

  constructor(private readonly dbService: PrismaService) {}

  // ================================
  // VENDOR SP CRUD
  // ================================

  async findAll(query: QueryVendorSpDto) {
    try {
      const {
        page = 1,
        take = 10,
        vendor_id,
        sp_level,
        status,
        quarter,
        year,
        date_from,
        date_to,
        search,
      } = query;
      const skip = page * take - take;

      const where: Prisma.vendor_spWhereInput = {
        deleted_at: null,
        ...(vendor_id ? { vendor_id } : {}),
        ...(sp_level ? { sp_level } : {}),
        ...(status ? { status } : {}),
        ...(quarter ? { quarter } : {}),
        ...(year ? { year } : {}),
        ...(date_from && date_to
          ? {
              created_at: {
                gte: new Date(date_from),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            }
          : {}),
        ...(search
          ? {
              vendor: {
                OR: [
                  { company_name: { contains: search } },
                  { pic_name: { contains: search } },
                ],
              },
            }
          : {}),
      };

      const [spList, total] = await Promise.all([
        this.dbService.vendor_sp.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: 'desc' },
          include: {
            vendor: {
              select: {
                id: true,
                company_name: true,
                pic_name: true,
                email_address: true,
                phone_number: true,
                is_active: true,
              },
            },
            sp_details: {
              include: {
                violation_log: {
                  include: {
                    violation_type: true,
                    orders: { select: { id: true, project_number: true } },
                  },
                },
              },
            },
          },
        }),
        this.dbService.vendor_sp.count({ where }),
      ]);

      return {
        data: spList,
        meta: { total, page, take, skip },
      };
    } catch (error) {
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const sp = await this.dbService.vendor_sp.findFirst({
        where: { id, deleted_at: null },
        include: {
          vendor: {
            select: {
              id: true,
              company_name: true,
              pic_name: true,
              email_address: true,
              phone_number: true,
              is_active: true,
            },
          },
          sp_details: {
            include: {
              violation_log: {
                include: {
                  violation_type: true,
                  orders: {
                    select: { id: true, project_number: true, status: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!sp) {
        throw new NotFoundException(`Surat Peringatan dengan ID ${id} tidak ditemukan.`);
      }

      return sp;
    } catch (error) {
      throw error;
    }
  }

  async findByVendor(vendorId: number) {
    try {
      const spList = await this.dbService.vendor_sp.findMany({
        where: {
          vendor_id: vendorId,
          deleted_at: null,
        },
        orderBy: { created_at: 'desc' },
        include: {
          sp_details: {
            include: {
              violation_log: {
                include: {
                  violation_type: true,
                },
              },
            },
          },
        },
      });

      return spList;
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // CHECK VENDOR SP STATUS
  // ================================

  async checkVendorSpStatus(vendorId: number) {
    const cached = this.getCachedSpStatus(vendorId);
    if (cached) return cached;

    const now = new Date();

    // Get active SP
    const activeSP = await this.dbService.vendor_sp.findFirst({
      where: {
        vendor_id: vendorId,
        status: { in: [SpStatus.ACTIVE, SpStatus.EXTENDED] }, // AKTIF or EXTENDED
        end_date: { gte: now },
      },
      orderBy: { sp_level: 'desc' },
      include: {
        vendor: {
          select: {
            id: true,
            company_name: true,
            pic_name: true,
            is_active: true,
          },
        },
      },
    });

    if (!activeSP) {
      const result = {
        has_active_sp: false,
        sp_level: null,
        sp_status: 'NORMAL',
        vendor_status: 'AKTIF',
        message: 'Vendor tidak memiliki Surat Peringatan yang aktif.',
      };
      this.setCachedSpStatus(vendorId, result);
      return result;
    }

    const spStatusText = this.getSpStatusText(activeSP.sp_level);
    const vendorStatus = activeSP.sp_level === SpLevel.SP3 ? 'NONAKTIF' : 'AKTIF';

    const result = {
      has_active_sp: true,
      sp_id: activeSP.id,
      sp_level: activeSP.sp_level,
      sp_status: spStatusText,
      vendor_status: vendorStatus,
      total_point: activeSP.total_point,
      start_date: activeSP.start_date,
      end_date: activeSP.end_date,
      allocation_reduction: activeSP.allocation_reduction,
      vendor: activeSP.vendor,
      message: `Vendor memiliki ${spStatusText} dengan total ${activeSP.total_point} poin penalti.`,
    };
    
    this.setCachedSpStatus(vendorId, result);
    return result;
  }

  // ================================
  // EXTEND SP DURATION
  // ================================

  async extendSpDuration(id: number, newEndDate: Date, userId?: number) {
    try {
      const sp = await this.dbService.vendor_sp.findFirst({
        where: { id, deleted_at: null },
      });

      if (!sp) {
        throw new NotFoundException(`Surat Peringatan dengan ID ${id} tidak ditemukan.`);
      }

      if (sp.status !== 1) {
        throw new BadRequestException('Hanya SP yang masih aktif yang bisa diperpanjang.');
      }

      return await this.dbService.vendor_sp.update({
        where: { id },
        data: {
          end_date: newEndDate,
          status: 3, // EXTENDED
          updated_by: userId,
          updated_at: new Date(),
        },
      });
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // COMPLETE SP
  // ================================

  async completeSp(id: number, userId?: number) {
    try {
      const sp = await this.dbService.vendor_sp.findFirst({
        where: { id, deleted_at: null },
      });

      if (!sp) {
        throw new NotFoundException(`Surat Peringatan dengan ID ${id} tidak ditemukan.`);
      }

      if (sp.status !== 1 && sp.status !== 3) {
        throw new BadRequestException('SP ini sudah tidak aktif.');
      }

      const updated = await this.dbService.vendor_sp.update({
        where: { id },
        data: {
          status: 2, // SELESAI
          end_date: new Date(),
          updated_by: userId,
          updated_at: new Date(),
        },
      });

      // If vendor is inactive due to SP3, keep them inactive
      // They need to go through reactivation process

      return updated;
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // REACTIVATION (SP3 only)
  // ================================

  async reactivateVendor(dto: ReactivateVendorDto, userId: number) {
    try {
      return await this.dbService.$transaction(async (tx) => {
        const vendor = await tx.vendor.findFirst({
          where: { id: dto.vendor_id, deleted_at: null },
        });

        if (!vendor) {
          throw new NotFoundException(`Vendor dengan ID ${dto.vendor_id} tidak ditemukan.`);
        }

        // Check if vendor is inactive
        if (vendor.is_active) {
          throw new BadRequestException('Vendor sudah aktif. Reaktivasi hanya untuk vendor nonaktif.');
        }

        // Create reactivation log
        const reactivationLog = await tx.vendor_reactivation_log.create({
          data: {
            vendor_id: dto.vendor_id,
            previous_sp_id: dto.previous_sp_id,
            reason: dto.reason,
            approved_by: userId,
            status: 2, // APPROVED
          },
        });

        // Reactivate vendor
        await tx.vendor.update({
          where: { id: dto.vendor_id },
          data: { is_active: true },
        });

        return {
          reactivation_log: reactivationLog,
          vendor: await tx.vendor.findFirst({
            where: { id: dto.vendor_id },
            select: { id: true, company_name: true, pic_name: true, is_active: true },
          }),
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async getReactivationLogs(vendorId?: number) {
    try {
      const where = vendorId ? { vendor_id: vendorId } : {};

      return await this.dbService.vendor_reactivation_log.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: {
          vendor: {
            select: { id: true, company_name: true, pic_name: true },
          },
        },
      });
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // GET ALL VENDORS WITH SP STATUS (for allocation)
  // ================================

  async getVendorsWithSpStatus(vendorIds?: number[]) {
    try {
      const now = new Date();

      const vendors = await this.dbService.vendor.findMany({
        where: {
          deleted_at: null,
          ...(vendorIds ? { id: { in: vendorIds } } : {}),
        },
        select: {
          id: true,
          company_name: true,
          pic_name: true,
          is_active: true,
        },
      });

      // Get active SP for each vendor
      const vendorIdsList = vendors.map((v) => v.id);
      const activeSPs = await this.dbService.vendor_sp.findMany({
        where: {
          vendor_id: { in: vendorIdsList },
          status: { in: [1, 3] }, // AKTIF or EXTENDED
          end_date: { gte: now },
        },
        orderBy: { sp_level: 'desc' },
      });

      const spMap = new Map(activeSPs.map((sp) => [sp.vendor_id, sp]));

      return vendors.map((vendor) => {
        const activeSP = spMap.get(vendor.id);
        return {
          ...vendor,
          has_active_sp: !!activeSP,
          sp_level: activeSP?.sp_level ?? null,
          sp_status: activeSP ? this.getSpStatusText(activeSP.sp_level) : null,
          total_point: activeSP?.total_point ?? null,
          allocation_reduction: activeSP?.allocation_reduction ?? null,
          can_receive_order: !activeSP || activeSP.sp_level < 3,
        };
      });
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // HELPER METHODS
  // ================================

  private getSpStatusText(level: number): string {
    const statusMap: Record<number, string> = {
      1: 'SP1',
      2: 'SP2',
      3: 'SP3',
    };
    return statusMap[level] || 'UNKNOWN';
  }
}
