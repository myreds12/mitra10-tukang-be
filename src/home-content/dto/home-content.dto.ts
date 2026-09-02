import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const HOME_SECTIONS = ['HERO', 'BENEFIT', 'BANNER', 'CATALOG'] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

export class CreateHomeContentDto {
  @ApiProperty({
    description: 'Section key',
    enum: HOME_SECTIONS,
    example: 'HERO',
  })
  @IsString()
  @IsIn([...HOME_SECTIONS])
  section: HomeSection;

  @ApiPropertyOptional({ description: 'Judul konten', example: 'Bergabung & Tumbuh Bersama Mitra10' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Sub-judul (untuk HERO)', example: 'Menjadi bagian dari jaringan...' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Deskripsi panjang (untuk BENEFIT/CATALOG)' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'FontAwesome icon key (untuk BENEFIT/CATALOG)', example: 'briefcase' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({ description: 'Path gambar (untuk HERO/BANNER). Hasil dari /upload-image endpoint', example: 'uploads/home-content/abc.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  image_url?: string;

  @ApiPropertyOptional({ description: 'Urutan tampil (ascending)', example: 1, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;

  @ApiPropertyOptional({ description: 'Status aktif', example: true, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHomeContentDto {
  @ApiPropertyOptional({ enum: HOME_SECTIONS })
  @IsOptional()
  @IsString()
  @IsIn([...HOME_SECTIONS])
  section?: HomeSection;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  image_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
