import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsIn,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';

export const HOME_SECTIONS = [
  'UNIFIED_HOME',
  'HERO',
  'BENEFIT',
  'BANNER',
  'CATALOG',
  'PROGRAM_BERJALAN',
  'HASIL_PEKERJAAN',
] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

export type BenefitAccentColor = 'brand-blue' | 'brand-red' | 'brand-yellow';
export type CatalogButtonStyle = 'primary' | 'secondary';

export interface HeroPayload {
  headline_main: string;
  headline_highlight: string;
  description: string;
  illustration_image?: string | null;
}

export interface BenefitPayload {
  icon: string; // Karakter emoji, e.g. 📦 💰 🧾 🛡️ ⭐ 🎓
  title: string;
  description: string;
  accent_color: BenefitAccentColor;
  image?: string | null;
}

export interface CatalogPayload {
  name: string;
  image?: string | null;
  icon_fallback?: string | null;
  badge_text?: string | null;
  link_url: string;
  button_label?: string;
  button_style?: CatalogButtonStyle;
}

export interface SupportPayload {
  support_label: string; // e.g. "Hubungi Tim Support"
  support_email: string; // e.g. "vendor-support@mitra10.com"
  support_phone?: string;
  support_hours?: string; // e.g. "Senin - Jumat, 08:00 - 17:00 WIB"
  support_note?: string;
  yellow_ai_bot_id?: string;
}

export interface ProgramBerjalanPayload {
  title?: string | null;
  description: string; // Free text (bisa diinject image/markdown)
  image_url?: string | null; // Banner opsional atau gambar utama
  badge_label?: string | null;
  cta_label?: string | null;
  link_url?: string | null;
  order_index?: number;
  is_active?: boolean;
}

export type PortfolioMediaType = 'before_after' | 'video';

export interface HasilPekerjaanPayload {
  title: string;
  description: string;
  media_type?: PortfolioMediaType; // 'before_after' (2 gambar) atau 'video'
  image_before_url?: string | null; // Foto Sebelum
  image_after_url?: string | null; // Foto Sesudah
  video_url?: string | null; // URL video (upload atau embed)
  badge_label?: string | null;
  order_index?: number;
  is_active?: boolean;
}

export type ProgramPayload = ProgramBerjalanPayload;
export type JobResultPayload = HasilPekerjaanPayload;

export interface UnifiedHomePayload {
  hero: HeroPayload;
  benefits: BenefitPayload[];
  catalogs: CatalogPayload[];
  programs?: ProgramBerjalanPayload[];
  job_results?: HasilPekerjaanPayload[];
  support: SupportPayload;
}

export type HomeContentPayload =
  | UnifiedHomePayload
  | HeroPayload
  | BenefitPayload
  | CatalogPayload
  | ProgramBerjalanPayload
  | HasilPekerjaanPayload;

/**
 * Validasi payload server-side (mendukung Unified Home Content dan section individual).
 */
