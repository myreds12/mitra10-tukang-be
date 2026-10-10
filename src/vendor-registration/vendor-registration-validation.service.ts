/* eslint-disable prettier/prettier */
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterVendorDto,
  TukangRegistrationDto,
} from './dto/vendor-registration.dto';
import { Prisma } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { RegistrationStatus } from './enums/registration-status.enum';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';
import {
  PENDAFTAR_VENDOR_ROLE,
  REJECTED_COOLDOWN_DAYS,
  REJECTED_DOCUMENT_RETENTION_HOURS,
} from './vendor-registration.constants';

@Injectable()
export class VendorRegistrationValidationService {
  private readonly logger = new Logger(VendorRegistrationValidationService.name);
  readonly rejectedCooldownDays = REJECTED_COOLDOWN_DAYS;
  readonly rejectedDocumentRetentionHours = REJECTED_DOCUMENT_RETENTION_HOURS;

  constructor(private readonly dbService: PrismaService) {}
  saveFile(file: Express.Multer.File, subFolder: string = 'vendor'): string {
    try {
      const uploadDir = resolveUploadPath(subFolder);
      const fileName = `${Date.now()}-${file.originalname}`;
      const filePath = join(uploadDir, fileName);
      writeFileSync(filePath, file.buffer as any);

      return `uploads/${subFolder}/${fileName}`;
    } catch (error) {
      console.error('Error saving file:', error);
      return '';
    }
  }

  getRegistrationDocumentPaths(registration: {
    documents?: string | null;
    vendor_photo?: string | null;
    ktp_photo?: string | null;
    npwp_photo?: string | null;
    compro_photo?: string | null;
    surat_permohonan_photo?: string | null;
    pks_photo?: string | null;
    siup_photo?: string | null;
  }): string[] {
    const paths = [
      registration.vendor_photo,
      registration.ktp_photo,
      registration.npwp_photo,
      registration.compro_photo,
      registration.surat_permohonan_photo,
      registration.pks_photo,
      registration.siup_photo,
    ].filter((path): path is string => Boolean(path));

    if (registration.documents) {
      try {
        const documents = JSON.parse(registration.documents);
        if (Array.isArray(documents)) {
          for (const document of documents) {
            const documentPath =
              typeof document === 'string' ? document : document?.path;
            if (documentPath) paths.push(documentPath);
          }
        }
      } catch {
        this.logger.warn('Unable to parse legacy vendor registration documents.');
      }
    }

    return [...new Set(paths)];
  }



  parseTukangData(
    data?: TukangRegistrationDto[] | string | null,
    options: { validate?: boolean } = {},
  ): TukangRegistrationDto[] {
    if (!data) return [];

    let parsed: any;
    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      if (options.validate) {
        throw new BadRequestException('Data tukang harus berupa JSON array yang valid.');
      }
      return [];
    }

    if (!Array.isArray(parsed)) {
      if (options.validate) {
        throw new BadRequestException('Data tukang harus berupa array.');
      }
      return [];
    }

    if (!options.validate) {
      return parsed;
    }

    parsed.forEach((tukang, index) => {
      const fullName = tukang.full_name || (tukang as any).nama;
      const phoneNumber = tukang.phone_number || (tukang as any).no_hp;
      const ktpNumber = tukang.ktp_number || (tukang as any).no_ktp;
      const skill = tukang.skill || (tukang as any).keahlian || (tukang as any).service_type_id;

      if (
        !fullName ||
        !phoneNumber ||
        !ktpNumber ||
        skill === undefined ||
        skill === null ||
        skill === '' ||
        (Array.isArray(skill) && skill.length === 0)
      ) {
        throw new BadRequestException(
          `Data tukang ke-${index + 1} wajib berisi nama, no_hp, no_ktp, dan skill.`,
        );
      }
    });

