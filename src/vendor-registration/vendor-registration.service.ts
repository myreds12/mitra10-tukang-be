/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  RegisterVendorDto,
  QueryVendorRegistrationDto,
  ApproveVendorRegistrationDto,
  RejectVendorRegistrationDto,
  TukangRegistrationDto,
  UpdateTermsAndConditionsDto,
} from './dto/vendor-registration.dto';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashSync } from 'bcrypt';
import { writeFileSync, unlinkSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import { RegistrationStatus } from './enums/registration-status.enum';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { Cron } from '@nestjs/schedule';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';

// Role khusus akun pendaftar vendor (belum di-approve; dibuat lewat migration seed)
const PENDAFTAR_VENDOR_ROLE = 'Pendaftar Vendor';

@Injectable()
export class VendorRegistrationService {
  private readonly logger = new Logger(VendorRegistrationService.name);
  private readonly rejectedCooldownDays = 30;
  private readonly rejectedDocumentRetentionHours = 36;

  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly notifService: NotificationsService,
  ) {}

  // ================================
  // PUBLIC: VENDOR REGISTRATION
  // ================================

  private saveFile(file: Express.Multer.File, subFolder: string = 'vendor'): string {
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

  private getRegistrationDocumentPaths(registration: {
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

// private deleteUploadedFile(storedPath: string) {
//     const uploadRoot = resolveUploadPath();
//     const normalizedPath = storedPath.replace(/^[/\\]+/, '');
//     const relativeStoredPath = normalizedPath.replace(/^uploads[/\\]/, '');

//     if (!relativeStoredPath.startsWith('vendor/')) {
//       throw new Error(`Refusing to delete file outside vendor folder: ${storedPath}`);
//     }

//     const absolutePath = resolve(uploadRoot, relativeStoredPath);
//     const relativePath = relative(uploadRoot, absolutePath);

//     if (
//       relativePath.startsWith('..') ||
//       isAbsolute(relativePath)
//     ) {
//       throw new Error(`Refusing to delete file outside uploads: ${storedPath}`);
//     }

//     try {
//       unlinkSync(absolutePath);
//     } catch (error) {
//       if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
//         throw error;
//       }
//     }
//   }

  private parseTukangData(
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

  private parseIntJsonArray(value?: string | number[] | null): number[] {
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

  private formatRegistration(registration: any) {
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

  private async assertAdminHO(userId?: number) {
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

  private async createHistory(
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

  private getRejectedCooldownUntil(rejectedAt: Date) {
    const cooldownUntil = new Date(rejectedAt);
    cooldownUntil.setDate(cooldownUntil.getDate() + this.rejectedCooldownDays);
    return cooldownUntil;
  }

  private formatCooldownDate(date: Date) {
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  private async assertRejectedCooldown(dto: RegisterVendorDto) {
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

  private async assertAdminHOOrSuperUser(userId?: number) {
    const roleName = await this.getRoleName(userId);
    if (!roleName || !['admin ho', 'super user'].includes(roleName.toLowerCase())) {
      throw new ForbiddenException('Akses hanya untuk Admin HO / Super User.');
    }
  }

  private async assertRegistrant(userId?: number) {
    const roleName = await this.getRoleName(userId);
    if (!roleName || roleName.toLowerCase() !== PENDAFTAR_VENDOR_ROLE.toLowerCase()) {
      throw new ForbiddenException('Akses hanya untuk akun pendaftar vendor.');
    }
  }

  // Username akun pendaftar: email PIC (fallback email perusahaan) di-sanitasi.
  private buildRegistrantUsername(registration: {
    pic_email?: string | null;
    email_address?: string | null;
  }): string {
    const email = (registration.pic_email || registration.email_address || '').toLowerCase().trim();
    const username = email.replace(/[^a-z0-9._-]/g, '');
    return username || `pendaftar_${Date.now()}`;
  }

  // Role-check publik untuk endpoint dashboard pendaftar (dipanggil controller).
  async assertRegistrantAccess(userId?: number) {
    await this.assertRegistrant(userId);
  }

  async registerVendor(dto: RegisterVendorDto, files?: any) {
    try {
      if (!dto.pdp_consent) {
        throw new BadRequestException(
          'Persetujuan pemrosesan data pribadi sesuai UU PDP wajib disetujui.',
        );
      }

      await this.assertRejectedCooldown(dto);


      // Check if email already registered
      const existing = await this.dbService.vendor_registration.findFirst({
        where: {
          email_address: dto.email_address,
          deleted_at: null,
          status: {
            in: [
              RegistrationStatus.MENUNGGU_APPROVE,
              RegistrationStatus.PROSES_PITCHING,
              RegistrationStatus.DISETUJUI,
            ],
          },
        },
      });

      if (existing) {
        throw new BadRequestException(
          'Email ini sudah terdaftar dalam sistem.',
        );
      }

      // Idempotensi akun pendaftar: tolak jika email PIC sudah dipakai pada
      // pendaftaran yang masih berjalan (belum ditolak), supaya tidak ada user duplikat.
      const existingPicRegistration = await this.dbService.vendor_registration.findFirst({
        where: {
          pic_email: dto.pic_email,
          deleted_at: null,
          status: {
            in: [
              RegistrationStatus.MENUNGGU_APPROVE,
              RegistrationStatus.PROSES_PITCHING,
              RegistrationStatus.DISETUJUI,
            ],
          },
        },
      });

      if (existingPicRegistration) {
        throw new BadRequestException(
          `Email PIC sudah dipakai pada pendaftaran lain (ID ${existingPicRegistration.id}) yang sedang diproses. Gunakan email PIC lain.`,
        );
      }

      // Check if company already exists in vendor table
      const companyExists = await this.dbService.vendor.findFirst({
        where: {
          company_name: dto.company_name,
          deleted_at: null,
        },
      });

      if (companyExists) {
        throw new BadRequestException(
          'Nama perusahaan sudah terdaftar sebagai vendor.',
        );
      }

      // Idempotensi username akun pendaftar (username = email PIC yang di-sanitasi)
      const registrantUsername = this.buildRegistrantUsername(dto);
      const existingUser = await this.dbService.users.findFirst({
        where: { username: registrantUsername },
      });

      if (existingUser) {
        throw new BadRequestException(
          'Email PIC sudah terdaftar sebagai username akun. Silakan gunakan email PIC lain atau hubungi Admin Mitra10.',
        );
      }

      // Handle file uploads
      let vendorPhotoPath = '';
      let ktpPhotoPath = '';
      let npwpPhotoPath = '';
      let comproPhotoPath = '';
      let suratPermohonanPhotoPath = '';
      let pksPhotoPath = '';
      let siupPhotoPath = '';

      if (files) {
        if (files.vendor_photo && files.vendor_photo[0]) {
          vendorPhotoPath = this.saveFile(files.vendor_photo[0], 'vendor');
        }
        if (files.ktp_photo && files.ktp_photo[0]) {
          ktpPhotoPath = this.saveFile(files.ktp_photo[0], 'vendor');
        }
        if (files.npwp_photo && files.npwp_photo[0]) {
          npwpPhotoPath = this.saveFile(files.npwp_photo[0], 'vendor');
        }
        if (files.compro_photo && files.compro_photo[0]) {
          comproPhotoPath = this.saveFile(files.compro_photo[0], 'vendor');
        }
        if (files.surat_permohonan_photo && files.surat_permohonan_photo[0]) {
          suratPermohonanPhotoPath = this.saveFile(files.surat_permohonan_photo[0], 'vendor');
        }
        if (files.pks_photo && files.pks_photo[0]) {
          pksPhotoPath = this.saveFile(files.pks_photo[0], 'vendor');
        }
        if (files.siup_photo && files.siup_photo[0]) {
          siupPhotoPath = this.saveFile(files.siup_photo[0], 'vendor');
        }
      }

      // Create registration
      // Handle service_types and areas - could be array or JSON string from FormData
      const serviceTypesData = dto.service_types
        ? typeof dto.service_types === 'string'
          ? dto.service_types
          : JSON.stringify(dto.service_types)
        : null;
      const areasData = dto.areas
        ? typeof dto.areas === 'string'
          ? dto.areas
          : JSON.stringify(dto.areas)
        : null;
      // Password sementara acak yang aman; dikirim via email supaya pendaftar bisa
      // login ke dashboard pendaftar dan memantau status (reset password tersedia).
      const registrantPassword = `M1tr${randomBytes(4).toString('hex').toUpperCase()}@${new Date().getFullYear()}`;


      const tukangData = this.parseTukangData(dto.tukang_data, { validate: true });
      const registration = await this.dbService.$transaction(async (tx) => {
        const createdRegistration = await tx.vendor_registration.create({
          data: {
            company_name: dto.company_name,
            address: dto.address,
            phone_number: dto.phone_number,
            email_address: dto.email_address,
            pic_name: dto.pic_name,
            pic_email: dto.pic_email,
            pic_phone: dto.pic_phone,
            ktp_number: dto.ktp_number,
            npwp_number: dto.npwp_number,
            bank_id: dto.bank_id,
            service_types: serviceTypesData,
            areas: areasData,
            notes: dto.notes,
            status: RegistrationStatus.MENUNGGU_APPROVE,
            ...({
              pdp_consent: true,
              pdp_consent_at: new Date(),
            } as any),
            // Photo paths
            vendor_photo: vendorPhotoPath || null,
            ktp_photo: ktpPhotoPath || null,
            npwp_photo: npwpPhotoPath || null,
            compro_photo: comproPhotoPath || null,
            surat_permohonan_photo: suratPermohonanPhotoPath || null,
            pks_photo: pksPhotoPath || null,
            siup_photo: siupPhotoPath || null,
            // Tukang data is stored temporarily until registration approval.
            tukang_data: tukangData.length ? JSON.stringify(tukangData) : null,
          },
        });

        await this.createHistory(tx, {
          vendor_registration_id: createdRegistration.id,
          from_status: null,
          to_status: RegistrationStatus.MENUNGGU_APPROVE,
          action: 'REGISTER_SUBMITTED',
          notes: 'Registrasi vendor berhasil disubmit.',
        });

        // AUTO-CREATE AKUN PENDAFTAR (role "Pendaftar Vendor", BUKAN vendor aktif).
        // Akun ini hanya untuk memantau status pendaftaran (dashboard Home & Status).
        const registrantRole = await tx.roles.findFirst({
          where: { name: PENDAFTAR_VENDOR_ROLE },
        });
        if (!registrantRole) {
          throw new Error(
            `Role "${PENDAFTAR_VENDOR_ROLE}" tidak ditemukan. Jalankan migration rekrut vendor.`,
          );
        }

        const registrantUser = await tx.users.create({
          data: {
            username: registrantUsername,
            password: hashSync(registrantPassword, 12),
            role_id: registrantRole.id,
          },
        });

        await tx.vendor_registration.update({
          where: { id: createdRegistration.id },
          data: { user_id: registrantUser.id },
        });

        await this.createHistory(tx, {
          vendor_registration_id: createdRegistration.id,
          from_status: RegistrationStatus.MENUNGGU_APPROVE,
          to_status: RegistrationStatus.MENUNGGU_APPROVE,
          action: 'REGISTRANT_ACCOUNT_CREATED',
          notes: `Akun pendaftar dibuat otomatis (username: ${registrantUsername}).`,
          actor_id: registrantUser.id,
        });

        return createdRegistration;
      });

      try {
        await this.emailQueue.add(
          'send-vendor-submitted-mail',
          {
            to: dto.pic_email || dto.email_address,
            company_name: dto.company_name,
            email_address: dto.email_address,
            pic_email: dto.pic_email,
            phone_number: dto.phone_number,
            pic_phone: dto.pic_phone,
          },
          { attempts: 3 },
        );
      } catch (emailError) {
        console.error('Failed to queue vendor submitted email:', emailError);
      }

      try {
        await this.emailQueue.add(
          'send-registrant-account-mail',
          {
            to: dto.pic_email || dto.email_address,
            company_name: dto.company_name,
            username: registrantUsername,
            password: registrantPassword,
          },
          { attempts: 3 },
        );
      } catch (registrantMailError) {
        console.error('Failed to queue registrant account email:', registrantMailError);
      }

      try {
        await this.notifService.create(
          { vendor_registration: registration },
          'CREATE',
          0,
          moduleTypeNotification.VENDOR_REGISTRATION,
          registration.id,
          RegistrationStatus.MENUNGGU_APPROVE,
        );
      } catch (notificationError) {
        console.error('Failed to create vendor registration notification:', notificationError);
      }

      return {
        message:
          'Pendaftaran berhasil disubmit. Username dan password sementara telah dikirim ke email PIC untuk memantau status pendaftaran.',
        registration_id: registration.id,
      };
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // ADMIN: LIST REGISTRATIONS
  // ================================

  async findAllRegistrations(query: QueryVendorRegistrationDto, userId?: number) {
    try {
      await this.assertAdminHO(userId);

      const {
        page = 1,
        take = 10,
        status,
        search,
        company_name,
        date_from,
        date_to,
      } = query;
      const skip = page * take - take;

      const where: Prisma.vendor_registrationWhereInput = {
        deleted_at: null,
        ...(status ? { status } : {}),
        ...(company_name
          ? { company_name: { contains: company_name } }
          : {}),
        ...(search
          ? {
              OR: [
                { company_name: { contains: search } },
                { pic_name: { contains: search } },
                { email_address: { contains: search } },
                { phone_number: { contains: search } },
              ],
            }
          : {}),
        ...(date_from || date_to
          ? {
              created_at: {
                ...(date_from ? { gte: new Date(date_from) } : {}),
                ...(date_to
                  ? { lte: new Date(`${date_to}T23:59:59.999Z`) }
                  : {}),
              },
            }
          : {}),
      };

      const [registrations, total] = await Promise.all([
        this.dbService.vendor_registration.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: 'desc' },
          include: {
            bank: true,
          },
        }),
        this.dbService.vendor_registration.count({ where }),
      ]);

      // Parse JSON fields
      const formattedRegistrations = registrations.map((reg) =>
        this.formatRegistration(reg),
      );

      return {
        data: formattedRegistrations,
        meta: { total, page, take, skip },
      };
    } catch (error) {
      throw error;
    }
  }

  async findOneRegistration(id: number, userId?: number) {
    try {
      await this.assertAdminHO(userId);

      const registration = await this.dbService.vendor_registration.findFirst({
        where: { id, deleted_at: null },
        include: {
          bank: true,
        },
      });

      if (!registration) {
        throw new NotFoundException(`Pendaftaran dengan ID ${id} tidak ditemukan.`);
      }

      const histories = await (this.dbService as any).vendor_registration_history.findMany({
        where: { vendor_registration_id: id },
        orderBy: { created_at: 'asc' },
      });

      return this.formatRegistration({
        ...registration,
        histories,
        history: histories,
      });
    } catch (error) {
      throw error;
    }
  }

  async getRegistrationHistory(id: number, userId?: number) {
    try {
      await this.assertAdminHO(userId);

      const registration = await this.dbService.vendor_registration.findFirst({
        where: { id, deleted_at: null },
      });

      if (!registration) {
        throw new NotFoundException(`Pendaftaran dengan ID ${id} tidak ditemukan.`);
      }

      const histories = await (this.dbService as any).vendor_registration_history.findMany({
        where: { vendor_registration_id: id },
        orderBy: { created_at: 'asc' },
      });

      return {
        registration_id: id,
        company_name: registration.company_name,
        current_status: registration.status,
        data: histories,
      };
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // ADMIN: APPROVE REGISTRATION
  // ================================

  async approveRegistration(
    id: number,
    dto: ApproveVendorRegistrationDto,
    userId: number,
  ) {
    try {
      await this.assertAdminHO(userId);

      return await this.dbService.$transaction(async (tx) => {
        const registration = await tx.vendor_registration.findFirst({
          where: { id, deleted_at: null },
        });

        if (!registration) {
          throw new NotFoundException(
            'Pendaftaran tidak ditemukan.',
          );
        }

        if (registration.status === RegistrationStatus.MENUNGGU_APPROVE) {
          await tx.vendor_registration.update({
            where: { id },
            data: {
              status: RegistrationStatus.PROSES_PITCHING,
              reviewed_by: userId,
              reviewed_at: new Date(),
              notes: dto.notes,
              updated_by: userId,
              updated_at: new Date(),
            },
          });

          await this.createHistory(tx, {
            vendor_registration_id: id,
            from_status: RegistrationStatus.MENUNGGU_APPROVE,
            to_status: RegistrationStatus.PROSES_PITCHING,
            action: 'START_PITCHING',
            notes: dto.notes || 'Admin HO menyetujui registrasi untuk masuk proses pitching.',
            actor_id: userId,
          });

          await this.emailQueue.add(
            'send-vendor-pitching-mail',
            {
              to: registration.pic_email || registration.email_address,
              company_name: registration.company_name,
            },
            { attempts: 3 },
          );

          return {
            message: 'Pendaftaran berhasil masuk proses pitching.',
            registration_id: id,
            status: RegistrationStatus.PROSES_PITCHING,
          };
        }

        if (registration.status !== RegistrationStatus.PROSES_PITCHING) {
          throw new BadRequestException(
            'Pendaftaran hanya bisa disetujui dari status Menunggu Approve atau Proses Pitching.',
          );
        }

        // Generate credentials
        const slug = registration.company_name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
        const randomStr = randomBytes(4).toString('hex').toUpperCase();
        const generatedPassword = `M1tr${randomStr}@${new Date().getFullYear()}`;
        const hashedPassword = hashSync(generatedPassword, 12);

        // Get vendor owner role
        const role = await tx.roles.findFirst({
          where: { name: { contains: 'owner vendor' } },
        });
        if (!role) {
          throw new Error('Role vendor owner tidak ditemukan.');
        }

        const transitionResult = await tx.vendor_registration.updateMany({
          where: {
            id,
            status: RegistrationStatus.PROSES_PITCHING,
            deleted_at: null,
          },
          data: {
            status: RegistrationStatus.DISETUJUI,
            reviewed_by: userId,
            reviewed_at: new Date(),
            notes: dto.notes,
            updated_by: userId,
            updated_at: new Date(),
          },
        });

        if (transitionResult.count === 0) {
          throw new BadRequestException(
            'Pendaftaran sudah diproses oleh admin lain atau status tidak valid.',
          );
        }

        await this.createHistory(tx, {
          vendor_registration_id: id,
          from_status: RegistrationStatus.PROSES_PITCHING,
          to_status: RegistrationStatus.DISETUJUI,
          action: 'FINAL_APPROVED',
          notes: dto.notes || 'Admin HO menyetujui final setelah proses pitching.',
          actor_id: userId,
        });

        // 1. Reuse akun pendaftar yang dibuat saat registrasi (jika ada):
        //    promote role "Pendaftar Vendor" -> "Owner Vendor" sehingga user yang
        //    sudah login sebagai pendaftar langsung menjadi vendor aktif.
        //    Jika tidak ada (data lama), tetap buat user baru seperti sebelumnya.
        const existingRegistrant = registration.user_id
          ? await tx.users.findFirst({
              where: { id: registration.user_id, deleted_at: null },
            })
          : null;

        let user;
        let generatedUsername = `vendor_${id}_${slug}`;

        if (existingRegistrant) {
          generatedUsername = existingRegistrant.username;
          // Reset password baru (lebih aman) tetapi keep username yang sudah dipakai
          user = await tx.users.update({
            where: { id: existingRegistrant.id },
            data: {
              password: hashedPassword,
              role_id: role.id,
            },
          });

          await this.createHistory(tx, {
            vendor_registration_id: id,
            from_status: RegistrationStatus.DISETUJUI,
            to_status: RegistrationStatus.DISETUJUI,
            action: 'REGISTRANT_PROMOTED',
            notes: `Akun pendaftar (${existingRegistrant.username}) dipromosikan menjadi Owner Vendor.`,
            actor_id: userId,
          });
        } else {
          user = await tx.users.create({
            data: {
              username: generatedUsername,
              password: hashedPassword,
              role_id: role.id,
            },
          });
        }

        // 2. Create vendor record (with max_order from DTO if provided)
        const vendor = await tx.vendor.create({
          data: {
            company_name: registration.company_name,
            address: registration.address,
            phone_number: registration.phone_number,
            email_address: registration.email_address,
            ktp_number: registration.ktp_number,
            npwp_number: registration.npwp_number,
            bank_id: registration.bank_id,
            pic_name: registration.pic_name,
            join_date: new Date(),
            created_by: user.id,
          },
        });

        // 3. Create pic_vendor relation
        await tx.pic_vendor.create({
          data: {
            vendor_id: vendor.id,
            user_id: user.id,
            pic_name: registration.pic_name,
            email_address: registration.pic_email,
          },
        });

        // 4. Create tukang records (if any in tukang_data JSON field)
        let tukangCount = 0;
        if (registration.tukang_data) {
          try {
            const tukangArray = this.parseTukangData(registration.tukang_data, { validate: true });
            if (Array.isArray(tukangArray) && tukangArray.length > 0) {
              for (const [idx, tukang] of tukangArray.entries()) {
                const fullName = tukang.full_name || (tukang as any).nama;
                const phoneNumber = tukang.phone_number || (tukang as any).no_hp;
                const ktpNumber = tukang.ktp_number || (tukang as any).no_ktp;
                const skill = tukang.skill || (tukang as any).keahlian || (tukang as any).service_type_id;
                const serviceTypeId = Number(skill);

                const createdTukang = await tx.tukang.create({
                  data: {
                    full_name: fullName,
                    address: registration.address,
                    phone_number: phoneNumber,
                    ktp_number: ktpNumber,
                    email: `${generatedUsername}_tukang${idx + 1}@temp.local`,
                    bod: new Date('1990-01-01'),
                    created_by: user.id,
                    vendor_id: vendor.id,
                  },
                });

                if (Number.isInteger(serviceTypeId)) {
                  await tx.tukang_service.create({
                    data: {
                      tukang_id: createdTukang.id,
                      service_type_id: serviceTypeId,
                      created_by: user.id,
                    },
                  });
                }
                tukangCount++;
              }
            }
          } catch (e) {
            // tukang_data invalid JSON, skip tukang creation
          }
        }

        const serviceTypeIds = this.parseIntJsonArray(registration.service_types);
        for (const serviceTypeId of serviceTypeIds) {
          await tx.vendor_service.create({
            data: {
              vendor_id: vendor.id,
              service_type_id: serviceTypeId,
              created_by: user.id,
            },
          });
        }

        const areaIds = this.parseIntJsonArray(registration.areas);
        for (const areaId of areaIds) {
          await tx.vendor_area.create({
            data: {
              vendor_id: vendor.id,
              area_id: areaId,
              created_by: user.id,
            },
          });
        }

        const storeIds = Array.isArray(dto.vendor_store)
          ? dto.vendor_store.filter((id) => Number.isInteger(id))
          : [];
        for (const storeId of storeIds) {
          await tx.vendor_store.create({
            data: {
              vendor_id: vendor.id,
              store_id: storeId,
              created_by: user.id,
            },
          });
        }

        if (Number.isInteger(dto.max_order) && dto.max_order! > 0) {
          await tx.vendor.update({
            where: { id: vendor.id },
            data: { max_order: dto.max_order },
          });
        }

        const approvalRecipient =
          registration.pic_email || registration.email_address;

        await this.emailQueue.add(
          'send-vendor-approval-mail',
          {
            to: approvalRecipient,
            company_name: registration.company_name,
            username: generatedUsername,
            password: generatedPassword,
          },
          { attempts: 3 },
        );

        return {
          message: 'Pendaftaran berhasil disetujui. Vendor dapat login dengan kredensial yang dikirim via email.',
          registration_id: id,
          status: RegistrationStatus.DISETUJUI,
          vendor_username: generatedUsername,
          tukang_count: tukangCount,
        };
      });
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // ADMIN: REJECT REGISTRATION
  // ================================

  async rejectRegistration(
    id: number,
    dto: RejectVendorRegistrationDto,
    userId: number,
  ) {
    try {
      await this.assertAdminHO(userId);

      const registration = await this.dbService.$transaction(async (tx) => {
        const currentRegistration = await tx.vendor_registration.findFirst({
          where: {
            id,
            deleted_at: null,
            status: {
              in: [
                RegistrationStatus.MENUNGGU_APPROVE,
                RegistrationStatus.PROSES_PITCHING,
              ],
            },
          },
        });

        if (!currentRegistration) {
          throw new NotFoundException(
            'Pendaftaran tidak ditemukan atau sudah diproses.',
          );
        }

        await tx.vendor_registration.update({
          where: { id },
          data: {
            status: RegistrationStatus.DITOLAK,
            rejection_reason: dto.rejection_reason,
            reviewed_by: userId,
            reviewed_at: new Date(),
            rejected_at: new Date(),
            notes: dto.notes,
            updated_by: userId,
            updated_at: new Date(),
          },
        });

        await this.createHistory(tx, {
          vendor_registration_id: id,
          from_status: currentRegistration.status,
          to_status: RegistrationStatus.DITOLAK,
          action: 'REJECTED',
          notes: dto.rejection_reason || dto.notes || 'Pendaftaran vendor ditolak.',
          actor_id: userId,
        });

        await tx.vendor_registration_token.updateMany({
          where: {
            registration_id: id,
            status: { not: 2 },
          },
          data: {
            status: 3,
          },
        });

        return currentRegistration;
      });

      const rejectionRecipient =
        registration.pic_email || registration.email_address;

      await this.emailQueue.add(
        'send-vendor-rejection-mail',
        {
          to: rejectionRecipient,
          company_name: registration.company_name,
          rejection_reason: dto.rejection_reason,
          reapply_date: this.formatCooldownDate(this.getRejectedCooldownUntil(new Date())),
        },
        { attempts: 3 },
      );

      return {
        message: 'Pendaftaran berhasil ditolak.',
        registration_id: id,
      };
    } catch (error) {
      throw error;
    }
  }

  @Cron('15 * * * *')
  async deleteRejectedRegistrationDocuments() {
    if ((process.env.NODE_APP_INSTANCE ?? '0') !== '0') return;

    const cutoff = new Date();
    cutoff.setHours(
      cutoff.getHours() - this.rejectedDocumentRetentionHours,
    );

    const registrations =
      await this.dbService.vendor_registration.findMany({
        where: {
          status: RegistrationStatus.DITOLAK,
          deleted_at: null,
          documents_deleted_at: null,
          rejected_at: {
            lte: cutoff,
          },
        },
        select: {
          id: true,
          documents: true,
          vendor_photo: true,
          ktp_photo: true,
          npwp_photo: true,
          compro_photo: true,
          surat_permohonan_photo: true,
          pks_photo: true,
          siup_photo: true,
        },
        orderBy: { rejected_at: 'asc' },
        take: 100,
      });

    let deletedCount = 0;
    for (const registration of registrations) {
      try {
        const documentPaths =
          this.getRegistrationDocumentPaths(registration);
        // documentPaths.forEach((path) => this.deleteUploadedFile(path));

        await this.dbService.$transaction(async (tx) => {
          await tx.vendor_registration.update({
            where: { id: registration.id },
            data: {
              documents: null,
              vendor_photo: null,
              ktp_photo: null,
              npwp_photo: null,
              compro_photo: null,
              surat_permohonan_photo: null,
              pks_photo: null,
              siup_photo: null,
              documents_deleted_at: new Date(),
              updated_at: new Date(),
            },
          });

          await this.createHistory(tx, {
            vendor_registration_id: registration.id,
            from_status: RegistrationStatus.DITOLAK,
            to_status: RegistrationStatus.DITOLAK,
            action: 'REJECTED_DOCUMENTS_DELETED',
            notes:
              'Dokumen pendaftaran dihapus permanen setelah masa retensi.',
          });
        });

        deletedCount += 1;
      } catch (error) {
        this.logger.error(
          `Failed to delete documents for rejected registration ${registration.id}.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (deletedCount) {
      this.logger.log(
        `Deleted documents for ${deletedCount} rejected vendor registration(s).`,
      );
    }
  }

  @Cron('30 2 * * *')
  async anonymizeRejectedRegistrations() {
    if ((process.env.NODE_APP_INSTANCE ?? '0') !== '0') return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.rejectedCooldownDays);

    const registrations = await this.dbService.vendor_registration.findMany({
      where: {
        status: RegistrationStatus.DITOLAK,
        deleted_at: null,
        anonymized_at: null,
        documents_deleted_at: { not: null },
        rejected_at: {
          lte: cutoff,
        },
      },
      select: { id: true },
      take: 100,
    });

    for (const registration of registrations) {
      await this.dbService.vendor_registration.update({
        where: { id: registration.id },
        data: {
          company_name: `ANONYMIZED_VENDOR_${registration.id}`,
          address: 'ANONYMIZED',
          phone_number: `ANONYMIZED_${registration.id}`,
          email_address: `anonymized_${registration.id}@pdp.local`,
          pic_name: 'ANONYMIZED',
          pic_email: `anonymized_pic_${registration.id}@pdp.local`,
          pic_phone: `ANONYMIZED_${registration.id}`,
          ktp_number: null,
          npwp_number: null,
          bank_id: null,
          service_types: null,
          areas: null,
          notes: null,
          tukang_data: null,
          rejection_reason: 'Data pribadi dianonimkan setelah masa retensi.',
          anonymized_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    if (registrations.length) {
      this.logger.log(`Anonymized ${registrations.length} rejected vendor registration(s).`);
    }
  }

  async deleteRegistration(id: number, userId: number) {
    try {
      await this.assertAdminHO(userId);

      return await this.dbService.$transaction(async (tx) => {
        const registration = await tx.vendor_registration.findFirst({
          where: { id, deleted_at: null },
        });

        if (!registration) {
          throw new NotFoundException(
            `Pendaftaran dengan ID ${id} tidak ditemukan.`,
          );
        }

        await (tx as any).vendor_registration_history.deleteMany({
          where: { vendor_registration_id: id },
        });

        await tx.vendor_registration_token.deleteMany({
          where: { registration_id: id },
        });

        await tx.vendor_registration.delete({
          where: { id },
        });

        return {
          message: 'Pendaftaran vendor berhasil dihapus permanen.',
          registration_id: id,
        };
      });
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // GET REGISTRATION STATISTICS
  // ================================

  async getRegistrationStats(userId?: number) {
    try {
      await this.assertAdminHO(userId);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [menungguApprove, prosesPitching, disetujui, ditolak, totalThisMonth] = await Promise.all([
        this.dbService.vendor_registration.count({
          where: { status: RegistrationStatus.MENUNGGU_APPROVE, deleted_at: null },
        }),
        this.dbService.vendor_registration.count({
          where: { status: RegistrationStatus.PROSES_PITCHING, deleted_at: null },
        }),
        this.dbService.vendor_registration.count({
          where: { status: RegistrationStatus.DISETUJUI, deleted_at: null },
        }),
        this.dbService.vendor_registration.count({
          where: { status: RegistrationStatus.DITOLAK, deleted_at: null },
        }),
        this.dbService.vendor_registration.count({
          where: {
            created_at: { gte: startOfMonth },
            deleted_at: null,
          },
        }),
      ]);

      return {
        menunggu_approve: menungguApprove,
        proses_pitching: prosesPitching,
        disetujui,
        ditolak,
        pending: menungguApprove,
        approved: disetujui,
        rejected: ditolak,
        total_this_month: totalThisMonth,
      };
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // TERMS & CONDITIONS (Syarat & Ketentuan)
  // ================================

  // [PUBLIC] Ambil T&C aktif untuk ditampilkan read-only di halaman login/pendaftar.
  async getActiveTermsAndConditions() {
    const terms = await this.dbService.vendor_terms_and_conditions.findFirst({
      where: { is_active: true, deleted_at: null },
    });

    if (!terms) {
      throw new NotFoundException(
        'Dokumen Syarat & Ketentuan belum tersedia. Silakan hubungi Admin Mitra10.',
      );
    }

    return {
      id: terms.id,
      title: terms.title,
      document_type: terms.document_type, // HTML | PDF
      // Konten HTML hanya dikirim untuk tipe HTML. Tipe PDF: konten dilayani
      // terpisah via GET /terms-and-conditions/file (streaming read-only).
      content: terms.document_type === 'HTML' ? terms.content : null,
      version: terms.version,
      updated_at: terms.updated_at ?? terms.created_at,
    };
  }

  // [ADMIN HO / SUPER USER] Riwayat semua versi T&C (untuk halaman setting).
  async listTermsAndConditions(userId: number) {
    await this.assertAdminHOOrSuperUser(userId);

    const termsList = await this.dbService.vendor_terms_and_conditions.findMany({
      where: { deleted_at: null },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        title: true,
        version: true,
        is_active: true,
        document_type: true,
        created_at: true,
        updated_at: true,
      },
    });

    return { data: termsList, total: termsList.length };
  }

  // [ADMIN HO / SUPER USER] Detail satu versi T&C by id (untuk form edit versi arsip).
  async getTermsVersionById(id: number, userId: number) {
    await this.assertAdminHOOrSuperUser(userId);

    const terms = await this.dbService.vendor_terms_and_conditions.findFirst({
      where: { id, deleted_at: null },
    });

    if (!terms) {
      throw new NotFoundException(`Versi Syarat & Ketentuan dengan ID ${id} tidak ditemukan.`);
    }

    return {
      id: terms.id,
      title: terms.title,
      document_type: terms.document_type,
      content: terms.document_type === 'HTML' ? terms.content : null,
      file_path: terms.file_path,
      version: terms.version,
      is_active: terms.is_active,
      created_at: terms.created_at,
      updated_at: terms.updated_at,
    };
  }

  // [ADMIN HO / SUPER USER] Update isi T&C tanpa redeploy. Mendukung HTML (Quill)
  // maupun PDF (upload file). Single-active: versi baru otomatis jadi SATU-satunya
  // versi aktif (versi lama dinonaktifkan dalam transaction yang sama).
  async updateTermsAndConditions(
    dto: UpdateTermsAndConditionsDto,
    userId: number,
    file?: Express.Multer.File,
  ) {
    await this.assertAdminHOOrSuperUser(userId);

    const documentType = dto.document_type === 'PDF' ? 'PDF' : 'HTML';

    // Validasi per tipe dokumen
    if (documentType === 'PDF') {
      if (!file) {
        throw new BadRequestException(
          'File PDF wajib diunggah untuk dokumen tipe PDF.',
        );
      }
      if (!file.mimetype || file.mimetype !== 'application/pdf') {
        throw new BadRequestException('File harus berformat PDF (application/pdf).');
      }
    } else {
      const plainContent = (dto.content ?? '').replace(/<[^>]*>/g, '').trim();
      if (!plainContent) {
        throw new BadRequestException(
          'Konten T&C (HTML) wajib diisi untuk dokumen tipe HTML.',
        );
      }
    }

    let pdfPath: string | null = null;
    if (documentType === 'PDF' && file) {
      pdfPath = this.saveTermsFile(file);
    }

    const created = await this.dbService.$transaction(async (tx) => {
      const current = await tx.vendor_terms_and_conditions.findFirst({
        where: { is_active: true, deleted_at: null },
      });

      // Single-active: nonaktifkan SEMUA versi aktif dalam transaction yang sama.
      if (current) {
        await tx.vendor_terms_and_conditions.updateMany({
          where: { is_active: true, deleted_at: null },
          data: {
            is_active: false,
            updated_at: new Date(),
            updated_by: userId,
          },
        });
      }

      return tx.vendor_terms_and_conditions.create({
        data: {
          title: dto.title.trim(),
          content: documentType === 'HTML' ? dto.content ?? '' : '',
          document_type: documentType,
          file_path: pdfPath,
          version: (current?.version ?? 0) + 1,
          is_active: true,
          created_by: userId,
        },
      });
    });

    return {
      message: 'Syarat & Ketentuan berhasil diperbarui.',
      id: created.id,
      version: created.version,
      document_type: created.document_type,
    };
  }

  // [ADMIN HO / SUPER USER] Aktivasi satu versi T&C.
  // Single-active: semua versi lain otomatis dinonaktifkan dalam transaction.
  async activateTermsVersion(id: number, userId: number) {
    await this.assertAdminHOOrSuperUser(userId);

    return this.dbService.$transaction(async (tx) => {
      const terms = await tx.vendor_terms_and_conditions.findFirst({
        where: { id, deleted_at: null },
      });

      if (!terms) {
        throw new NotFoundException(
          `Versi Syarat & Ketentuan dengan ID ${id} tidak ditemukan.`,
        );
      }

      if (terms.is_active) {
        throw new BadRequestException(
          `Versi v${terms.version} sudah aktif. Hanya satu versi yang boleh aktif.`,
        );
      }

      await tx.vendor_terms_and_conditions.updateMany({
        where: { is_active: true, deleted_at: null },
        data: {
          is_active: false,
          updated_at: new Date(),
          updated_by: userId,
        },
      });

      await tx.vendor_terms_and_conditions.update({
        where: { id },
        data: {
          is_active: true,
          updated_at: new Date(),
          updated_by: userId,
        },
      });

      return {
        message: `Versi v${terms.version} berhasil diaktifkan (versi lain dinonaktifkan).`,
        id,
        version: terms.version,
      };
    });
  }

  // [ADMIN HO / SUPER USER] Nonaktifkan versi T&C.
  // Validasi: tidak boleh menonaktifkan jika ini SATU-satunya versi aktif
  // (harus selalu ada minimal 1 T&C aktif untuk halaman login/pendaftar).
  async deactivateTermsVersion(id: number, userId: number) {
    await this.assertAdminHOOrSuperUser(userId);

    return this.dbService.$transaction(async (tx) => {
      const terms = await tx.vendor_terms_and_conditions.findFirst({
        where: { id, deleted_at: null },
      });

      if (!terms) {
        throw new NotFoundException(
          `Versi Syarat & Ketentuan dengan ID ${id} tidak ditemukan.`,
        );
      }

      if (!terms.is_active) {
        throw new BadRequestException(`Versi v${terms.version} memang sudah tidak aktif.`);
      }

      // Validasi single-active invariant: minimal 1 harus tetap aktif.
      const activeCount = await tx.vendor_terms_and_conditions.count({
        where: { is_active: true, deleted_at: null },
      });

      if (activeCount <= 1) {
        throw new BadRequestException(
          'Tidak bisa menonaktifkan satu-satunya T&C aktif. Aktifkan versi lain terlebih dahulu.',
        );
      }

      await tx.vendor_terms_and_conditions.update({
        where: { id },
        data: {
          is_active: false,
          updated_at: new Date(),
          updated_by: userId,
        },
      });

      return {
        message: `Versi v${terms.version} berhasil dinonaktifkan.`,
        id,
        version: terms.version,
      };
    });
  }

  // [PUBLIC] Path absolut file PDF T&C aktif (untuk controller streaming read-only).
  // Dipanggil controller -> validasi file -> stream ke response TANPA Content-Disposition
  // attachment (browser tidak menawarkan download; viewer inline saja).
  async getActiveTermsPdfPath(): Promise<{ title: string; absolutePath: string } | null> {
    const terms = await this.dbService.vendor_terms_and_conditions.findFirst({
      where: { is_active: true, deleted_at: null, document_type: 'PDF' },
    });

    if (!terms?.file_path) return null;

    const absolutePath = this.resolveTermsFilePath(terms.file_path);
    return { title: terms.title, absolutePath };
  }

  // Simpan file PDF T&C ke folder storage (pattern sama dengan saveFile vendor docs).
  private saveTermsFile(file: Express.Multer.File): string {
    const uploadDir = resolveUploadPath('terms');
    const fileName = `terms-${Date.now()}.pdf`;
    const filePath = join(uploadDir, fileName);
    writeFileSync(filePath, file.buffer as any);
    return `uploads/terms/${fileName}`;
  }

  // Resolve path relatif -> absolut dengan guard path traversal.
  private resolveTermsFilePath(storedPath: string): string {
    const uploadRoot = resolveUploadPath();
    const normalized = storedPath.replace(/^[/\\]+/, '').replace(/^uploads[/\\]/, '');
    const absolutePath = resolve(uploadRoot, normalized);
    const relativePath = relative(uploadRoot, absolutePath);

    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new BadRequestException('Path file T&C tidak valid.');
    }

    return absolutePath;
  }

  // ================================
  // REGISTRANT (PENDAFTAR) DASHBOARD
  // ================================

  // [REGISTRANT] Daftar pendaftaran milik user yang login (ownership via user_id).
  async findMyRegistrations(userId: number) {
    await this.assertRegistrant(userId);

    const registrations = await this.dbService.vendor_registration.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });

    return {
      data: registrations.map((reg) => ({
        id: reg.id,
        company_name: reg.company_name,
        pic_name: reg.pic_name,
        pic_email: reg.pic_email,
        pic_phone: reg.pic_phone,
        status: reg.status,
        rejection_reason: reg.rejection_reason,
        created_at: reg.created_at,
        updated_at: reg.updated_at,
      })),
      total: registrations.length,
    };
  }

  // [REGISTRANT] Info profil ringkas untuk header dashboard pendaftar.
  async getMyRegistrantProfile(userId: number) {
    await this.assertRegistrant(userId);

    const user = await this.dbService.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: {
        id: true,
        username: true,
        vendor_registrations: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: 1,
          select: {
            id: true,
            company_name: true,
            pic_name: true,
            pic_email: true,
            status: true,
          },
        },
      },
    });

    return {
      user_id: user?.id,
      username: user?.username,
      registration: user?.vendor_registrations?.[0] ?? null,
    };
  }

  // [REGISTRANT] Home content statis (placeholder banner, konten hardcode V1).
  // Rekomendasi improvement: pindahkan konten ke CMS/DB bila perlu update dinamis.
  getRegistrantHomeContent() {
    return {
      title: 'Bergabung & Tumbuh Bersama Mitra10',
      intro:
        'Menjadi bagian dari jaringan Vendor Instalasi Mitra10 dan dapatkan berbagai kesempatan untuk mengembangkan bisnis, meningkatkan kompetensi, serta memperluas peluang pekerjaan bersama Mitra10.',
      subtitle: 'Kenapa Bergabung Menjadi Vendor Mitra10?',
      sub_intro:
        'Dapatkan lebih dari sekadar order. Bergabung bersama jaringan Vendor Instalasi Mitra10 untuk mendapatkan peluang pekerjaan, meningkatkan kompetensi, dan mengembangkan bisnis Anda.',
      benefits: [
        {
          icon: 'briefcase',
          title: 'Peluang Order',
          description: 'Kesempatan mendapatkan pekerjaan instalasi sesuai area dan kompetensi.',
        },
        {
          icon: 'graduation-cap',
          title: 'Pelatihan & Product Knowledge',
          description: 'Edukasi produk, standar instalasi, dan peningkatan kompetensi.',
        },
        {
          icon: 'book-open',
          title: 'Akses Katalog & Informasi Produk',
          description: 'Informasi produk dan kebutuhan layanan instalasi Mitra10.',
        },
        {
          icon: 'gift',
          title: 'Benefit Program Mitra',
          description: 'Kesempatan mendapatkan program dan benefit khusus sesuai ketentuan.',
        },
        {
          icon: 'chart-line',
          title: 'Monitoring Digital',
          description: 'Kelola dan pantau pekerjaan melalui sistem.',
        },
        {
          icon: 'handshake',
          title: 'Kembangkan Bisnis',
          description: 'Perluas jaringan dan peluang pekerjaan bersama Mitra10.',
        },
        // PLACEHOLDER: 6 benefit di atas sesuai konten yang diberikan (hardcode V1).
      ],
      // PLACEHOLDER BANNER: perlu diganti dengan aset banner asli dari tim Mitra10.
      banner_image: null,
    };
  }
}
