import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateHomeContentDto,
  UpdateHomeContentDto,
  HomeSection,
  validateSectionPayload,
  UnifiedHomePayload,
  HeroPayload,
  BenefitPayload,
  CatalogPayload,
  SupportPayload,
  ProgramPayload,
  JobResultPayload,
} from './dto/home-content.dto';
import { existsSync } from 'fs';
import { resolve } from 'path';

export interface FormattedHomeContentItem {
  id: number;
  section: string;
  section_type: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  badge_label?: string | null;
  cta_label?: string | null;
  image_before_url?: string | null;
  image_after_url?: string | null;
  video_url?: string | null;
  media_type?: 'before_after' | 'video' | null;
  payload: any;
  order_index: number;
  is_active: boolean;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date | null;
  updated_by: number | null;
}

@Injectable()
export class HomeContentService {
  private readonly logger = new Logger(HomeContentService.name);

  constructor(private readonly dbService: PrismaService) {}

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

  private formatItem(item: any): FormattedHomeContentItem {
    let parsedPayload: any = null;
    if (item.payload) {
      try {
        parsedPayload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
      } catch (err) {
        this.logger.error(`Error parsing payload for item ID ${item.id}:`, err);
        parsedPayload = null;
      }
    }

    const sectionType = item.section || 'UNIFIED_HOME';

    return {
      id: item.id,
      section: sectionType,
      section_type: sectionType,
      title: item.title,
      subtitle: item.subtitle,
      description: item.description,
      icon: item.icon,
      image_url: item.image_url ?? parsedPayload?.image_url ?? parsedPayload?.image ?? null,
      badge_label: item.badge_label ?? parsedPayload?.badge_label ?? parsedPayload?.badge ?? null,
      cta_label: item.cta_label ?? parsedPayload?.cta_label ?? null,
      image_before_url: item.image_before_url ?? parsedPayload?.image_before_url ?? parsedPayload?.before_image ?? null,
      image_after_url: item.image_after_url ?? parsedPayload?.image_after_url ?? parsedPayload?.after_image ?? null,
      video_url: item.video_url ?? parsedPayload?.video_url ?? null,
      media_type: item.media_type ?? parsedPayload?.media_type ?? (parsedPayload?.video_url ? 'video' : 'before_after'),
      payload: parsedPayload,
      order_index: item.order_index ?? 0,
      is_active: Boolean(item.is_active),
      status: item.is_active ? 'active' : 'inactive',
      created_at: item.created_at,
      updated_at: item.updated_at,
      updated_by: item.updated_by,
    };
  }

