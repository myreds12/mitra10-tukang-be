/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  ApproveVendorRegistrationDto,
  RejectVendorRegistrationDto,
} from './dto/vendor-registration.dto';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashSync } from 'bcrypt';
import { RegistrationStatus } from './enums/registration-status.enum';
import { Cron } from '@nestjs/schedule';
import { VendorRegistrationValidationService } from './vendor-registration-validation.service';
import { PENDAFTAR_VENDOR_ROLE } from './vendor-registration.constants';

@Injectable()
export class VendorRegistrationApprovalService {
  private readonly logger = new Logger(VendorRegistrationApprovalService.name);

  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly validationService: VendorRegistrationValidationService,
  ) {}
  async approveRegistration(
    id: number,
    dto: ApproveVendorRegistrationDto,
    userId: number,
  ) {
    try {
      await this.validationService.assertAdminHO(userId);

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

          await this.validationService.createHistory(tx, {
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
              registration_id: id,
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
            deleted_at: new Date(),
            deleted_by: userId,
          },
        });

        if (transitionResult.count === 0) {
          throw new BadRequestException(
            'Pendaftaran sudah diproses oleh admin lain atau status tidak valid.',
          );
        }

        await this.validationService.createHistory(tx, {
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

        const registrantEmail = (
          registration.pic_email || registration.email_address || ''
        )
          .toLowerCase()
          .trim();

        let user;
        let generatedUsername = registrantEmail || `vendor_${id}_${slug}`;

        if (existingRegistrant) {
          generatedUsername = registrantEmail || existingRegistrant.username;
          // Pertahankan password akun pendaftar agar vendor tetap dapat login dengan kredensial dari email pendaftaran,
          // dan pastikan username memakai email utuh (@ tidak dihilangkan).
          user = await tx.users.update({
            where: { id: existingRegistrant.id },
            data: {
              username: generatedUsername,
              role_id: role.id,
            },
          });

          await this.validationService.createHistory(tx, {
            vendor_registration_id: id,
            from_status: RegistrationStatus.DISETUJUI,
            to_status: RegistrationStatus.DISETUJUI,
            action: 'REGISTRANT_PROMOTED',
            notes: `Akun pendaftar (${generatedUsername}) dipromosikan menjadi Owner Vendor.`,
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
            const tukangArray = this.validationService.parseTukangData(registration.tukang_data, { validate: true });
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
                    email: `tukang_${vendor.id}_${idx + 1}@temp.local`,
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

        const serviceTypeIds = this.validationService.parseIntJsonArray(registration.service_types);
        for (const serviceTypeId of serviceTypeIds) {
          await tx.vendor_service.create({
            data: {
              vendor_id: vendor.id,
              service_type_id: serviceTypeId,
              created_by: user.id,
            },
          });
        }

        const areaIds = this.validationService.parseIntJsonArray(registration.areas);
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
            registration_id: id,
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
      await this.validationService.assertAdminHO(userId);

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

        const rejectionReason =
          dto.rejection_reason?.trim() || 'Belum memenuhi kriteria';

        await tx.vendor_registration.update({
          where: { id },
          data: {
            status: RegistrationStatus.DITOLAK,
            rejection_reason: rejectionReason,
            reviewed_by: userId,
            reviewed_at: new Date(),
            rejected_at: new Date(),
            notes: dto.notes,
            updated_by: userId,
            updated_at: new Date(),
          },
        });

        await this.validationService.createHistory(tx, {
          vendor_registration_id: id,
          from_status: currentRegistration.status,
          to_status: RegistrationStatus.DITOLAK,
          action: 'REJECTED',
          notes: rejectionReason,
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

      const rejectionReason =
        dto.rejection_reason?.trim() || 'Belum memenuhi kriteria';

      await this.emailQueue.add(
        'send-vendor-rejection-mail',
        {
          registration_id: id,
          to: rejectionRecipient,
          company_name: registration.company_name,
          rejection_reason: rejectionReason,
          reapply_date: this.validationService.formatCooldownDate(this.validationService.getRejectedCooldownUntil(new Date())),
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
      cutoff.getHours() - this.validationService.rejectedDocumentRetentionHours,
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
          this.validationService.getRegistrationDocumentPaths(registration);
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

          await this.validationService.createHistory(tx, {
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
    cutoff.setDate(cutoff.getDate() - this.validationService.rejectedCooldownDays);

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

  async deleteRegistration(id: number, userId?: number) {
    try {
      if (userId) {
        await this.validationService.assertAdminHO(userId);
      }

      return await this.dbService.$transaction(async (tx) => {
        const registration = await tx.vendor_registration.findFirst({
          where: { id },
        });

        if (!registration) {
          throw new NotFoundException(
            `Pendaftaran dengan ID ${id} tidak ditemukan.`,
          );
        }

        const registrantUserId = registration.user_id;

        await (tx as any).vendor_registration_history.deleteMany({
          where: { vendor_registration_id: id },
        });

        await tx.vendor_registration_token.deleteMany({
          where: { registration_id: id },
        });

        await tx.vendor_registration.delete({
          where: { id },
        });

        // Hapus juga akun pendaftar (role "Pendaftar Vendor") jika dibuat saat registrasi
        if (registrantUserId) {
          const registrantUser = await tx.users.findUnique({
            where: { id: registrantUserId },
            include: { roles: true },
          });

          if (
            registrantUser &&
            registrantUser.roles?.name === PENDAFTAR_VENDOR_ROLE
          ) {
            await tx.notifications.deleteMany({
              where: { user_id: registrantUserId },
            });
            await tx.users.delete({
              where: { id: registrantUserId },
            });
          }
        }

        return {
          message: 'Pendaftaran vendor berhasil dihapus permanen.',
          registration_id: id,
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async deleteRegistrationByEmail(email: string, userId?: number) {
    try {
      if (userId) {
        await this.validationService.assertAdminHO(userId);
      }

      const normalizedEmail = (email || '').trim().toLowerCase();
      const registration = await this.dbService.vendor_registration.findFirst({
        where: {
          OR: [
            { email_address: normalizedEmail },
            { pic_email: normalizedEmail },
          ],
        },
      });

      if (!registration) {
        throw new NotFoundException(
          `Pendaftaran vendor dengan email "${email}" tidak ditemukan.`,
        );
      }

      return await this.deleteRegistration(registration.id, userId);
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // GET REGISTRATION STATISTICS
  // ================================


}
