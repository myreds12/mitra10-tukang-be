/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  RegisterVendorDto,
  QueryVendorRegistrationDto,
  ApproveVendorRegistrationDto,
  RejectVendorRegistrationDto,
  CreateUserFromTokenDto,
  TukangRegistrationDto,
} from './dto/vendor-registration.dto';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashSync } from 'bcrypt';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { RegistrationStatus } from './enums/registration-status.enum';

@Injectable()
export class VendorRegistrationService {
  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  // ================================
  // PUBLIC: VENDOR REGISTRATION
  // ================================

  private saveFile(file: Express.Multer.File, subFolder: string = 'vendor'): string {
    try {
      const uploadDir = join(process.cwd(), 'uploads', subFolder);
      if (!existsSync(uploadDir)) {
        mkdirSync(uploadDir, { recursive: true });
      }

      const fileName = `${Date.now()}-${file.originalname}`;
      const filePath = join(uploadDir, fileName);
      writeFileSync(filePath, file.buffer as any);

      return `uploads/${subFolder}/${fileName}`;
    } catch (error) {
      console.error('Error saving file:', error);
      return '';
    }
  }

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

  async registerVendor(dto: RegisterVendorDto, files?: any) {
    try {
      if (!dto.pdp_consent) {
        throw new BadRequestException(
          'Persetujuan pemrosesan data pribadi sesuai UU PDP wajib disetujui.',
        );
      }

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

        return createdRegistration;
      });

      return {
        message: 'Pendaftaran berhasil submitted. Mohon tunggu konfirmasi dari admin HO.',
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

      const { page = 1, take = 10, status, search, date_from, date_to } = query;
      const skip = page * take - take;

      const where: Prisma.vendor_registrationWhereInput = {
        deleted_at: null,
        ...(status ? { status } : {}),
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
        ...(date_from && date_to
          ? {
              created_at: {
                gte: new Date(date_from),
                lte: new Date(`${date_to}T23:59:59.000Z`),
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
        const generatedUsername = `vendor_${id}_${slug}`;
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

        await tx.vendor_registration.update({
          where: { id },
          data: {
            status: RegistrationStatus.DISETUJUI,
            reviewed_by: userId,
            reviewed_at: new Date(),
            notes: dto.notes,
            updated_by: userId,
            updated_at: new Date(),
          },
        });

        await this.createHistory(tx, {
          vendor_registration_id: id,
          from_status: RegistrationStatus.PROSES_PITCHING,
          to_status: RegistrationStatus.DISETUJUI,
          action: 'FINAL_APPROVED',
          notes: dto.notes || 'Admin HO menyetujui final setelah proses pitching.',
          actor_id: userId,
        });

        // 1. Create user immediately with bcrypt-hashed password
        const user = await tx.users.create({
          data: {
            username: generatedUsername,
            password: hashedPassword,
            role_id: role.id,
          },
        });

        const credentialToken = randomBytes(32).toString('hex');
        const credentialExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await tx.vendor_registration_token.upsert({
          where: { registration_id: id },
          create: {
            registration_id: id,
            token: credentialToken,
            expires_at: credentialExpiresAt,
            user_id: user.id,
          },
          update: {
            token: credentialToken,
            expires_at: credentialExpiresAt,
            status: 1,
            user_id: user.id,
          },
        });

        // 2. Create vendor record
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

        // 5. Queue email notification with credentials
        await this.emailQueue.add(
          'send-vendor-approval-mail',
          {
            to: registration.pic_email,
            company_name: registration.company_name,
            token: credentialToken,
            expires_hours: 48,
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

        return currentRegistration;
      });

      // Send rejection email
      await this.emailQueue.add(
        'send-vendor-rejection-mail',
        {
          to: registration.pic_email,
          company_name: registration.company_name,
          rejection_reason: dto.rejection_reason,
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
  // PUBLIC: VALIDATE TOKEN
  // ================================

  async validateToken(token: string) {
    try {
      const tokenData = await this.dbService.vendor_registration_token.findFirst({
        where: { token },
        include: { registration: true },
      });

      if (!tokenData) {
        throw new BadRequestException('Token tidak ditemukan atau tidak valid.');
      }

      if (tokenData.status === 2) {
        throw new BadRequestException('Token sudah pernah digunakan.');
      }

      if (tokenData.expires_at < new Date()) {
        throw new BadRequestException('Token sudah kadaluarsa.');
      }

      if (tokenData.status !== 1) {
        throw new BadRequestException('Token tidak dapat digunakan.');
      }

      return {
        valid: true,
        registration_id: tokenData.registration_id,
        company_name: tokenData.registration.company_name,
        expires_at: tokenData.expires_at,
      };
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // PUBLIC: CREATE USER FROM TOKEN
  // ================================

  async createUserFromToken(token: string, dto: CreateUserFromTokenDto) {
    try {
      return await this.dbService.$transaction(async (tx) => {
        const tokenData = await tx.vendor_registration_token.findFirst({
          where: {
            token,
            status: 1, // ACTIVE
            expires_at: { gte: new Date() },
          },
          include: {
            registration: true,
          },
        });

        if (!tokenData) {
          throw new BadRequestException(
            'Token tidak valid atau sudah kadaluarsa.',
          );
        }

        // Check if user already exists
        const existingUser = await tx.users.findFirst({
          where: { username: dto.username },
        });

        if (existingUser) {
          throw new BadRequestException('Username sudah digunakan.');
        }

        // Get vendor owner role
        const role = await tx.roles.findFirst({
          where: { name: { contains: 'owner vendor' } },
        });

        if (!role) {
          throw new BadRequestException('Role vendor tidak ditemukan.');
        }

        // Create user
        const user = await tx.users.create({
          data: {
            username: dto.username,
            password: hashSync(dto.password, 12),
            role_id: role.id,
          },
        });

        // Create vendor from registration
        const vendor = await tx.vendor.create({
          data: {
            company_name: tokenData.registration.company_name,
            address: tokenData.registration.address,
            phone_number: tokenData.registration.phone_number,
            email_address: tokenData.registration.email_address,
            ktp_number: tokenData.registration.ktp_number,
            npwp_number: tokenData.registration.npwp_number,
            bank_id: tokenData.registration.bank_id,
            pic_name: tokenData.registration.pic_name,
            join_date: new Date(),
            created_by: user.id,
          },
        });

        // Create pic_vendor relation
        await tx.pic_vendor.create({
          data: {
            vendor_id: vendor.id,
            user_id: user.id,
            pic_name: tokenData.registration.pic_name,
            email_address: tokenData.registration.pic_email,
          },
        });

        // Update token status
        await tx.vendor_registration_token.update({
          where: { id: tokenData.id },
          data: {
            status: 2, // USED
            user_id: user.id,
          },
        });

        return {
          message: 'Akun berhasil dibuat. Silakan login.',
          vendor_id: vendor.id,
          user_id: user.id,
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
}
