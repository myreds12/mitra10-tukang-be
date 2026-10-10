/* eslint-disable prettier/prettier */
import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { hashSync } from 'bcrypt';
import { RegistrationStatus } from './enums/registration-status.enum';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  RegisterVendorDto,
  QueryVendorRegistrationDto,
  ApproveVendorRegistrationDto,
  RejectVendorRegistrationDto,
  UpdateTermsAndConditionsDto,
} from './dto/vendor-registration.dto';
import { NotificationsService } from 'src/notifications/notifications.service';
import { moduleTypeNotification } from 'src/notifications/dto/notification-module-type.enum';
import { VendorRegistrationValidationService } from './vendor-registration-validation.service';
import { VendorTermsService } from './vendor-terms.service';
import { VendorRegistrationQueryService } from './vendor-registration-query.service';
import { VendorRegistrationApprovalService } from './vendor-registration-approval.service';
import { PENDAFTAR_VENDOR_ROLE } from './vendor-registration.constants';

@Injectable()
export class VendorRegistrationService {
  private readonly logger = new Logger(VendorRegistrationService.name);

  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly notifService: NotificationsService,
    private readonly validationService: VendorRegistrationValidationService,
    private readonly termsService: VendorTermsService,
    private readonly queryService: VendorRegistrationQueryService,
    private readonly approvalService: VendorRegistrationApprovalService,
  ) {}

  // Helper delegations
  saveFile(file: Express.Multer.File, subFolder: string = 'vendor'): string {
    return this.validationService.saveFile(file, subFolder);
  }

  getRegistrationDocumentPaths(registration: any): string[] {
    return this.validationService.getRegistrationDocumentPaths(registration);
  }

  parseTukangData(data?: any, options?: any) {
    return this.validationService.parseTukangData(data, options);
  }

  parseIntJsonArray(value?: any) {
    return this.validationService.parseIntJsonArray(value);
  }

  formatRegistration(registration: any) {
    return this.validationService.formatRegistration(registration);
  }

  getRejectedCooldownUntil(rejectedAt: Date) {
    return this.validationService.getRejectedCooldownUntil(rejectedAt);
  }

  formatCooldownDate(date: Date) {
    return this.validationService.formatCooldownDate(date);
  }

  assertRejectedCooldown(dto: RegisterVendorDto) {
    return this.validationService.assertRejectedCooldown(dto);
  }

  getRoleName(userId?: number): Promise<string | null> {
    return this.validationService.getRoleName(userId);
  }

  assertAdminHOOrSuperUser(userId?: number) {
    return this.validationService.assertAdminHOOrSuperUser(userId);
  }

  assertAdminHO(userId?: number) {
    return this.validationService.assertAdminHO(userId);
  }

  assertRegistrant(userId?: number) {
    return this.validationService.assertRegistrant(userId);
  }

  buildRegistrantUsername(registration: any) {
    return this.validationService.buildRegistrantUsername(registration);
  }

  assertRegistrantAccess(userId?: number) {
    return this.validationService.assertRegistrantAccess(userId);
  }

  getPhoneVariants(phone: string) {
    return this.validationService.getPhoneVariants(phone);
  }

  createHistory(tx: any, data: any) {
    return this.validationService.createHistory(tx, data);
  }

  checkUnique(
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
  ) {
    return this.validationService.checkUnique(type, value);
  }

  // Core Registration
  async registerVendor(dto: RegisterVendorDto, files?: any) {
    try {
      if (!dto.pdp_consent) {
        throw new BadRequestException(
          'Persetujuan pemrosesan data pribadi sesuai UU PDP wajib disetujui.',
        );
      }

      await this.assertRejectedCooldown(dto);

      // 1. Validasi Nama Perusahaan wajib diisi & belum terdaftar
      if (!dto.company_name || !dto.company_name.trim()) {
        throw new BadRequestException('Nama Perusahaan wajib diisi.');
      }
      const companyCheck = await this.checkUnique('company_name', dto.company_name);
      if (companyCheck.is_registered) {
        throw new BadRequestException(companyCheck.message || 'Nama Perusahaan sudah terdaftar.');
      }

      // 2. Validasi Email Perusahaan wajib diisi & belum terdaftar
      if (!dto.email_address || !dto.email_address.trim()) {
        throw new BadRequestException('Email Perusahaan wajib diisi.');
      }
      const emailCheck = await this.checkUnique('email', dto.email_address);
      if (emailCheck.is_registered) {
        throw new BadRequestException(emailCheck.message || 'Email Perusahaan sudah terdaftar.');
      }

      // 3. Validasi Telepon Perusahaan wajib diisi & belum terdaftar
      if (!dto.phone_number || !dto.phone_number.trim()) {
        throw new BadRequestException('Nomor Telepon Perusahaan wajib diisi.');
      }
      const phoneCheck = await this.checkUnique('phone', dto.phone_number);
      if (phoneCheck.is_registered) {
        throw new BadRequestException(phoneCheck.message || 'Nomor Telepon Perusahaan sudah terdaftar.');
      }

      // 4. Validasi NPWP Perusahaan jika diisi belum terdaftar
      if (dto.npwp_number && dto.npwp_number.trim()) {
        const npwpCheck = await this.checkUnique('npwp', dto.npwp_number);
        if (npwpCheck.is_registered) {
          throw new BadRequestException(npwpCheck.message || 'No NPWP sudah terdaftar.');
        }
      }

      // 5. Nama PIC wajib diisi (nama pic boleh sama, tidak dicek keunikan)
      if (!dto.pic_name || !dto.pic_name.trim()) {
        throw new BadRequestException('Nama PIC wajib diisi.');
      }

      // 6. Validasi Telepon PIC wajib diisi & belum terdaftar
      if (!dto.pic_phone || !dto.pic_phone.trim()) {
        throw new BadRequestException('Nomor HP PIC wajib diisi.');
      }
      const picPhoneCheck = await this.checkUnique('phone', dto.pic_phone);
      if (picPhoneCheck.is_registered) {
        throw new BadRequestException(picPhoneCheck.message || 'Nomor HP PIC sudah terdaftar.');
      }

      // 7. Validasi Email PIC wajib diisi & belum terdaftar
      if (!dto.pic_email || !dto.pic_email.trim()) {
        throw new BadRequestException('Email PIC wajib diisi.');
      }
      const picEmailCheck = await this.checkUnique('email', dto.pic_email);
      if (picEmailCheck.is_registered) {
        throw new BadRequestException(picEmailCheck.message || 'Email PIC sudah terdaftar.');
      }

      // 8. Validasi KTP PIC wajib diisi dan belum terdaftar
      if (!dto.ktp_number || !dto.ktp_number.trim()) {
        throw new BadRequestException('Nomor KTP PIC wajib diisi.');
      }
      const ktpPicCheck = await this.checkUnique('ktp_pic', dto.ktp_number);
      if (ktpPicCheck.is_registered) {
        throw new BadRequestException(ktpPicCheck.message || 'KTP Sudah terdaftar.');
      }

      // 9. Validasi duplikasi internal antar email & telepon perusahaan vs PIC
      if (dto.email_address.trim().toLowerCase() === dto.pic_email.trim().toLowerCase()) {
        throw new BadRequestException('Email Perusahaan dan Email PIC tidak boleh sama.');
      }
      const compPhoneDigits = dto.phone_number.replace(/\D/g, '');
      const picPhoneDigits = dto.pic_phone.replace(/\D/g, '');
      if (compPhoneDigits && picPhoneDigits && compPhoneDigits === picPhoneDigits) {
        throw new BadRequestException('Nomor Telepon Perusahaan dan Nomor HP PIC tidak boleh sama.');
      }

      // 10. Validasi Tukang: nama boleh sama, KTP & HP TIDAK boleh sama
      const tukangData = this.parseTukangData(dto.tukang_data, { validate: true });
      const seenTukangKtps = new Set<string>();
      const seenTukangPhones = new Set<string>();

      for (const [idx, t] of tukangData.entries()) {
        const tKtp = (t.ktp_number || (t as any).no_ktp || '').trim();
        if (tKtp) {
          const key = tKtp.replace(/\D/g, '') || tKtp;
          if (seenTukangKtps.has(key)) {
            throw new BadRequestException(`No KTP tukang (${tKtp}) pada baris ke-${idx + 1} duplikat.`);
          }
          seenTukangKtps.add(key);

          const tukangKtpCheck = await this.checkUnique('ktp_tukang', tKtp);
          if (tukangKtpCheck.is_registered) {
            throw new BadRequestException(`No KTP tukang (${tKtp}) sudah terdaftar.`);
          }
        }

        const tPhone = (t.phone_number || (t as any).no_hp || '').trim();
        if (tPhone) {
          const phoneKey = tPhone.replace(/\D/g, '') || tPhone;
          if (seenTukangPhones.has(phoneKey)) {
            throw new BadRequestException(`No HP tukang (${tPhone}) pada baris ke-${idx + 1} duplikat.`);
          }
          seenTukangPhones.add(phoneKey);

          const tukangPhoneCheck = await this.checkUnique('phone', tPhone);
          if (tukangPhoneCheck.is_registered) {
            throw new BadRequestException(`No HP tukang (${tPhone}) sudah terdaftar.`);
          }
        }
      }

      // Idempotensi username akun pendaftar (username = email pendaftar utuh termasuk @)
      const registrantUsername = this.buildRegistrantUsername(dto);
      const existingUser = await this.dbService.users.findFirst({
        where: {
          deleted_at: null,
          OR: [
            { username: registrantUsername },
            { username: registrantUsername.replace(/[^a-z0-9._-]/g, '') },
          ],
        },
      });

      if (existingUser) {
        throw new BadRequestException(
          'Email sudah terdaftar sebagai akun pengguna. Silakan gunakan email lain atau hubungi Admin Mitra10.',
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
          'send-registrant-account-mail',
          {
            registration_id: registration.id,
            to: dto.pic_email || dto.email_address,
            company_name: dto.company_name,
            email_address: dto.email_address,
            pic_email: dto.pic_email,
            phone_number: dto.phone_number,
            pic_phone: dto.pic_phone,
            username: registrantUsername,
            password: registrantPassword,
          },
          { attempts: 3 },
        );
      } catch (emailError) {
        console.error('Failed to queue vendor registration email:', emailError);
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



  // Terms and conditions delegation
  getActiveTermsAndConditions() {
    return this.termsService.getActiveTermsAndConditions();
  }

  listTermsAndConditions(userId: number) {
    return this.termsService.listTermsAndConditions(userId);
  }

  getTermsVersionById(id: number, userId: number) {
    return this.termsService.getTermsVersionById(id, userId);
  }

  updateTermsAndConditions(dto: UpdateTermsAndConditionsDto, userId: number, file?: Express.Multer.File) {
    return this.termsService.updateTermsAndConditions(dto, userId, file);
  }

  editTermsVersionInPlace(id: number, dto: UpdateTermsAndConditionsDto, userId: number, file?: Express.Multer.File) {
    return this.termsService.editTermsVersionInPlace(id, dto, userId, file);
  }

  activateTermsVersion(id: number, userId: number) {
    return this.termsService.activateTermsVersion(id, userId);
  }

  deactivateTermsVersion(id: number, userId: number) {
    return this.termsService.deactivateTermsVersion(id, userId);
  }

  getActiveTermsPdfPath() {
    return this.termsService.getActiveTermsPdfPath();
  }

  // Query & Profile delegation
  findAllRegistrations(query: QueryVendorRegistrationDto, userId?: number) {
    return this.queryService.findAllRegistrations(query, userId);
  }

  findOneRegistration(id: number, userId?: number) {
    return this.queryService.findOneRegistration(id, userId);
  }

  getRegistrationHistory(id: number, userId?: number) {
    return this.queryService.getRegistrationHistory(id, userId);
  }

  getEmailStatus(id: number, userId?: number) {
    return this.queryService.getEmailStatus(id, userId);
  }

  resendEmail(id: number, userId?: number) {
    return this.queryService.resendEmail(id, userId);
  }

  getRegistrationStats(userId?: number) {
    return this.queryService.getRegistrationStats(userId);
  }

  findMyRegistrations(userId: number) {
    return this.queryService.findMyRegistrations(userId);
  }

  getMyRegistrantProfile(userId: number) {
    return this.queryService.getMyRegistrantProfile(userId);
  }

  getRegistrantHomeContent() {
    return this.queryService.getRegistrantHomeContent();
  }

  // Approval & Lifecycle delegation
  approveRegistration(id: number, dto: ApproveVendorRegistrationDto, userId: number) {
    return this.approvalService.approveRegistration(id, dto, userId);
  }

  rejectRegistration(id: number, dto: RejectVendorRegistrationDto, userId: number) {
    return this.approvalService.rejectRegistration(id, dto, userId);
  }

  deleteRejectedRegistrationDocuments() {
    return this.approvalService.deleteRejectedRegistrationDocuments();
  }

  anonymizeRejectedRegistrations() {
    return this.approvalService.anonymizeRejectedRegistrations();
  }

  deleteRegistration(id: number, userId?: number) {
    return this.approvalService.deleteRegistration(id, userId);
  }

  deleteRegistrationByEmail(email: string, userId?: number) {
    return this.approvalService.deleteRegistrationByEmail(email, userId);
  }
}
