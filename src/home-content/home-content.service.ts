import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHomeContentDto, UpdateHomeContentDto, HomeSection } from './dto/home-content.dto';

@Injectable()
export class HomeContentService {
  private readonly logger = new Logger(HomeContentService.name);

  constructor(private readonly dbService: PrismaService) {}

  /**
   * Resolve role name → cek apakah Admin HO atau Super User.
   * Sama dengan pattern di vendor-registration.service.ts (Poin 2, JWT-only +
   * role-check manual di handler, tanpa CASL).
   */
  async getRoleName(userId?: number): Promise<string | null> {
    if (!userId) return null;
    const user = await this.dbService.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: { roles: { select: { name: true } } },
    });
    return user?.roles?.name ?? null;
  }

  async assertAdminHOOrSuperUser(userId?: number): Promise<void> {
    const role = await this.getRoleName(userId);
    if (role !== 'Admin HO' && role !== 'Super User') {
      throw new ForbiddenException(
        `Akses hanya untuk Admin HO / Super User. Role Anda: ${role ?? 'tidak diketahui'}.`,
      );
    }
  }

  /**
   * Public read - return only is_active=true content.
   * Sort: order_index ASC (global, bukan per-section) → admin set nilai unik lintas section
   * untuk kontrol urutan tampil keseluruhan. Tie-breaker: id ASC.
   * Untuk dashboard pendaftar/vendor (read-only).
   */
  async findAllActive() {
    return this.dbService.home_content.findMany({
      where: { is_active: true },
      orderBy: [{ order_index: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Admin read - return all records (active + inactive) untuk settings UI.
   */
  async findAll() {
    return this.dbService.home_content.findMany({
      orderBy: [{ order_index: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(id: number) {
    const row = await this.dbService.home_content.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Home content dengan ID ${id} tidak ditemukan.`);
    }
    return row;
  }

  /**
   * Validasi integrity: HERO dan minimal 1 BANNER harus selalu is_active=true
   * (jangan sampai halaman Home kosong total). Dipanggil sebelum create dan
   * sebelum update yang menonaktifkan record.
   */
  private async assertHomeNotEmpty(
    next: { section: HomeSection; is_active?: boolean },
    excludeId?: number,
  ): Promise<void> {
    if (next.is_active === false) {
      const where = excludeId ? { NOT: { id: excludeId } } : {};
      const activeHero = await this.dbService.home_content.count({
        where: { section: 'HERO', is_active: true, ...where },
      });
      const activeBanner = await this.dbService.home_content.count({
        where: { section: 'BANNER', is_active: true, ...where },
      });
      if (next.section === 'HERO' && activeHero === 0) {
        throw new BadRequestException(
          'Tidak bisa menonaktifkan HERO - harus ada minimal 1 HERO aktif.',
        );
      }
      if (next.section === 'BANNER' && activeBanner === 0) {
        throw new BadRequestException(
          'Tidak bisa menonaktifkan BANNER terakhir - harus ada minimal 1 BANNER aktif.',
        );
      }
    }
  }

  async create(dto: CreateHomeContentDto, userId?: number) {
    await this.assertAdminHOOrSuperUser(userId);
    if (dto.is_active === false || dto.is_active === undefined) {
      // If creating inactive HERO/BANNER, that's allowed but warn via check.
      // If creating active (default true), check it doesn't make Home empty.
    }
    return this.dbService.home_content.create({
      data: {
        section: dto.section,
        title: dto.title,
        subtitle: dto.subtitle,
        description: dto.description,
        icon: dto.icon,
        image_url: dto.image_url,
        order_index: dto.order_index ?? 0,
        is_active: dto.is_active ?? true,
        updated_by: userId,
      },
    });
  }

  async update(id: number, dto: UpdateHomeContentDto, userId?: number) {
    await this.assertAdminHOOrSuperUser(userId);

    const existing = await this.dbService.home_content.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Home content dengan ID ${id} tidak ditemukan.`);
    }

    // Cek integrity HERO/BANNER kalau ada perubahan is_active
    if (dto.is_active !== undefined && existing.is_active !== dto.is_active) {
      await this.assertHomeNotEmpty(
        { section: existing.section as HomeSection, is_active: dto.is_active },
        id,
      );
    }

    return this.dbService.home_content.update({
      where: { id },
      data: {
        ...(dto.section !== undefined && { section: dto.section }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.subtitle !== undefined && { subtitle: dto.subtitle }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.image_url !== undefined && { image_url: dto.image_url }),
        ...(dto.order_index !== undefined && { order_index: dto.order_index }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
        updated_at: new Date(),
        updated_by: userId,
      },
    });
  }

  async remove(id: number, userId?: number) {
    await this.assertAdminHOOrSuperUser(userId);
    const existing = await this.dbService.home_content.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Home content dengan ID ${id} tidak ditemukan.`);
    }
    // Cek integrity sebelum delete
    await this.assertHomeNotEmpty(
      { section: existing.section as HomeSection, is_active: false },
      id,
    );
    return this.dbService.home_content.delete({ where: { id } });
  }
}
