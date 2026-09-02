import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

export type HomeSection = 'HERO' | 'BENEFIT' | 'BANNER' | 'CATALOG';
export type HomeStage =
  | 'pendaftaran'
  | 'verifikasi'
  | 'review_admin'
  | 'approval'
  | 'approved'
  | 'rejected';

export interface ProfileFlags {
  company_data: boolean;
  legal_docs: boolean;
  portfolio_photos: boolean;
  certification: boolean;
  bank_account: boolean;
}

export interface VendorPortalStatus {
  vendor_id: number;
  vendor_name: string;
  stage: HomeStage;
  stage_note?: string;
  profile: ProfileFlags;
  profile_completion: number; // 0..100
  profile_completed: number; // count
  profile_total: number; // count
  updated_at: number; // epoch ms
}

const STAGE_ORDER: HomeStage[] = [
  'pendaftaran',
  'verifikasi',
  'review_admin',
  'approval',
  'approved',
];

@Injectable()
export class VendorPortalService {
  private readonly REDIS_KEY = (id: number) => `vendor:${id}:status`;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  private computeProfileCompletion(
    profile: ProfileFlags,
  ): { pct: number; done: number; total: number } {
    const items = [
      profile.company_data,
      profile.legal_docs,
      profile.portfolio_photos,
      profile.certification,
      profile.bank_account,
    ];
    const total = items.length;
    const done = items.filter(Boolean).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { pct, done, total };
  }

  /**
   * Build status from Prisma vendor_registration + parsed service_types/areas JSON
   * + profile placeholder flags based on which fields are filled.
   * If `userId` is provided, look up vendor_registration by user_id (after approval).
   * If `vendorId` is provided directly, look up by primary key.
   */
  private async buildFromDb(opts: {
    vendorId?: number;
    userId?: number;
  }): Promise<VendorPortalStatus> {
    let row;
    if (opts.userId) {
      row = await this.prisma.vendor_registration.findFirst({
        where: { user_id: opts.userId },
      });
    } else if (opts.vendorId) {
      row = await this.prisma.vendor_registration.findUnique({
        where: { id: opts.vendorId },
      });
    } else {
      throw new Error('vendorId or userId required');
    }
    if (!row) {
      throw new NotFoundException('Vendor registration tidak ditemukan');
    }
    const statusInt = row.status; // 1=MENUNGGU_APPROVE, 2=PROSES_PITCHING, 3=DISETUJUI, 4=DITOLAK
    const stage = this.statusIntToStage(statusInt);

    // Build profile flags from non-null fields
    const profile: ProfileFlags = {
      company_data: !!row.company_name && !!row.address,
      legal_docs: !!row.ktp_number,
      portfolio_photos: false, // no column yet
      certification: false, // no column yet
      bank_account: !!row.bank_id,
    };
    const comp = this.computeProfileCompletion(profile);

    return {
      vendor_id: row.id,
      vendor_name: row.company_name,
      stage,
      profile,
      profile_completion: comp.pct,
      profile_completed: comp.done,
      profile_total: comp.total,
      updated_at: row.updated_at ? row.updated_at.getTime() : Date.now(),
    };
  }

  private statusIntToStage(statusInt: number): HomeStage {
    if (statusInt === 1) return 'pendaftaran';
    if (statusInt === 2) return 'verifikasi';
    if (statusInt === 3) return 'review_admin';
    if (statusInt === 4) return 'approval';
    if (statusInt === 5) return 'approved';
    if (statusInt === 6) return 'rejected';
    return 'pendaftaran';
  }

  async getStatus(opts: { vendorId?: number; userId?: number }): Promise<VendorPortalStatus> {
    const vendorId = opts.vendorId ?? opts.userId;
    if (!vendorId) {
      throw new NotFoundException('vendorId or userId required');
    }
    const cached = await this.redis.get(this.REDIS_KEY(vendorId));
    if (cached) {
      try {
        return JSON.parse(cached) as VendorPortalStatus;
      } catch {
        // fallthrough to DB
      }
    }
    const status = await this.buildFromDb(opts);
    // Cache for 1 hour
    await this.redis.set(
      this.REDIS_KEY(vendorId),
      JSON.stringify(status),
      'EX',
      3600,
    );
    return status;
  }

  /**
   * Update stage + profile (admin endpoint) and publish to Redis for WS
   */
  async updateStage(
    vendorId: number,
    stage: HomeStage,
    stageNote?: string,
  ): Promise<VendorPortalStatus> {
    const statusInt = this.stageToStatusInt(stage);
    await this.prisma.vendor_registration.update({
      where: { id: vendorId },
      data: { status: statusInt },
    });
    await this.redis.del(this.REDIS_KEY(vendorId));
    const status = await this.getStatus({ vendorId });
    if (stageNote) {
      status.stage_note = stageNote;
      await this.redis.set(
        this.REDIS_KEY(vendorId),
        JSON.stringify(status),
        'EX',
        3600,
      );
    }
    return status;
  }

  async updateProfile(
    vendorId: number,
    profile: ProfileFlags,
  ): Promise<VendorPortalStatus> {
    await this.prisma.vendor_registration.update({
      where: { id: vendorId },
      data: {
        ktp_number: profile.legal_docs ? '__set__' : null,
        bank_id: profile.bank_account ? 1 : null,
      },
    });
    await this.redis.del(this.REDIS_KEY(vendorId));
    return this.getStatus({ vendorId });
  }

  private stageToStatusInt(stage: HomeStage): number {
    const map: Record<HomeStage, number> = {
      pendaftaran: 1,
      verifikasi: 2,
      review_admin: 3,
      approval: 4,
      approved: 5,
      rejected: 6,
    };
    return map[stage] ?? 1;
  }
}