  /**
   * Public endpoint - return active Home Content.
   * Returns decomposed list of items (HERO, BENEFIT, CATALOG, SUPPORT) for vendor views,
   * plus the unified package structure.
   */
  async findAllActive(): Promise<any[]> {
    const activeUnified = await this.dbService.home_content.findFirst({
      where: { section: 'UNIFIED_HOME', is_active: true },
      orderBy: { id: 'desc' },
    });

    if (activeUnified && activeUnified.payload) {
      const formatted = this.formatItem(activeUnified);
      const p = formatted.payload as UnifiedHomePayload;

      // Decompose into standardized items for vendor page compatibility
      const items: any[] = [];

      // 1. HERO item
      if (p.hero) {
        items.push({
          id: activeUnified.id,
          section: 'HERO',
          section_type: 'HERO',
          title: p.hero.headline_main,
          subtitle: p.hero.headline_highlight,
          description: p.hero.description,
          image_url: p.hero.illustration_image || null,
          payload: p.hero,
          is_active: true,
          status: 'active',
          order_index: 1,
        });
      }

      // 2. BENEFIT items
      if (Array.isArray(p.benefits)) {
        p.benefits.forEach((b, idx) => {
          items.push({
            id: activeUnified.id * 100 + (idx + 1),
            section: 'BENEFIT',
            section_type: 'BENEFIT',
            title: b.title,
            description: b.description,
            icon: b.icon,
            image_url: b.image || null,
            payload: b,
            is_active: true,
            status: 'active',
            order_index: idx + 1,
          });
        });
      }

      // 3. CATALOG items
      if (Array.isArray(p.catalogs)) {
        p.catalogs.forEach((c, idx) => {
          items.push({
            id: activeUnified.id * 1000 + (idx + 1),
            section: 'CATALOG',
            section_type: 'CATALOG',
            title: c.name,
            description: c.link_url,
            icon: c.icon_fallback || null,
            image_url: c.image || null,
            payload: c,
            is_active: true,
            status: 'active',
            order_index: idx + 1,
          });
        });
      }

      // 4. PROGRAM items (Program Berjalan)
      if (Array.isArray(p.programs)) {
        p.programs
          .filter((prog: any) => prog.is_active !== false && Boolean((prog.description && prog.description.trim()) || prog.image_url || prog.image))
          .forEach((prog: any, idx: number) => {
            const imgUrl = prog.image_url || prog.image || null;
            const badge = prog.badge_label || prog.badge || null;
            const cta = prog.cta_label || null;
            items.push({
              id: activeUnified.id * 10000 + (idx + 1),
              section: 'PROGRAM_BERJALAN',
              section_type: 'PROGRAM_BERJALAN',
              title: prog.title || null,
              description: prog.description || '',
              image_url: imgUrl,
              badge_label: badge,
              cta_label: cta,
              link_url: prog.link_url || null,
              payload: { ...prog, image_url: imgUrl, badge_label: badge, cta_label: cta },
              is_active: true,
              status: 'active',
              order_index: prog.order_index ?? idx + 1,
            });
          });
      }

      // 5. JOB_RESULT items (Hasil Pekerjaan / Before-After / Video)
      if (Array.isArray(p.job_results)) {
        p.job_results
          .filter((job: any) => {
            const isActive = job.is_active !== false;
            const isVideo = job.media_type === 'video' || Boolean(job.video_url);
            if (isVideo) {
              return isActive && Boolean(job.video_url);
            }
            return isActive && Boolean(job.image_before_url || job.before_image || job.image);
          })
          .forEach((job: any, idx: number) => {
            const isVideo = job.media_type === 'video' || Boolean(job.video_url);
            const beforeImg = job.image_before_url || job.before_image || job.image || null;
            const afterImg = job.image_after_url || job.after_image || null;
            const videoUrl = job.video_url || null;
            const badge = job.badge_label || job.tag || job.badge || (isVideo ? 'Video Dokumentasi' : 'Before - After');
            items.push({
              id: activeUnified.id * 100000 + (idx + 1),
              section: 'HASIL_PEKERJAAN',
              section_type: 'HASIL_PEKERJAAN',
              title: job.title,
              description: job.description,
              media_type: isVideo ? 'video' : 'before_after',
              image_url: beforeImg,
              image_before_url: beforeImg,
              image_after_url: afterImg,
              video_url: videoUrl,
              badge_label: badge,
              payload: {
                ...job,
                media_type: isVideo ? 'video' : 'before_after',
                video_url: videoUrl,
                image_before_url: beforeImg,
                image_after_url: afterImg,
                badge_label: badge,
              },
              is_active: true,
              status: 'active',
              order_index: job.order_index ?? idx + 1,
            });
          });
      }

      // 6. SUPPORT item (for "Hubungi Tim Support" button in header/home)
      if (p.support) {
        items.push({
          id: activeUnified.id * 1000000 + 1,
          section: 'SUPPORT',
          section_type: 'SUPPORT',
          title: p.support.support_label || 'Hubungi Tim Support',
          subtitle: p.support.support_hours || '',
          description: `${p.support.support_email} | ${p.support.support_phone}`,
          payload: p.support,
          is_active: true,
          status: 'active',
          order_index: 99,
        });
      }

      return items;
    }

    // Fallback if individual rows exist in DB
    const rawItems = await this.dbService.home_content.findMany({
      where: { is_active: true },
      orderBy: [{ order_index: 'asc' }, { id: 'asc' }],
    });

    return rawItems
      .filter((item) => {
        if (['PROGRAM', 'PROGRAM_BERJALAN'].includes(item.section)) {
          return Boolean(item.description || item.image_url);
        }
        if (['JOB_RESULT', 'HASIL_PEKERJAAN'].includes(item.section)) {
          return Boolean(item.image_before_url || item.image_url || (item as any).video_url);
        }
        return true;
      })
      .map((item) => this.formatItem(item));
  }

