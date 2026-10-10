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
import { QueryVendorRegistrationDto } from './dto/vendor-registration.dto';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashSync } from 'bcrypt';
import { RegistrationStatus } from './enums/registration-status.enum';
import { VendorRegistrationValidationService } from './vendor-registration-validation.service';
import { PENDAFTAR_VENDOR_ROLE } from './vendor-registration.constants';

@Injectable()
export class VendorRegistrationQueryService {
  private readonly logger = new Logger(VendorRegistrationQueryService.name);

  constructor(
    private readonly dbService: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
    private readonly validationService: VendorRegistrationValidationService,
  ) {}

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


  async findAllRegistrations(query: QueryVendorRegistrationDto, userId?: number) {
    try {
      await this.validationService.assertAdminHO(userId);

      const pageNum = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
      const takeNum = Math.max(1, parseInt(String(query.take || 10), 10) || 10);
      const skip = (pageNum - 1) * takeNum;

      const {
        status,
        search,
        company_name,
        date_from,
        date_to,
      } = query;

      const statusNum =
        status !== undefined && status !== null && String(status) !== ''
          ? parseInt(String(status), 10)
          : undefined;

      const where: Prisma.vendor_registrationWhereInput = {
        deleted_at: null,
        ...(statusNum !== undefined && !isNaN(statusNum)
          ? statusNum > 0
            ? { status: statusNum }
            : {} // Status 0 artinya "Semua" status (all)
          : {
              status: {
                in: [
                  RegistrationStatus.MENUNGGU_APPROVE,
                  RegistrationStatus.PROSES_PITCHING,
                ],
              },
            }),
        ...(search && search.trim()
          ? {
              OR: [
                { company_name: { contains: search.trim() } },
                { pic_name: { contains: search.trim() } },
                { email_address: { contains: search.trim() } },
                { phone_number: { contains: search.trim() } },
              ],
            }
          : company_name && company_name.trim()
          ? { company_name: { contains: company_name.trim() } }
          : {}),
        ...(date_from || date_to
          ? {
              created_at: {
                ...(date_from && !isNaN(new Date(date_from).getTime())
                  ? { gte: new Date(date_from) }
                  : {}),
                ...(date_to && !isNaN(new Date(date_to).getTime())
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
          take: takeNum,
          orderBy: { created_at: 'desc' },
          include: {
            bank: true,
          },
        }),
        this.dbService.vendor_registration.count({ where }),
      ]);

      // Parse JSON fields
      const formattedRegistrations = registrations.map((reg) =>
        this.validationService.formatRegistration(reg),
      );

      const withEmailStatus = await this.attachEmailStatus(formattedRegistrations);
      const totalPages = Math.ceil(total / takeNum) || 1;

      return {
        data: withEmailStatus,
        meta: {
          total,
          page: pageNum,
          take: takeNum,
          skip,
          total_pages: totalPages,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  private async enrichHistoriesWithActor(histories: any[]) {
    if (!histories || histories.length === 0) return [];

    const actorIds = Array.from(
      new Set(
        histories
          .map((h: any) => h.actor_id)
          .filter((id: any): id is number => typeof id === 'number'),
      ),
    );

    let actorMap: Record<number, { username: string; role_name?: string }> = {};
    if (actorIds.length > 0) {
      try {
        const users = await this.dbService.users.findMany({
          where: { id: { in: actorIds } },
          select: {
            id: true,
            username: true,
            roles: {
              select: {
                name: true,
              },
            },
          },
        });
        users.forEach((u) => {
          actorMap[u.id] = {
            username: u.username,
            role_name: u.roles?.name,
          };
        });
      } catch (err) {
        // ignore if query fails
      }
    }

    return histories.map((h: any) => {
      const actorInfo = h.actor_id ? actorMap[h.actor_id] : null;
      let actorDisplay = 'Sistem';
      if (actorInfo) {
        actorDisplay = actorInfo.role_name
          ? `${actorInfo.username} (${actorInfo.role_name})`
          : actorInfo.username;
      } else if (h.actor_id) {
        actorDisplay = `Admin #${h.actor_id}`;
      }

      return {
        ...h,
        actor_username: actorInfo?.username || null,
        actor_role: actorInfo?.role_name || null,
        actor_display: actorDisplay,
      };
    });
  }

  async findOneRegistration(id: number, userId?: number) {
    try {
      await this.validationService.assertAdminHO(userId);

      const registration = await this.dbService.vendor_registration.findFirst({
        where: { id },
        include: {
          bank: true,
        },
      });

      if (!registration) {
        throw new NotFoundException(`Pendaftaran dengan ID ${id} tidak ditemukan.`);
      }

      const rawHistories = await (this.dbService as any).vendor_registration_history.findMany({
        where: { vendor_registration_id: id },
        orderBy: { created_at: 'asc' },
      });
      const histories = await this.enrichHistoriesWithActor(rawHistories);

      const formatted = this.validationService.formatRegistration({
        ...registration,
        histories,
        history: histories,
      });

      const [withEmail] = await this.attachEmailStatus([formatted]);
      return withEmail;
    } catch (error) {
      throw error;
    }
  }

  async getRegistrationHistory(id: number, userId?: number) {
    try {
      await this.validationService.assertAdminHO(userId);

      const registration = await this.dbService.vendor_registration.findFirst({
        where: { id },
      });

      if (!registration) {
        throw new NotFoundException(`Pendaftaran dengan ID ${id} tidak ditemukan.`);
      }

      const rawHistories = await (this.dbService as any).vendor_registration_history.findMany({
        where: { vendor_registration_id: id },
        orderBy: { created_at: 'asc' },
      });
      const histories = await this.enrichHistoriesWithActor(rawHistories);

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

  async getEmailStatus(id: number, userId?: number) {
    await this.validationService.assertAdminHO(userId);
    const registration = await this.dbService.vendor_registration.findFirst({
      where: { id, deleted_at: null },
    });

    if (!registration) {
      throw new NotFoundException(`Pendaftaran dengan ID ${id} tidak ditemukan.`);
    }

    const recipient = registration.pic_email || registration.email_address;
    const conditions: any[] = [{ moduleId: id }];
    if (recipient) {
      conditions.push({ to: { contains: recipient } });
    }
    const mailLogs = await this.dbService.mail_logs.findMany({
      where: {
        OR: conditions,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const latestLog = mailLogs[0];
    return {
      registration_id: id,
      sent: latestLog ? latestLog.status === 1 : false,
      status: latestLog ? (latestLog.status === 1 ? 'TERKIRIM' : 'GAGAL') : 'BELUM_TERKIRIM',
      sent_at: latestLog ? latestLog.createdAt : null,
      recipient,
      history: mailLogs.map((l) => ({
        id: l.id,
        to: l.to,
        status: l.status === 1 ? 'TERKIRIM' : 'GAGAL',
        sent_at: l.createdAt,
      })),
    };
  }

  async resendEmail(id: number, userId?: number) {
    await this.validationService.assertAdminHO(userId);

    const registration = await this.dbService.vendor_registration.findFirst({
      where: { id, deleted_at: null },
      include: {
        user: true,
      },
    });

    if (!registration) {
      throw new NotFoundException(`Pendaftaran dengan ID ${id} tidak ditemukan.`);
    }

    const recipient = registration.pic_email || registration.email_address;
    if (!recipient) {
      throw new BadRequestException('Data email tidak ditemukan untuk pendaftaran ini.');
    }

    // 1. If registration is approved (status = 3), resend approval credentials
    if (registration.status === RegistrationStatus.DISETUJUI) {
      const randomStr = randomBytes(4).toString('hex').toUpperCase();
      const generatedPassword = `M1tr${randomStr}@${new Date().getFullYear()}`;
      const hashedPassword = hashSync(generatedPassword, 12);

      let user = registration.user;
      if (!user) {
        user = await this.dbService.users.findFirst({
          where: {
            username: {
              contains: registration.company_name
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '')
                .slice(0, 8),
            },
          },
        });
      }

      if (user) {
        await this.dbService.users.update({
          where: { id: user.id },
          data: { password: hashedPassword },
        });
      }

      const username = user?.username || recipient;

      await this.emailQueue.add(
        'send-vendor-approval-mail',
        {
          registration_id: registration.id,
          to: recipient,
          company_name: registration.company_name,
          token: '',
          expires_hours: 48,
          username,
          password: generatedPassword,
        },
        { attempts: 3 },
      );

      await this.validationService.createHistory(this.dbService, {
        vendor_registration_id: id,
        from_status: registration.status,
        to_status: registration.status,
        action: 'RESEND_EMAIL',
        notes: `Admin HO mengirim ulang email persetujuan & kredensial vendor ke ${recipient}.`,
        actor_id: userId,
      });

      return {
        success: true,
        message: `Email persetujuan vendor berhasil dikirim ulang ke ${recipient}.`,
        recipient,
      };
    }

    // 2. If registration is rejected (status = 4), resend rejection notification
    if (registration.status === RegistrationStatus.DITOLAK) {
      await this.emailQueue.add(
        'send-vendor-rejection-mail',
        {
          registration_id: registration.id,
          to: recipient,
          company_name: registration.company_name,
          rejection_reason: registration.rejection_reason || 'Tidak ada alasan spesifik diberikan.',
          reapply_date: this.validationService.formatCooldownDate(
            this.validationService.getRejectedCooldownUntil(registration.rejected_at || new Date()),
          ),
        },
        { attempts: 3 },
      );

      await this.validationService.createHistory(this.dbService, {
        vendor_registration_id: id,
        from_status: registration.status,
        to_status: registration.status,
        action: 'RESEND_EMAIL',
        notes: `Admin HO mengirim ulang email penolakan ke ${recipient}.`,
        actor_id: userId,
      });

      return {
        success: true,
        message: `Email penolakan berhasil dikirim ulang ke ${recipient}.`,
        recipient,
      };
    }

    // 3. For MENUNGGU_APPROVE (1) or PROSES_PITCHING (2): Resend registrant account credentials
    let user = registration.user;
    if (!user && registration.user_id) {
      user = await this.dbService.users.findUnique({
        where: { id: registration.user_id },
      });
    }

    const registrantUsername = (
      registration.pic_email || registration.email_address || ''
    )
      .toLowerCase()
      .trim();

    if (!user) {
      user = await this.dbService.users.findFirst({
        where: {
          deleted_at: null,
          OR: [
            { username: registrantUsername },
            { username: registrantUsername.replace(/[^a-z0-9._-]/g, '') },
          ],
        },
      });
    }

    const randomStr = randomBytes(4).toString('hex').toUpperCase();
    const registrantPassword = `M1tr${randomStr}@${new Date().getFullYear()}`;
    const hashedPassword = hashSync(registrantPassword, 12);

    if (user) {
      user = await this.dbService.users.update({
        where: { id: user.id },
        data: {
          username: registrantUsername,
          password: hashedPassword,
        },
      });
    } else {
      const registrantRole = await this.dbService.roles.findFirst({
        where: { name: PENDAFTAR_VENDOR_ROLE },
      });
      if (registrantRole) {
        user = await this.dbService.users.create({
          data: {
            username: registrantUsername,
            password: hashedPassword,
            role_id: registrantRole.id,
          },
        });
        await this.dbService.vendor_registration.update({
          where: { id: registration.id },
          data: { user_id: user.id },
        });
      }
    }

    await this.emailQueue.add(
      'send-registrant-account-mail',
      {
        registration_id: registration.id,
        to: recipient,
        company_name: registration.company_name,
        email_address: registration.email_address,
        pic_email: registration.pic_email,
        phone_number: registration.phone_number,
        pic_phone: registration.pic_phone,
        username: user?.username || registrantUsername,
        password: registrantPassword,
      },
      { attempts: 3 },
    );

    await this.validationService.createHistory(this.dbService, {
      vendor_registration_id: id,
      from_status: registration.status,
      to_status: registration.status,
      action: 'RESEND_EMAIL',
      notes: `Admin HO mengirim ulang email akun pendaftar ke ${recipient}.`,
      actor_id: userId,
    });

    return {
      success: true,
      message: `Email akun pendaftar berhasil dikirim ulang ke ${recipient}.`,
      recipient,
    };
  }

  // ================================
  // ADMIN: APPROVE REGISTRATION
  // ================================


  async getRegistrationStats(userId?: number) {
    try {
      await this.validationService.assertAdminHO(userId);

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

  async findMyRegistrations(userId: number) {
    await this.validationService.assertRegistrant(userId);

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
    await this.validationService.assertRegistrant(userId);

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
