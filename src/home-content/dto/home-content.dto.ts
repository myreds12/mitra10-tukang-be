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

export const HOME_SECTIONS = ['UNIFIED_HOME', 'HERO', 'BENEFIT', 'CATALOG'] as const;
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
  support_phone: string; // e.g. "+6281234567890" (WhatsApp)
  support_hours?: string; // e.g. "Senin - Jumat, 08:00 - 17:00 WIB"
  support_note?: string;
}

export interface UnifiedHomePayload {
  hero: HeroPayload;
  benefits: BenefitPayload[];
  catalogs: CatalogPayload[];
  support: SupportPayload;
}

export type HomeContentPayload =
  | UnifiedHomePayload
  | HeroPayload
  | BenefitPayload
  | CatalogPayload;

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
      support_phone: support.support_phone || '+6281234567890',
      support_hours: support.support_hours || 'Senin - Jumat, 08:00 - 17:00 WIB',
      support_note: support.support_note || 'Tim kami siap membantu proses pendaftaran Anda.',
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
