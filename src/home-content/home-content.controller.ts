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
import { extname, join, resolve } from 'path';
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

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
      'Return semua home content dengan is_active=true, diurutkan per order_index lalu id. ' +
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

  @Get('admin/sync-check')
  @ApiOperation({
    summary: '[ADMIN] Cek sinkronisasi dan integritas data home content',
    description: 'Memvalidasi kelengkapan data per tipe, integritas file aset di disk, dan paritas render vendor.',
  })
  async verifySync(@User() user: any) {
    await this.service.assertAdminHOOrSuperUser(user?.id);
    return this.service.verifySync();
  }

  @Get('admin/active-unified')
  @ApiOperation({ summary: '[ADMIN] Ambil paket home content aktif saat ini' })
  async getActiveUnified(@User() user: any) {
    await this.service.assertAdminHOOrSuperUser(user?.id);
    return this.service.getActiveUnified();
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
  // ADMIN - Image upload (untuk HERO/CATALOG)
  // ================================

  @Post('admin/upload-image')
  @ApiOperation({
    summary: '[ADMIN] Upload gambar untuk HERO illustration atau CATALOG tile',
    description: 'Return image_url relatif yang bisa disimpan di field payload home_content.',
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
              'Tipe file tidak diizinkan. Hanya JPG/JPEG, PNG, atau WEBP maksimal 2MB.',
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

    const storageDir = resolve(process.cwd(), 'storage', 'home-content');
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }
    const uploadsDir = resolve(process.cwd(), 'uploads', 'home-content');
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const fileName = `home-${uniqueSuffix}${extname(file.originalname).toLowerCase()}`;
    const storageFilePath = join(storageDir, fileName);
    const uploadsFilePath = join(uploadsDir, fileName);

    // Save to storage/home-content/ and mirrored in uploads/home-content/
    writeFileSync(storageFilePath, file.buffer);
    try {
      writeFileSync(uploadsFilePath, file.buffer);
    } catch {
      // ignore
    }

    return {
      success: true,
      data: {
        image_url: `storage/home-content/${fileName}`,
        file_url: `${req.protocol}://${req.get('host')}/storage/home-content/${fileName}`,
        file_name: file.originalname,
        size: file.size,
        mime_type: file.mimetype,
      },
    };
  }

  @Post('upload-image')
  @ApiOperation({ summary: '[ADMIN ALIAS] Upload gambar' })
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
              'Tipe file tidak diizinkan. Hanya JPG/JPEG, PNG, atau WEBP maksimal 2MB.',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadImageAlias(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: ExpressRequest,
    @User() user: any,
  ) {
    return this.uploadImage(file, req, user);
  }

  // ================================
  // ADMIN - Video upload (untuk Portofolio video)
  // ================================

  @Post('admin/upload-video')
  @ApiOperation({
    summary: '[ADMIN] Upload video untuk portofolio hasil pekerjaan',
    description: 'Format MP4/WebM/MOV maksimal 30MB. Return video_url relatif di storage/home-content/.',
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
      limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
      fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
        const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|webm|mov|mkv)$/i)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Tipe file video tidak diizinkan. Hanya MP4, WebM, atau MOV maksimal 30MB.',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: ExpressRequest,
    @User() user: any,
  ) {
    await this.service.assertAdminHOOrSuperUser(user?.id);
    if (!file) {
      throw new BadRequestException('File video tidak ditemukan.');
    }

    const storageDir = resolve(process.cwd(), 'storage', 'home-content');
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }
    const uploadsDir = resolve(process.cwd(), 'uploads', 'home-content');
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const fileName = `video-${uniqueSuffix}${extname(file.originalname).toLowerCase()}`;
    const storageFilePath = join(storageDir, fileName);
    const uploadsFilePath = join(uploadsDir, fileName);

    writeFileSync(storageFilePath, file.buffer);
    try {
      writeFileSync(uploadsFilePath, file.buffer);
    } catch {
      // ignore
    }

    return {
      success: true,
      data: {
        video_url: `storage/home-content/${fileName}`,
        file_url: `${req.protocol}://${req.get('host')}/storage/home-content/${fileName}`,
        file_name: file.originalname,
        size: file.size,
        mime_type: file.mimetype,
      },
    };
  }

  @Post('upload-video')
  @ApiOperation({ summary: '[ADMIN ALIAS] Upload video' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 30 * 1024 * 1024 },
      fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
        const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|webm|mov|mkv)$/i)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Tipe file video tidak diizinkan. Hanya MP4, WebM, atau MOV maksimal 30MB.',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadVideoAlias(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: ExpressRequest,
    @User() user: any,
  ) {
    return this.uploadVideo(file, req, user);
  }
}