  /**
   * Get single active unified package directly.
   */
  async getActiveUnified(): Promise<FormattedHomeContentItem | null> {
    const row = await this.dbService.home_content.findFirst({
      where: { section: 'UNIFIED_HOME', is_active: true },
      orderBy: { id: 'desc' },
    });
    return row ? this.formatItem(row) : null;
  }

  /**
   * Admin read - return all Home Content packages.
   */
  async findAll(): Promise<FormattedHomeContentItem[]> {
    const rawItems = await this.dbService.home_content.findMany({
      where: { section: 'UNIFIED_HOME' },
      orderBy: [{ is_active: 'desc' }, { id: 'desc' }],
    });

    // If no UNIFIED_HOME exists yet (e.g. initial state), return all records
    if (rawItems.length === 0) {
      const all = await this.dbService.home_content.findMany({
        orderBy: [{ id: 'asc' }],
      });
      return all.map((item) => this.formatItem(item));
    }

    return rawItems.map((item) => this.formatItem(item));
  }

  async findOne(id: number): Promise<FormattedHomeContentItem> {
    const row = await this.dbService.home_content.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Home content dengan ID ${id} tidak ditemukan.`);
    }
    return this.formatItem(row);
  }

  /**
   * Create new Home Content package.
   * Enforces: HANYA BOLEH 1 YANG BERSTATUS AKTIF.
   */
  async create(dto: CreateHomeContentDto, userId?: number): Promise<FormattedHomeContentItem> {
    await this.assertAdminHOOrSuperUser(userId);

    const sectionType = (dto.section_type || dto.section || 'UNIFIED_HOME').toUpperCase() as HomeSection;
    const validatedPayload = validateSectionPayload(sectionType, dto.payload);

    let isActive = true;
    if (dto.is_active !== undefined) {
      isActive = dto.is_active;
    } else if (dto.status !== undefined) {
      isActive = dto.status === 'active';
    }

    // ATURAN KETAT: HANYA BOLEH 1 HOME CONTENT YANG AKTIF
    if (isActive) {
      await this.dbService.home_content.updateMany({
        where: { is_active: true },
        data: { is_active: false, updated_at: new Date() },
      });
      this.logger.log('Deactivated all previous active home content to maintain strictly single active configuration.');
    }

    const title = dto.title || 'Konten Home Vendor';

    const created = await this.dbService.home_content.create({
      data: {
        section: sectionType,
        title,
        payload: JSON.stringify(validatedPayload),
        order_index: dto.order_index ?? 0,
        is_active: isActive,
        updated_by: userId,
        badge_label: dto.badge_label ?? (validatedPayload as any)?.badge_label ?? null,
        cta_label: dto.cta_label ?? (validatedPayload as any)?.cta_label ?? null,
        image_before_url: dto.image_before_url ?? (validatedPayload as any)?.image_before_url ?? null,
        image_after_url: dto.image_after_url ?? (validatedPayload as any)?.image_after_url ?? null,
        image_url: dto.image_url ?? (validatedPayload as any)?.image_url ?? (validatedPayload as any)?.image ?? null,
      },
    });

    return this.formatItem(created);
  }

  /**
   * Update Home Content package.
   * Enforces: HANYA BOLEH 1 YANG BERSTATUS AKTIF.
   */
  async update(
    id: number,
    dto: UpdateHomeContentDto,
    userId?: number,
  ): Promise<FormattedHomeContentItem> {
    await this.assertAdminHOOrSuperUser(userId);

    const existing = await this.dbService.home_content.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Home content dengan ID ${id} tidak ditemukan.`);
    }

    const sectionType = (dto.section_type || dto.section || existing.section || 'UNIFIED_HOME').toUpperCase() as HomeSection;

    let isActive = existing.is_active;
    if (dto.is_active !== undefined) {
      isActive = dto.is_active;
    } else if (dto.status !== undefined) {
      isActive = dto.status === 'active';
    }

    let validatedPayload = null;
    if (dto.payload) {
      validatedPayload = validateSectionPayload(sectionType, dto.payload);
    } else if (existing.payload) {
      try {
        validatedPayload = JSON.parse(existing.payload);
      } catch {
        validatedPayload = null;
      }
    }

    // ATURAN KETAT: HANYA BOLEH 1 HOME CONTENT YANG AKTIF
    if (isActive) {
      await this.dbService.home_content.updateMany({
        where: { is_active: true, NOT: { id } },
        data: { is_active: false, updated_at: new Date() },
      });
      this.logger.log(`Deactivated other active home content upon activating package #${id}.`);
    }

    const updated = await this.dbService.home_content.update({
      where: { id },
      data: {
        section: sectionType,
        title: dto.title !== undefined ? dto.title : existing.title,
        ...(validatedPayload && { payload: JSON.stringify(validatedPayload) }),
        ...(dto.order_index !== undefined && { order_index: dto.order_index }),
        ...(dto.badge_label !== undefined ? { badge_label: dto.badge_label } : (validatedPayload as any)?.badge_label ? { badge_label: (validatedPayload as any).badge_label } : {}),
        ...(dto.cta_label !== undefined ? { cta_label: dto.cta_label } : (validatedPayload as any)?.cta_label ? { cta_label: (validatedPayload as any).cta_label } : {}),
        ...(dto.image_before_url !== undefined ? { image_before_url: dto.image_before_url } : (validatedPayload as any)?.image_before_url ? { image_before_url: (validatedPayload as any).image_before_url } : {}),
        ...(dto.image_after_url !== undefined ? { image_after_url: dto.image_after_url } : (validatedPayload as any)?.image_after_url ? { image_after_url: (validatedPayload as any).image_after_url } : {}),
        ...(dto.image_url !== undefined ? { image_url: dto.image_url } : (validatedPayload as any)?.image_url ? { image_url: (validatedPayload as any).image_url } : {}),
        is_active: isActive,
        updated_at: new Date(),
        updated_by: userId,
      },
    });

    return this.formatItem(updated);
  }

  async remove(id: number, userId?: number): Promise<{ success: boolean; message: string }> {
    await this.assertAdminHOOrSuperUser(userId);

    const existing = await this.dbService.home_content.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Home content dengan ID ${id} tidak ditemukan.`);
    }

    await this.dbService.home_content.delete({ where: { id } });
    return { success: true, message: `Home content #${id} berhasil dihapus.` };
  }

  private checkFileExists(filePath: string): boolean {
    if (!filePath) return false;
    if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('blob:') || filePath.startsWith('data:')) {
      return true;
    }
    const cleaned = filePath.replace(/^[/\\]+/, '').replace(/^uploads[/\\]+/, '');
    const storageCleaned = filePath.replace(/^[/\\]+/, '').replace(/^storage[/\\]+/, '');
    const fullPath1 = resolve(process.cwd(), 'uploads', cleaned);
    const fullPath2 = resolve(process.cwd(), filePath.replace(/^[/\\]+/, ''));
    const fullPath3 = resolve(process.cwd(), 'storage', storageCleaned);
    return existsSync(fullPath1) || existsSync(fullPath2) || existsSync(fullPath3);
  }

  /**
   * Verifikasi sinkronisasi paket Home Content aktif.
   */
  async verifySync(): Promise<any> {
    const activeUnified = await this.dbService.home_content.findFirst({
      where: { section: 'UNIFIED_HOME', is_active: true },
      orderBy: { id: 'desc' },
    });

    const issues: Array<{
      id: number;
      section_type: string;
      title: string;
      issue_type: 'data' | 'asset' | 'render';
      severity: 'error' | 'warning';
      message: string;
    }> = [];

    const sectionCounts = {
      hero: 0,
      benefit: 0,
      catalog: 0,
      program: 0,
      job_result: 0,
      support: 0,
    };

    if (!activeUnified) {
      issues.push({
        id: 0,
        section_type: 'ALL',
        title: 'Paket Home Content',
        issue_type: 'data',
        severity: 'error',
        message: 'Tidak ada paket Home Content yang berstatus aktif!',
      });

      return {
        timestamp: new Date().toISOString(),
        status: 'error',
        total_active: 0,
        issues_count: issues.length,
        section_counts: sectionCounts,
        vendor_render_parity: {
          db_active_count: 0,
          vendor_render_count: 0,
          is_synced: false,
          diff: 0,
        },
        issues,
      };
    }

    const item = this.formatItem(activeUnified);
    const p = item.payload as UnifiedHomePayload;

    if (p.hero) {
      sectionCounts.hero = 1;
      if (!p.hero.headline_main || !p.hero.headline_highlight || !p.hero.description) {
        issues.push({
          id: item.id,
          section_type: 'HERO',
          title: 'Hero Section',
          issue_type: 'data',
          severity: 'error',
          message: 'Teks headline atau deskripsi Hero belum lengkap.',
        });
      }
      if (p.hero.illustration_image && !this.checkFileExists(p.hero.illustration_image)) {
        issues.push({
          id: item.id,
          section_type: 'HERO',
          title: 'Gambar Ilustrasi Hero',
          issue_type: 'asset',
          severity: 'warning',
          message: `File "${p.hero.illustration_image}" tidak ditemukan di disk server (akan fallback ke SVG).`,
        });
      }
    }

    if (Array.isArray(p.benefits)) {
      sectionCounts.benefit = p.benefits.length;
      p.benefits.forEach((b, idx) => {
        if (!b.icon || !b.title || !b.description) {
          issues.push({
            id: item.id,
            section_type: 'BENEFIT',
            title: `Benefit #${idx + 1}`,
            issue_type: 'data',
            severity: 'error',
            message: `Data benefit #${idx + 1} belum lengkap.`,
          });
        }
        if (b.image && !this.checkFileExists(b.image)) {
          issues.push({
            id: item.id,
            section_type: 'BENEFIT',
            title: `Ikon/Gambar Benefit #${idx + 1}`,
            issue_type: 'asset',
            severity: 'warning',
            message: `File gambar "${b.image}" tidak ditemukan di disk server (akan fallback ke ikon emoji).`,
          });
        }
      });
    }

    if (Array.isArray(p.catalogs)) {
      sectionCounts.catalog = p.catalogs.length;
      p.catalogs.forEach((c, idx) => {
        if (!c.name || !c.link_url) {
          issues.push({
            id: item.id,
            section_type: 'CATALOG',
            title: `Catalog "${c.name || idx + 1}"`,
            issue_type: 'data',
            severity: 'error',
            message: `Nama atau Link URL katalog belum lengkap.`,
          });
        }
        if (c.image && !this.checkFileExists(c.image)) {
          issues.push({
            id: item.id,
            section_type: 'CATALOG',
            title: `Gambar Catalog "${c.name}"`,
            issue_type: 'asset',
            severity: 'warning',
            message: `File gambar "${c.image}" tidak ditemukan di disk server (akan fallback ke gradien).`,
          });
        }
      });
    }

    if (Array.isArray(p.programs)) {
      sectionCounts.program = p.programs.length;
    }

    if (Array.isArray(p.job_results)) {
      sectionCounts.job_result = p.job_results.length;
    }

    if (p.support) {
      sectionCounts.support = 1;
      if (!p.support.support_email && !p.support.support_phone) {
        issues.push({
          id: item.id,
          section_type: 'SUPPORT',
          title: 'Hubungi Tim Support',
          issue_type: 'data',
          severity: 'warning',
          message: 'Kontak support (email atau telepon) belum diisi.',
        });
      }
    }

    const hasError = issues.some((i) => i.severity === 'error');
    const hasWarning = issues.some((i) => i.severity === 'warning');
    const status = hasError ? 'error' : hasWarning ? 'warning' : 'ok';

    const decomposed = await this.findAllActive();

    return {
      timestamp: new Date().toISOString(),
      status,
      active_package_id: activeUnified.id,
      active_package_title: activeUnified.title,
      total_active: 1,
      decomposed_items_count: decomposed.length,
      issues_count: issues.length,
      section_counts: sectionCounts,
      vendor_render_parity: {
        db_active_count: 1,
        vendor_render_count: decomposed.length,
        is_synced: decomposed.length > 0,
        diff: 0,
      },
      issues,
    };
  }
}