    return parsed;
  }

  parseIntJsonArray(value?: string | number[] | null): number[] {
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) {
      return value
        .map((v) => Number(v))
        .filter((v): v is number => Number.isInteger(v));
    }
    try {
      const parsed = JSON.parse(value as string);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => Number(v))
          .filter((v): v is number => Number.isInteger(v));
      }
    } catch {
      return [];
    }
    return [];
  }

  formatRegistration(registration: any) {
    const serviceTypes = registration.service_types
      ? JSON.parse(registration.service_types)
      : [];
    const areas = registration.areas ? JSON.parse(registration.areas) : [];
    const tukangData = registration.tukang_data
      ? this.parseTukangData(registration.tukang_data)
      : [];

    return {
      ...registration,
      service_types: serviceTypes,
      areas,
      tukang_data: tukangData,
      tukang: tukangData,
    };
  }

  private async attachEmailStatus(registrations: any[]) {
    if (!registrations || registrations.length === 0) {
      return [];
    }

    const registrationIds = registrations
      .map((r) => r.id)
      .filter((id): id is number => typeof id === 'number');
    const emails = Array.from(
      new Set(
        registrations
          .flatMap((r) => [r.pic_email, r.email_address])
          .filter((e): e is string => Boolean(e && typeof e === 'string' && e.trim() !== '')),
      ),
    );

    const conditions: any[] = [];
    if (registrationIds.length > 0) {
      conditions.push({ moduleId: { in: registrationIds } });
    }
    for (const email of emails) {
      conditions.push({ to: { contains: email } });
    }

    const mailLogs =
      conditions.length > 0
        ? await this.dbService.mail_logs.findMany({
            where: {
              OR: conditions,
            },
            orderBy: { createdAt: 'desc' },
          })
        : [];

    return registrations.map((reg) => {
      const recipient = reg.pic_email || reg.email_address;
      const log = mailLogs.find(
        (ml) =>
          ml.moduleId === reg.id ||
          (recipient && ml.to && ml.to.toLowerCase() === recipient.toLowerCase()),
      );

      const emailStatus = log
        ? {
            sent: log.status === 1,
            status: log.status === 1 ? 'TERKIRIM' : 'GAGAL',
            sent_at: log.createdAt,
            recipient: log.to,
            log_id: log.id,
          }
        : {
            sent: false,
            status: 'BELUM_TERKIRIM',
            sent_at: null,
            recipient,
            log_id: null,
          };

      return {
        ...reg,
        email_status: emailStatus,
      };
    });
  }

  async assertAdminHO(userId?: number) {
    if (!userId) {
      throw new ForbiddenException('Akses hanya untuk Admin HO.');
    }

    const user = await this.dbService.users.findFirst({
      where: {
        id: userId,
        deleted_at: null,
      },
      include: {
        roles: true,
      },
    });

    const roleName = user?.roles?.name?.toLowerCase();
    if (!roleName || !['admin ho', 'super user'].includes(roleName)) {
      throw new ForbiddenException('Akses hanya untuk Admin HO.');
    }
  }

  async createHistory(
    tx: Prisma.TransactionClient,
    data: {
      vendor_registration_id: number;
      from_status?: number | null;
      to_status: number;
      action: string;
      notes?: string | null;
      actor_id?: number | null;
    },
  ) {
    await (tx as any).vendor_registration_history.create({
      data: {
        vendor_registration_id: data.vendor_registration_id,
        from_status: data.from_status ?? null,
        to_status: data.to_status,
        action: data.action,
        notes: data.notes ?? null,
        actor_id: data.actor_id ?? null,
      },
    });
  }

  getRejectedCooldownUntil(rejectedAt: Date) {
    const cooldownUntil = new Date(rejectedAt);
    cooldownUntil.setDate(cooldownUntil.getDate() + this.rejectedCooldownDays);
    return cooldownUntil;
  }

  formatCooldownDate(date: Date) {
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  async assertRejectedCooldown(dto: RegisterVendorDto) {
    const rejectedRegistration = await this.dbService.vendor_registration.findFirst({
      where: {
        deleted_at: null,
        anonymized_at: null,
        status: RegistrationStatus.DITOLAK,
        rejected_at: { not: null },
        OR: [
          { email_address: dto.email_address },
          { phone_number: dto.phone_number },
          { pic_email: dto.pic_email },
          { pic_phone: dto.pic_phone },
        ],
      },
      orderBy: { rejected_at: 'desc' },
    });

    if (!rejectedRegistration?.rejected_at) {
      return;
    }

    const cooldownUntil = this.getRejectedCooldownUntil(rejectedRegistration.rejected_at);
    if (cooldownUntil > new Date()) {
      throw new BadRequestException(
        `Anda dapat mendaftar ulang setelah ${this.formatCooldownDate(cooldownUntil)}.`,
      );
    }
  }

  // Pattern role-check manual (konsisten dengan getRoleName di vendor-violation.service.ts)
  async getRoleName(userId?: number): Promise<string | null> {
    if (!userId) return null;
    const user = await this.dbService.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: { roles: { select: { name: true } } },
    });
    return user?.roles?.name ?? null;
  }

  async assertAdminHOOrSuperUser(userId?: number) {
    const roleName = await this.getRoleName(userId);
    if (!roleName || !['admin ho', 'super user'].includes(roleName.toLowerCase())) {
      throw new ForbiddenException('Akses hanya untuk Admin HO / Super User.');
    }
  }

  async assertRegistrant(userId?: number) {
    const roleName = await this.getRoleName(userId);
    if (!roleName || roleName.toLowerCase() !== PENDAFTAR_VENDOR_ROLE.toLowerCase()) {
      throw new ForbiddenException('Akses hanya untuk akun pendaftar vendor.');
    }
  }

  // Username akun pendaftar: menggunakan email PIC (fallback email perusahaan) secara utuh (@ tidak dihilangkan).
  buildRegistrantUsername(registration: {
    pic_email?: string | null;
    email_address?: string | null;
  }): string {
    const email = (
      registration.pic_email ||
      registration.email_address ||
      ''
    )
      .toLowerCase()
      .trim();
    return email || `pendaftar_${Date.now()}@temp.local`;
  }

  // Role-check publik untuk endpoint dashboard pendaftar (dipanggil controller).
  async assertRegistrantAccess(userId?: number) {
    await this.assertRegistrant(userId);
  }

  getPhoneVariants(phone: string): string[] {
    const trimmed = (phone || '').trim();
    if (!trimmed) return [];
    const variants = new Set<string>();
    variants.add(trimmed);

    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 7) {
      variants.add(digits);
      if (digits.startsWith('0')) {
        const rest = digits.slice(1);
        variants.add(rest);
        variants.add('62' + rest);
        variants.add('+62' + rest);
      } else if (digits.startsWith('62')) {
        const rest = digits.slice(2);
        variants.add('0' + rest);
        variants.add(rest);
        variants.add('+' + digits);
      } else {
        variants.add('0' + digits);
        variants.add('62' + digits);
        variants.add('+62' + digits);
      }
    }
    return Array.from(variants);
  }

  async checkUnique(
    type:
      | 'npwp'
      | 'ktp_pic'
      | 'ktp_tukang'
      | 'email'
      | 'email_address'
      | 'pic_email'
      | 'company_name'
      | 'company'
      | 'phone'
      | 'phone_company'
      | 'phone_pic'
      | 'phone_tukang',
    value: string,
  ): Promise<{ is_registered: boolean; message: string }> {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      return { is_registered: false, message: '' };
    }

    const digits = trimmed.replace(/\D/g, '');

    if (type === 'company_name' || type === 'company') {
      const existingVendor = await this.dbService.vendor.findFirst({
        where: {
          deleted_at: null,
          company_name: trimmed,
        },
        select: { id: true },
      });

      if (existingVendor) {
        return { is_registered: true, message: 'Nama Perusahaan sudah terdaftar' };
      }

      const existingReg = await this.dbService.vendor_registration.findFirst({
        where: {
          deleted_at: null,
          status: {
            in: [
              RegistrationStatus.MENUNGGU_APPROVE,
              RegistrationStatus.PROSES_PITCHING,
              RegistrationStatus.DISETUJUI,
            ],
          },
          company_name: trimmed,
        },
        select: { id: true },
      });

      if (existingReg) {
        return { is_registered: true, message: 'Nama Perusahaan sudah terdaftar' };
      }

      return { is_registered: false, message: '' };
    }

    if (
      type === 'phone' ||
      type === 'phone_company' ||
      type === 'phone_pic' ||
      type === 'phone_tukang'
    ) {
      const phoneVariants = this.getPhoneVariants(trimmed);
      const lastDigits = digits.length >= 9 ? digits.slice(-9) : (digits.length >= 7 ? digits : '');

      // 1. Cek vendor aktif di tabel vendor
      const existingVendor = await this.dbService.vendor.findFirst({
        where: {
          deleted_at: null,
          OR: [
            { phone_number: { in: phoneVariants } },
            ...(lastDigits ? [{ phone_number: { contains: lastDigits } }] : []),
          ],
        },
        select: { id: true, phone_number: true },
      });

      if (existingVendor) {
        return { is_registered: true, message: 'Nomor telepon sudah terdaftar' };
      }

      // 2. Cek vendor_registration aktif (MENUNGGU_APPROVE, PROSES_PITCHING, DISETUJUI)
      const existingReg = await this.dbService.vendor_registration.findFirst({
        where: {
          deleted_at: null,
          status: {
            in: [
              RegistrationStatus.MENUNGGU_APPROVE,
              RegistrationStatus.PROSES_PITCHING,
              RegistrationStatus.DISETUJUI,
            ],
          },
          OR: [
            { phone_number: { in: phoneVariants } },
            { pic_phone: { in: phoneVariants } },
            ...(lastDigits
              ? [
                  { phone_number: { contains: lastDigits } },
                  { pic_phone: { contains: lastDigits } },
                ]
              : []),
          ],
        },
        select: { id: true },
      });

      if (existingReg) {
        return { is_registered: true, message: 'Nomor telepon sudah terdaftar' };
      }

      // 3. Cek tabel tukang
      const existingTukang = await this.dbService.tukang.findFirst({
        where: {
          deleted_at: null,
          OR: [
            { phone_number: { in: phoneVariants } },
            ...(lastDigits ? [{ phone_number: { contains: lastDigits } }] : []),
          ],
        },
        select: { id: true },
      });

      if (existingTukang) {
        return { is_registered: true, message: 'Nomor telepon sudah terdaftar' };
      }

      // 4. Cek tukang_data di vendor_registration aktif
      const activeRegsWithTukang = await this.dbService.vendor_registration.findMany({
        where: {
          deleted_at: null,
          status: {
            in: [
              RegistrationStatus.MENUNGGU_APPROVE,
              RegistrationStatus.PROSES_PITCHING,
              RegistrationStatus.DISETUJUI,
            ],
          },
          tukang_data: { not: null },
          OR: [
            ...phoneVariants.map((p) => ({ tukang_data: { contains: p } })),
            ...(lastDigits ? [{ tukang_data: { contains: lastDigits } }] : []),
          ],
        },
        select: { tukang_data: true },
      });

      for (const reg of activeRegsWithTukang) {
        const tukangs = this.parseTukangData(reg.tukang_data);
        for (const t of tukangs) {
          const tPhone = (t.phone_number || (t as any).no_hp || '').trim();
          const tDigits = tPhone.replace(/\D/g, '');
          if (
            tPhone &&
            (phoneVariants.includes(tPhone) ||
              (lastDigits && tDigits.includes(lastDigits)))
          ) {
            return { is_registered: true, message: 'Nomor telepon sudah terdaftar' };
          }
        }
      }

      return { is_registered: false, message: '' };
    }

    if (type === 'npwp') {
      const regOrConditions: Prisma.vendor_registrationWhereInput[] = [
        { npwp_number: trimmed },
      ];
      if (digits && digits !== trimmed) {
        regOrConditions.push({ npwp_number: digits });
      }

      const existingReg = await this.dbService.vendor_registration.findFirst({
        where: {
          deleted_at: null,
          status: {
            in: [
              RegistrationStatus.MENUNGGU_APPROVE,
              RegistrationStatus.PROSES_PITCHING,
              RegistrationStatus.DISETUJUI,
            ],
          },
          OR: regOrConditions,
        },
        select: { id: true },
      });

      if (existingReg) {
        return { is_registered: true, message: 'No NPWP sudah terdaftar' };
      }

      const vendorOrConditions: Prisma.vendorWhereInput[] = [
        { npwp_number: trimmed },
      ];
      if (digits && digits !== trimmed) {
        vendorOrConditions.push({ npwp_number: digits });
      }

      const existingVendor = await this.dbService.vendor.findFirst({
        where: {
          deleted_at: null,
          OR: vendorOrConditions,
        },
        select: { id: true },
      });

      if (existingVendor) {
        return { is_registered: true, message: 'No NPWP sudah terdaftar' };
      }

      if (digits.length >= 10) {
        const activeRegs = await this.dbService.vendor_registration.findMany({
          where: {
            deleted_at: null,
            status: {
              in: [
                RegistrationStatus.MENUNGGU_APPROVE,
                RegistrationStatus.PROSES_PITCHING,
                RegistrationStatus.DISETUJUI,
              ],
            },
            npwp_number: { not: null },
          },
          select: { npwp_number: true },
        });

        if (activeRegs.some((r) => r.npwp_number && r.npwp_number.replace(/\D/g, '') === digits)) {
          return { is_registered: true, message: 'No NPWP sudah terdaftar' };
        }

        const activeVendors = await this.dbService.vendor.findMany({
          where: {
            deleted_at: null,
            npwp_number: { not: null },
          },
          select: { npwp_number: true },
        });

        if (activeVendors.some((v) => v.npwp_number && v.npwp_number.replace(/\D/g, '') === digits)) {
          return { is_registered: true, message: 'No NPWP sudah terdaftar' };
        }
      }

      return { is_registered: false, message: '' };
    }

    if (type === 'ktp_pic') {
      const regOrConditions: Prisma.vendor_registrationWhereInput[] = [
        { ktp_number: trimmed },
      ];
      if (digits && digits !== trimmed) {
        regOrConditions.push({ ktp_number: digits });
      }

      const existingReg = await this.dbService.vendor_registration.findFirst({
        where: {
          deleted_at: null,
          status: {
            in: [
              RegistrationStatus.MENUNGGU_APPROVE,
              RegistrationStatus.PROSES_PITCHING,
              RegistrationStatus.DISETUJUI,
            ],
          },
          OR: regOrConditions,
        },
        select: { id: true },
      });

      if (existingReg) {
        return { is_registered: true, message: 'KTP Sudah terdaftar' };
      }

      const vendorOrConditions: Prisma.vendorWhereInput[] = [
        { ktp_number: trimmed },
      ];
      if (digits && digits !== trimmed) {
        vendorOrConditions.push({ ktp_number: digits });
      }

      const existingVendor = await this.dbService.vendor.findFirst({
        where: {
          deleted_at: null,
          OR: vendorOrConditions,
        },
        select: { id: true },
      });

      if (existingVendor) {
        return { is_registered: true, message: 'KTP Sudah terdaftar' };
      }

      if (digits.length >= 10) {
        const activeRegs = await this.dbService.vendor_registration.findMany({
          where: {
            deleted_at: null,
            status: {
              in: [
                RegistrationStatus.MENUNGGU_APPROVE,
                RegistrationStatus.PROSES_PITCHING,
                RegistrationStatus.DISETUJUI,
              ],
            },
            ktp_number: { not: null },
          },
          select: { ktp_number: true },
        });

        if (activeRegs.some((r) => r.ktp_number && r.ktp_number.replace(/\D/g, '') === digits)) {
          return { is_registered: true, message: 'KTP Sudah terdaftar' };
        }

        const activeVendors = await this.dbService.vendor.findMany({
          where: {
            deleted_at: null,
            ktp_number: { not: null },
          },
          select: { ktp_number: true },
        });

        if (activeVendors.some((v) => v.ktp_number && v.ktp_number.replace(/\D/g, '') === digits)) {
          return { is_registered: true, message: 'KTP Sudah terdaftar' };
        }
      }

      const tukangKtpConditions: Prisma.tukangWhereInput[] = [
        { ktp_number: trimmed },
      ];
      if (digits && digits !== trimmed) {
        tukangKtpConditions.push({ ktp_number: digits });
      }

      const existingTukangWithPicKtp = await this.dbService.tukang.findFirst({
        where: {
          deleted_at: null,
          OR: tukangKtpConditions,
        },
        select: { id: true },
      });

      if (existingTukangWithPicKtp) {
        return { is_registered: true, message: 'KTP Sudah terdaftar' };
      }

      return { is_registered: false, message: '' };
    }

    if (type === 'ktp_tukang') {
      const tukangOrConditions: Prisma.tukangWhereInput[] = [
        { ktp_number: trimmed },
      ];
      if (digits && digits !== trimmed) {
        tukangOrConditions.push({ ktp_number: digits });
      }

      const existingTukang = await this.dbService.tukang.findFirst({
        where: {
          deleted_at: null,
          OR: tukangOrConditions,
        },
        select: { id: true },
      });

      if (existingTukang) {
        return { is_registered: true, message: 'No KTP sudah terdaftar' };
      }

      const picRegConditions: Prisma.vendor_registrationWhereInput[] = [
        { ktp_number: trimmed },
      ];
      if (digits && digits !== trimmed) {
        picRegConditions.push({ ktp_number: digits });
      }

      const existingPicReg = await this.dbService.vendor_registration.findFirst({
        where: {
          deleted_at: null,
          status: {
            in: [
              RegistrationStatus.MENUNGGU_APPROVE,
              RegistrationStatus.PROSES_PITCHING,
              RegistrationStatus.DISETUJUI,
            ],
          },
          OR: picRegConditions,
        },
        select: { id: true },
      });

      if (existingPicReg) {
        return { is_registered: true, message: 'No KTP sudah terdaftar' };
      }

      const vendorKtpConditions: Prisma.vendorWhereInput[] = [
        { ktp_number: trimmed },
      ];
      if (digits && digits !== trimmed) {
        vendorKtpConditions.push({ ktp_number: digits });
      }

      const existingPicVendor = await this.dbService.vendor.findFirst({
        where: {
          deleted_at: null,
          OR: vendorKtpConditions,
        },
        select: { id: true },
      });

      if (existingPicVendor) {
        return { is_registered: true, message: 'No KTP sudah terdaftar' };
      }

      const activeRegsWithTukang = await this.dbService.vendor_registration.findMany({
        where: {
          deleted_at: null,
          status: {
            in: [
              RegistrationStatus.MENUNGGU_APPROVE,
              RegistrationStatus.PROSES_PITCHING,
              RegistrationStatus.DISETUJUI,
            ],
          },
          tukang_data: { not: null },
          OR: [
            { tukang_data: { contains: trimmed } },
            ...(digits ? [{ tukang_data: { contains: digits } }] : []),
          ],
        },
        select: { tukang_data: true },
      });

      for (const reg of activeRegsWithTukang) {
        const tukangs = this.parseTukangData(reg.tukang_data);
        for (const t of tukangs) {
          const tKtp = (t.ktp_number || (t as any).no_ktp || '').trim();
          if (tKtp && (tKtp === trimmed || (digits && tKtp.replace(/\D/g, '') === digits))) {
            return { is_registered: true, message: 'No KTP sudah terdaftar' };
          }
        }
      }

      if (digits.length >= 10) {
        const tukangsWithKtp = await this.dbService.tukang.findMany({
          where: {
            deleted_at: null,
            ktp_number: { not: null },
          },
          select: { ktp_number: true },
        });

        if (tukangsWithKtp.some((t) => t.ktp_number && t.ktp_number.replace(/\D/g, '') === digits)) {
          return { is_registered: true, message: 'No KTP sudah terdaftar' };
        }
      }

      return { is_registered: false, message: '' };
    }

    if (type === 'email' || type === 'email_address' || type === 'pic_email') {
      const emailLower = trimmed.toLowerCase();

      // 1. Cek vendor_registration yang aktif (MENUNGGU_APPROVE, PROSES_PITCHING, DISETUJUI)
      const existingReg = await this.dbService.vendor_registration.findFirst({
        where: {
          deleted_at: null,
          status: {
            in: [
              RegistrationStatus.MENUNGGU_APPROVE,
              RegistrationStatus.PROSES_PITCHING,
              RegistrationStatus.DISETUJUI,
            ],
          },
          OR: [
            { email_address: trimmed },
            { email_address: emailLower },
            { pic_email: trimmed },
            { pic_email: emailLower },
          ],
        },
        select: { id: true },
      });

      if (existingReg) {
        return { is_registered: true, message: 'Email sudah terdaftar' };
      }

      // 2. Cek vendor_registration yang ditolak (cooldown 30 hari)
      const rejectedReg = await this.dbService.vendor_registration.findFirst({
        where: {
          deleted_at: null,
          anonymized_at: null,
          status: RegistrationStatus.DITOLAK,
          rejected_at: { not: null },
          OR: [
            { email_address: trimmed },
            { email_address: emailLower },
            { pic_email: trimmed },
            { pic_email: emailLower },
          ],
        },
        orderBy: { rejected_at: 'desc' },
        select: { id: true, rejected_at: true },
      });

      if (rejectedReg && rejectedReg.rejected_at) {
        const cooldownMs = 30 * 24 * 60 * 60 * 1000;
        const elapsedMs = Date.now() - new Date(rejectedReg.rejected_at).getTime();
        if (elapsedMs < cooldownMs) {
          const remainingDays = Math.max(1, Math.ceil((cooldownMs - elapsedMs) / (24 * 60 * 60 * 1000)));
          return {
            is_registered: true,
            message: `Email masih dalam masa cooldown penolakan (${remainingDays} hari lagi)`,
          };
        }
      }

      // 3. Cek vendor aktif di tabel vendor
      const existingVendor = await this.dbService.vendor.findFirst({
        where: {
          deleted_at: null,
          OR: [
            { email_address: trimmed },
            { email_address: emailLower },
          ],
        },
        select: { id: true },
      });

      if (existingVendor) {
        return { is_registered: true, message: 'Email sudah terdaftar' };
      }

      // 4. Cek pic_vendor di tabel pic_vendor
      const existingPicVendor = await this.dbService.pic_vendor.findFirst({
        where: {
          deleted_at: null,
          OR: [
            { email_address: trimmed },
            { email_address: emailLower },
          ],
        },
        select: { id: true },
      });

      if (existingPicVendor) {
        return { is_registered: true, message: 'Email sudah terdaftar' };
      }

      // 5. Cek username di tabel users (baik raw email atau normalized username)
      const normalizedUsername = emailLower.replace(/[^a-z0-9._-]/g, '');
      const existingUser = await this.dbService.users.findFirst({
        where: {
          deleted_at: null,
          OR: [
            { username: trimmed },
            { username: emailLower },
            { username: normalizedUsername },
          ],
        },
        select: { id: true },
      });

      if (existingUser) {
        return { is_registered: true, message: 'Email sudah terdaftar' };
      }

      return { is_registered: false, message: '' };
    }

    return { is_registered: false, message: '' };
  }


}
