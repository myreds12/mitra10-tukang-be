import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request as ExpressRequest } from 'express';
import { extname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../common/decorator/user.decorator';
import { resolveUploadPath } from '../common/utils/upload-path.util';
import { HomeContentService } from './home-content.service';
import {
  CreateHomeContentDto,
  UpdateHomeContentDto,
} from './dto/home-content.dto';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

@ApiTags('Home Content')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('home-content')
export class HomeContentController {
  constructor(private readonly service: HomeContentService) {}

  // ================================
  // PUBLIC (any auth user) - read-only, is_active=true only
  // ================================

  @Get()
  @ApiOperation({
    summary: '[PUBLIC] Ambil home content aktif',
    description:
      'Return semua home content dengan is_active=true, diurutkan per section lalu order_index. ' +
      'Untuk dashboard pendaftar vendor dan homepage Instalasi portal.',
  })
  @ApiResponse({ status: 200, description: 'Returns active home content' })
  async findAllActive() {
    return this.service.findAllActive();
  }

  // ================================
  // ADMIN (Admin HO / Super User only)
  // ================================

  @Get('admin')
  @ApiOperation({
    summary: '[ADMIN] List semua home content (active + inactive)',
    description: 'Role-check: Admin HO / Super User. Untuk halaman settings.',
  })
  async findAll(@User() user: any) {
    await this.service.assertAdminHOOrSuperUser(user?.id);
    return this.service.findAll();
  }

  @Get('admin/:id')
  @ApiOperation({ summary: '[ADMIN] Detail 1 home content' })
  async findOne(@Param('id', ParseIntPipe) id: number, @User() user: any) {
    await this.service.assertAdminHOOrSuperUser(user?.id);
    return this.service.findOne(id);
  }

  @Post('admin')
  @ApiOperation({ summary: '[ADMIN] Tambah home content baru' })
  async create(@Body() dto: CreateHomeContentDto, @User() user: any) {
    return this.service.create(dto, user?.id);
  }

  @Put('admin/:id')
  @ApiOperation({ summary: '[ADMIN] Update home content' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHomeContentDto,
    @User() user: any,
  ) {
    return this.service.update(id, dto, user?.id);
  }

  @Delete('admin/:id')
  @ApiOperation({ summary: '[ADMIN] Hapus home content' })
  async remove(@Param('id', ParseIntPipe) id: number, @User() user: any) {
    return this.service.remove(id, user?.id);
  }

  // ================================
  // ADMIN - Image upload (untuk HERO/BANNER section)
  // ================================

  @Post('admin/upload-image')
  @ApiOperation({
    summary: '[ADMIN] Upload gambar untuk HERO/BANNER',
    description: 'Return image_url relatif yang bisa disimpan di field image_url home_content.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_SIZE },
      fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
        if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Tipe file tidak diizinkan. Hanya JPEG/PNG/WEBP/GIF.',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: ExpressRequest,
    @User() user: any,
  ) {
    await this.service.assertAdminHOOrSuperUser(user?.id);
    if (!file) {
      throw new BadRequestException('File tidak ditemukan.');
    }

    const uploadDir = resolveUploadPath('home-content');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const fileName = `home-${uniqueSuffix}${extname(file.originalname)}`;
    const filePath = join(uploadDir, fileName);
    writeFileSync(filePath, file.buffer);

    return {
      success: true,
      data: {
        image_url: `uploads/home-content/${fileName}`,
        file_url: `${req.protocol}://${req.get('host')}/public/home-content/${fileName}`,
        file_name: file.originalname,
        size: file.size,
        mime_type: file.mimetype,
      },
    };
  }
}