export function validateSectionPayload(
  section: string,
  payload: any,
): HomeContentPayload {
  if (!payload || typeof payload !== 'object') {
    throw new BadRequestException('Field `payload` wajib berupa objek JSON.');
  }

  const errors: string[] = [];

  // UNIFIED_HOME: Satu kesatuan seluruh konten home
  if (section === 'UNIFIED_HOME') {
    if (!payload.hero || typeof payload.hero !== 'object') {
      errors.push('UNIFIED_HOME: Objek `hero` wajib diisi.');
    } else {
      if (!payload.hero.headline_main) errors.push('HERO: `headline_main` wajib diisi.');
      if (!payload.hero.headline_highlight) errors.push('HERO: `headline_highlight` wajib diisi.');
      if (!payload.hero.description) errors.push('HERO: `description` wajib diisi.');
    }

    if (!Array.isArray(payload.benefits) || payload.benefits.length === 0) {
      errors.push('UNIFIED_HOME: Minimal harus ada 1 item `benefits`.');
    } else {
      payload.benefits.forEach((b: any, idx: number) => {
        if (!b.icon) errors.push(`BENEFIT #${idx + 1}: Icon emoji wajib diisi.`);
        if (!b.title) errors.push(`BENEFIT #${idx + 1}: Judul wajib diisi.`);
        if (!b.description) errors.push(`BENEFIT #${idx + 1}: Deskripsi wajib diisi.`);
      });
    }

    if (!Array.isArray(payload.catalogs) || payload.catalogs.length === 0) {
      errors.push('UNIFIED_HOME: Minimal harus ada 1 item `catalogs`.');
    } else {
      payload.catalogs.forEach((c: any, idx: number) => {
        if (!c.name) errors.push(`CATALOG #${idx + 1}: Nama kategori wajib diisi.`);
        if (!c.link_url) errors.push(`CATALOG #${idx + 1}: Link URL wajib diisi.`);
        if (!c.image && !c.icon_fallback) {
          errors.push(`CATALOG #${idx + 1}: Icon fallback wajib diisi jika gambar kosong.`);
        }
      });
    }

    // Support info validation
    const support = payload.support || {};
    const normalizedSupport: SupportPayload = {
      support_label: support.support_label || 'Hubungi Tim Support',
      support_email: support.support_email || 'vendor-support@mitra10.com',
      support_phone: support.support_phone || '',
      support_hours: support.support_hours || 'Senin - Jumat, 08:00 - 17:00 WIB',
      support_note: support.support_note || 'Tim kami siap membantu proses pendaftaran Anda.',
      yellow_ai_bot_id: support.yellow_ai_bot_id || 'x1657090256339',
    };

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    return {
      hero: {
        headline_main: String(payload.hero.headline_main).trim(),
        headline_highlight: String(payload.hero.headline_highlight).trim(),
        description: String(payload.hero.description).trim(),
        illustration_image: payload.hero.illustration_image ? String(payload.hero.illustration_image).trim() : null,
      },
      benefits: payload.benefits.map((b: any) => ({
        icon: String(b.icon || '📦').trim(),
        title: String(b.title || '').trim(),
        description: String(b.description || '').trim(),
        accent_color: (b.accent_color || 'brand-blue') as BenefitAccentColor,
        image: b.image ? String(b.image).trim() : null,
      })),
      catalogs: payload.catalogs.map((c: any) => ({
        name: String(c.name || '').trim(),
        image: c.image ? String(c.image).trim() : null,
        icon_fallback: c.icon_fallback ? String(c.icon_fallback).trim() : '💡',
        badge_text: c.badge_text ? String(c.badge_text).trim() : null,
        link_url: String(c.link_url || 'https://www.mitra10.com').trim(),
        button_label: c.button_label ? String(c.button_label).trim() : 'Lihat Produk →',
        button_style: (c.button_style === 'secondary' ? 'secondary' : 'primary') as CatalogButtonStyle,
      })),
      programs: Array.isArray(payload.programs)
        ? payload.programs.map((p: any, idx: number) => ({
            title: String(p.title || '').trim(),
            description: String(p.description || '').trim(),
            image_url: p.image_url || p.image ? String(p.image_url || p.image).trim() : null,
            image: p.image_url || p.image ? String(p.image_url || p.image).trim() : null,
            badge_label: p.badge_label || p.badge ? String(p.badge_label || p.badge).trim() : null,
            badge: p.badge_label || p.badge ? String(p.badge_label || p.badge).trim() : null,
            cta_label: p.cta_label ? String(p.cta_label).trim() : null,
            link_url: p.link_url ? String(p.link_url).trim() : null,
            order_index: typeof p.order_index === 'number' ? p.order_index : idx + 1,
            is_active: typeof p.is_active === 'boolean' ? p.is_active : true,
          }))
        : [],
      job_results: Array.isArray(payload.job_results)
        ? payload.job_results.map((j: any, idx: number) => {
            const isVideo = j.media_type === 'video' || Boolean(j.video_url);
            return {
              title: String(j.title || '').trim(),
              description: String(j.description || '').trim(),
              media_type: (isVideo ? 'video' : 'before_after') as PortfolioMediaType,
              image_before_url: j.image_before_url || j.before_image ? String(j.image_before_url || j.before_image).trim() : null,
              before_image: j.image_before_url || j.before_image ? String(j.image_before_url || j.before_image).trim() : null,
              image_after_url: j.image_after_url || j.image ? String(j.image_after_url || j.image).trim() : null,
              image: j.image_after_url || j.image ? String(j.image_after_url || j.image).trim() : null,
              video_url: j.video_url ? String(j.video_url).trim() : null,
              badge_label: j.badge_label || j.tag ? String(j.badge_label || j.tag).trim() : null,
              tag: j.badge_label || j.tag ? String(j.badge_label || j.tag).trim() : null,
              order_index: typeof j.order_index === 'number' ? j.order_index : idx + 1,
              is_active: typeof j.is_active === 'boolean' ? j.is_active : true,
            };
          })
        : [],
      support: normalizedSupport,
    };
  }

  // HERO Individual
  if (section === 'HERO') {
    if (!payload.headline_main || typeof payload.headline_main !== 'string' || !payload.headline_main.trim()) {
      errors.push('HERO: `headline_main` wajib diisi.');
    }
    if (!payload.headline_highlight || typeof payload.headline_highlight !== 'string' || !payload.headline_highlight.trim()) {
      errors.push('HERO: `headline_highlight` wajib diisi.');
    }
    if (!payload.description || typeof payload.description !== 'string' || !payload.description.trim()) {
      errors.push('HERO: `description` wajib diisi.');
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    return {
      headline_main: String(payload.headline_main).trim(),
      headline_highlight: String(payload.headline_highlight).trim(),
      description: String(payload.description).trim(),
      illustration_image: payload.illustration_image ? String(payload.illustration_image).trim() : null,
    };
  }

  // BENEFIT Individual
  if (section === 'BENEFIT') {
    if (!payload.icon || typeof payload.icon !== 'string' || !payload.icon.trim()) {
      errors.push('BENEFIT: `icon` wajib diisi (karakter emoji).');
    }
    if (!payload.title || typeof payload.title !== 'string' || !payload.title.trim()) {
      errors.push('BENEFIT: `title` wajib diisi.');
    }
    if (!payload.description || typeof payload.description !== 'string' || !payload.description.trim()) {
      errors.push('BENEFIT: `description` wajib diisi.');
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    return {
      icon: String(payload.icon).trim(),
      title: String(payload.title).trim(),
      description: String(payload.description).trim(),
      accent_color: (payload.accent_color || 'brand-blue') as BenefitAccentColor,
      image: payload.image ? String(payload.image).trim() : null,
    };
  }

  // CATALOG Individual
  if (section === 'CATALOG') {
    if (!payload.name || typeof payload.name !== 'string' || !payload.name.trim()) {
      errors.push('CATALOG: `name` kategori wajib diisi.');
    }
    if (!payload.link_url || typeof payload.link_url !== 'string' || !payload.link_url.trim()) {
      errors.push('CATALOG: `link_url` wajib diisi.');
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    return {
      name: String(payload.name).trim(),
      image: payload.image ? String(payload.image).trim() : null,
      icon_fallback: payload.icon_fallback ? String(payload.icon_fallback).trim() : '💡',
      badge_text: payload.badge_text ? String(payload.badge_text).trim() : null,
      link_url: String(payload.link_url).trim(),
      button_label: payload.button_label ? String(payload.button_label).trim() : 'Lihat Produk →',
      button_style: (payload.button_style === 'secondary' ? 'secondary' : 'primary') as CatalogButtonStyle,
    };
  }

  // PROGRAM_BERJALAN Individual
  if (section === 'PROGRAM_BERJALAN' || section === 'PROGRAM') {
    if (!payload.description || typeof payload.description !== 'string' || !payload.description.trim()) {
      errors.push('PROGRAM_BERJALAN: `description` (free text) wajib diisi.');
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    const imageUrl = payload.image_url || payload.image;
    return {
      title: payload.title ? String(payload.title).trim() : null,
      description: String(payload.description).trim(),
      image_url: imageUrl ? String(imageUrl).trim() : null,
      badge_label: payload.badge_label || payload.badge ? String(payload.badge_label || payload.badge).trim() : null,
      cta_label: payload.cta_label ? String(payload.cta_label).trim() : null,
      link_url: payload.link_url ? String(payload.link_url).trim() : null,
      order_index: typeof payload.order_index === 'number' ? payload.order_index : 0,
      is_active: typeof payload.is_active === 'boolean' ? payload.is_active : true,
    };
  }

  // HASIL_PEKERJAAN Individual
  if (section === 'HASIL_PEKERJAAN' || section === 'JOB_RESULT') {
    if (!payload.title || typeof payload.title !== 'string' || !payload.title.trim()) {
      errors.push('HASIL_PEKERJAAN: `title` wajib diisi.');
    }
    const isVideo = payload.media_type === 'video' || Boolean(payload.video_url);
    const mediaType: PortfolioMediaType = isVideo ? 'video' : 'before_after';

    if (mediaType === 'video') {
      if (!payload.video_url || typeof payload.video_url !== 'string' || !payload.video_url.trim()) {
        errors.push('HASIL_PEKERJAAN: `video_url` wajib diisi untuk tipe video.');
      }
    } else {
      const imageBeforeUrl = payload.image_before_url || payload.before_image || payload.image;
      if (!imageBeforeUrl || typeof imageBeforeUrl !== 'string' || !imageBeforeUrl.trim()) {
        errors.push('HASIL_PEKERJAAN: `image_before_url` (foto sebelum) wajib diisi untuk tipe before-after.');
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    const imageBeforeUrl = payload.image_before_url || payload.before_image || payload.image;
    return {
      title: String(payload.title).trim(),
      description: String(payload.description || '').trim(),
      media_type: mediaType,
      image_before_url: imageBeforeUrl ? String(imageBeforeUrl).trim() : null,
      image_after_url: payload.image_after_url ? String(payload.image_after_url).trim() : null,
      video_url: payload.video_url ? String(payload.video_url).trim() : null,
      badge_label: payload.badge_label || payload.tag ? String(payload.badge_label || payload.tag).trim() : null,
      order_index: typeof payload.order_index === 'number' ? payload.order_index : 0,
      is_active: typeof payload.is_active === 'boolean' ? payload.is_active : true,
    };
  }

  throw new BadRequestException(`Tipe section "${section}" tidak didukung.`);
}

export class CreateHomeContentDto {
  @ApiPropertyOptional({
    description: 'Nama/Judul Paket Konten Home',
    example: 'Konten Home Vendor - Versi Utama',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Section type (default: UNIFIED_HOME)',
    enum: HOME_SECTIONS,
    example: 'UNIFIED_HOME',
  })
  @IsOptional()
  @IsString()
  @IsIn([...HOME_SECTIONS])
  section_type?: HomeSection;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsIn([...HOME_SECTIONS])
  section?: HomeSection;

  @ApiPropertyOptional({ description: 'Badge label (e.g. Promo Spesial / Before - After)' })
  @IsOptional()
  @IsString()
  badge_label?: string;

  @ApiPropertyOptional({ description: 'CTA button label' })
  @IsOptional()
  @IsString()
  cta_label?: string;

  @ApiPropertyOptional({ description: 'Foto utama / Program image' })
  @IsOptional()
  @IsString()
  image_url?: string;

  @ApiPropertyOptional({ description: 'Foto sebelum / before' })
  @IsOptional()
  @IsString()
  image_before_url?: string;

  @ApiPropertyOptional({ description: 'Foto sesudah / after' })
  @IsOptional()
  @IsString()
  image_after_url?: string;

  @ApiPropertyOptional({ description: 'Video URL hasil pekerjaan (upload atau direct)' })
  @IsOptional()
  @IsString()
  video_url?: string;

  @ApiPropertyOptional({ description: 'Media type portofolio', enum: ['before_after', 'video'] })
  @IsOptional()
  @IsString()
  @IsIn(['before_after', 'video'])
  media_type?: 'before_after' | 'video';

  @ApiProperty({
    description: 'Payload konten (UnifiedHomePayload atau section payload)',
  })
  payload: Record<string, any>;

  @ApiPropertyOptional({ description: 'Urutan tampil (ascending)', example: 1, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;

  @ApiPropertyOptional({ description: 'Status aktif', example: true, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Status enum: active | inactive', example: 'active' })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class UpdateHomeContentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ enum: HOME_SECTIONS })
  @IsOptional()
  @IsString()
  @IsIn([...HOME_SECTIONS])
  section_type?: HomeSection;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsIn([...HOME_SECTIONS])
  section?: HomeSection;

  @ApiPropertyOptional({ description: 'Badge label (e.g. Promo Spesial / Before - After)' })
  @IsOptional()
  @IsString()
  badge_label?: string;

  @ApiPropertyOptional({ description: 'CTA button label' })
  @IsOptional()
  @IsString()
  cta_label?: string;

  @ApiPropertyOptional({ description: 'Foto utama / Program image' })
  @IsOptional()
  @IsString()
  image_url?: string;

  @ApiPropertyOptional({ description: 'Foto sebelum / before' })
  @IsOptional()
  @IsString()
  image_before_url?: string;

  @ApiPropertyOptional({ description: 'Foto sesudah / after' })
  @IsOptional()
  @IsString()
  image_after_url?: string;

  @ApiPropertyOptional({ description: 'Video URL hasil pekerjaan (upload atau direct)' })
  @IsOptional()
  @IsString()
  video_url?: string;

  @ApiPropertyOptional({ description: 'Media type portofolio', enum: ['before_after', 'video'] })
  @IsOptional()
  @IsString()
  @IsIn(['before_after', 'video'])
  media_type?: 'before_after' | 'video';

  @ApiPropertyOptional({
    description: 'Payload konten',
  })
  @IsOptional()
  payload?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Urutan tampil (ascending)', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;

  @ApiPropertyOptional({ description: 'Status aktif' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Status enum: active | inactive' })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
