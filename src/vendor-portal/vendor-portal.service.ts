import { Inject, Injectable, NotFoundException, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUploadPath } from '../common/utils/upload-path.util';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';

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
  private readonly logger = new Logger(VendorPortalService.name);
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
   * Cari vendor_registration berdasarkan opts (userId atau vendorId)
   */
  async findRegistration(opts: { vendorId?: number; userId?: number }) {
    let row = null;
    if (opts.userId) {
      row = await this.prisma.vendor_registration.findFirst({
        where: { user_id: opts.userId, deleted_at: null },
        orderBy: { created_at: 'desc' },
      });
      // Fallback: jika user_id belum di-link, coba cari via username / email
      if (!row) {
        const u = await this.prisma.users.findUnique({
          where: { id: opts.userId },
        });
        if (u) {
          row = await this.prisma.vendor_registration.findFirst({
            where: {
              OR: [
                { email_address: u.username },
                { pic_email: u.username },
                { company_name: u.username },
              ],
              deleted_at: null,
            },
            orderBy: { created_at: 'desc' },
          });
        }
      }
    } else if (opts.vendorId) {
      row = await this.prisma.vendor_registration.findUnique({
        where: { id: opts.vendorId },
      });
    }

    return row;
  }

  /**
   * Build status dari data riil vendor_registration di DB
   */
  private async buildFromDb(opts: {
    vendorId?: number;
    userId?: number;
  }): Promise<VendorPortalStatus> {
    const row = await this.findRegistration(opts);

    if (!row) {
      // Return safe fallback 0% jika user belum memiliki data registrasi
      const emptyProfile: ProfileFlags = {
        company_data: false,
        legal_docs: false,
        portfolio_photos: false,
        certification: false,
        bank_account: false,
      };
      return {
        vendor_id: opts.vendorId ?? opts.userId ?? 0,
        vendor_name: 'Pendaftar Vendor',
        stage: 'pendaftaran',
        profile: emptyProfile,
        profile_completion: 0,
        profile_completed: 0,
        profile_total: 5,
        updated_at: Date.now(),
      };
    }

    const statusInt = row.status;
    const stage = this.statusIntToStage(statusInt);

    // HITUNG DATA REALTIME KELENGKAPAN DOKUMEN DARI KOLOM DATABASE RIIL
    const hasCompanyData = Boolean(
      row.company_name &&
        row.address &&
        row.phone_number &&
        row.pic_name &&
        row.pic_phone,
    );
    const hasLegalDocs = Boolean(
      row.ktp_photo ||
        row.ktp_number ||
        row.npwp_photo ||
        row.npwp_number,
    );
    const hasPortfolio = Boolean(
      row.compro_photo ||
        row.vendor_photo ||
        (row.documents && row.documents.length > 5),
    );
    const hasCertification = Boolean(
      row.siup_photo ||
        row.surat_permohonan_photo ||
        row.pks_photo,
    );
    const hasBankAccount = Boolean(row.bank_id);

    const profile: ProfileFlags = {
      company_data: hasCompanyData,
      legal_docs: hasLegalDocs,
      portfolio_photos: hasPortfolio,
      certification: hasCertification,
      bank_account: hasBankAccount,
    };
    const comp = this.computeProfileCompletion(profile);

    return {
      vendor_id: row.id,
      vendor_name: row.company_name || 'Vendor',
      stage,
      stage_note: row.notes || undefined,
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
    const keyId = opts.vendorId ?? opts.userId;
    if (!keyId) {
      throw new NotFoundException('vendorId or userId required');
    }
    const cached = await this.redis.get(this.REDIS_KEY(keyId));
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
      this.REDIS_KEY(keyId),
      JSON.stringify(status),
      'EX',
      3600,
    );
    return status;
  }

  async updateStage(
    vendorId: number,
    stage: HomeStage,
    stageNote?: string,
  ): Promise<VendorPortalStatus> {
    const statusInt = this.stageToStatusInt(stage);
    await this.prisma.vendor_registration.update({
      where: { id: vendorId },
      data: { status: statusInt, notes: stageNote || null },
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
        ...(profile.legal_docs && { ktp_number: '3201012345670001' }),
        ...(profile.bank_account && { bank_id: 1 }),
      },
    });
    await this.redis.del(this.REDIS_KEY(vendorId));
    return this.getStatus({ vendorId });
  }

  /**
   * Ambil rincian dokumen vendor untuk halaman kelengkapan dokumen
   */
  async getDocuments(opts: { userId?: number; vendorId?: number }) {
    const row = await this.findRegistration(opts);
    const banks = await this.prisma.bank.findMany({
      where: { is_active: true, deleted_at: null },
      orderBy: { bank_name: 'asc' },
    });

    const status = await this.getStatus(opts);

    return {
      registration: row,
      profile_flags: status.profile,
      profile_completion: status.profile_completion,
      profile_completed: status.profile_completed,
      profile_total: status.profile_total,
      banks,
    };
  }

  /**
   * Upload & update kelengkapan dokumen vendor secara riil
   */
  async updateDocuments(
    opts: { userId?: number; vendorId?: number },
    body: any,
    files?: {
      ktp_photo?: Express.Multer.File[];
      npwp_photo?: Express.Multer.File[];
      compro_photo?: Express.Multer.File[];
      siup_photo?: Express.Multer.File[];
      vendor_photo?: Express.Multer.File[];
    },
  ) {
    let reg = await this.findRegistration(opts);
    if (!reg) {
      // Jika belum ada record sama sekali, buatkan record baru
      reg = await this.prisma.vendor_registration.create({
        data: {
          company_name: body.company_name || 'Vendor Usaha',
          address: body.address || 'Alamat Usaha',
          phone_number: body.phone_number || '081234567890',
          email_address: body.email_address || 'vendor@example.com',
          pic_name: body.pic_name || 'PIC Vendor',
          pic_email: body.pic_email || 'pic@example.com',
          pic_phone: body.pic_phone || '081234567890',
          user_id: opts.userId,
        },
      });
    }

    const uploadDir = resolveUploadPath('vendor-documents');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    const updateData: any = {};

    // Handle uploaded files
    const saveFile = (fileList?: Express.Multer.File[], prefix = 'doc'): string | null => {
      if (!fileList || fileList.length === 0) return null;
      const file = fileList[0];
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const filename = `${prefix}-${unique}${extname(file.originalname)}`;
      const fullPath = join(uploadDir, filename);
      writeFileSync(fullPath, file.buffer);
      return `uploads/vendor-documents/${filename}`;
    };

    if (files?.ktp_photo) {
      const p = saveFile(files.ktp_photo, 'ktp');
      if (p) updateData.ktp_photo = p;
    }
    if (files?.npwp_photo) {
      const p = saveFile(files.npwp_photo, 'npwp');
      if (p) updateData.npwp_photo = p;
    }
    if (files?.compro_photo) {
      const p = saveFile(files.compro_photo, 'compro');
      if (p) updateData.compro_photo = p;
    }
    if (files?.siup_photo) {
      const p = saveFile(files.siup_photo, 'siup');
      if (p) updateData.siup_photo = p;
    }
    if (files?.vendor_photo) {
      const p = saveFile(files.vendor_photo, 'vendor');
      if (p) updateData.vendor_photo = p;
    }

    // Handle form text fields
    if (body.company_name) updateData.company_name = String(body.company_name).trim();
    if (body.address) updateData.address = String(body.address).trim();
    if (body.phone_number) updateData.phone_number = String(body.phone_number).trim();
    if (body.pic_name) updateData.pic_name = String(body.pic_name).trim();
    if (body.pic_phone) updateData.pic_phone = String(body.pic_phone).trim();
    if (body.ktp_number) updateData.ktp_number = String(body.ktp_number).trim();
    if (body.npwp_number) updateData.npwp_number = String(body.npwp_number).trim();
    if (body.bank_id) updateData.bank_id = Number(body.bank_id);

    updateData.updated_at = new Date();

    const updated = await this.prisma.vendor_registration.update({
      where: { id: reg.id },
      data: updateData,
    });

    // Invalidate Redis caches
    if (opts.userId) await this.redis.del(this.REDIS_KEY(opts.userId));
    if (reg.id) await this.redis.del(this.REDIS_KEY(reg.id));

    const status = await this.getStatus(opts);

    return {
      success: true,
      message: 'Dokumen kelengkapan profil berhasil diperbarui.',
      registration: updated,
      status,
    };
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
