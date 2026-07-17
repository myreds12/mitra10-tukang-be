import {
  Controller,
  Post,
  Param,
  ParseIntPipe,
  UploadedFile,
  UseInterceptors,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { extname } from 'path';
import { diskStorage } from 'multer';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';

// Same mime types as live-chat-api
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/mpeg',
];
const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const ALLOWED_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...VIDEO_MIME_TYPES,
  ...DOCUMENT_MIME_TYPES,
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Configure multer storage
const storage = diskStorage({
  destination: (req, file, cb) => {
    cb(null, resolveUploadPath());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Tipe file tidak diizinkan'), false);
  }
};

@Controller('chat-proxy')
export class ChatProxyController {
  constructor(private readonly configService: ConfigService) {}

  @Post('rooms/:roomId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      fileFilter,
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async uploadFile(
    @Param('roomId', ParseIntPipe) roomId: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('File tidak ditemukan');
    }

    const baseUrl =
      this.configService.get<string>('API_URL')?.replace('/api', '') ||
      `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/public/${file.filename}`;

    // Determine file type
    const isVideo = VIDEO_MIME_TYPES.includes(file.mimetype);
    const type = IMAGE_MIME_TYPES.includes(file.mimetype) ? 'image' : 'file';

    return {
      success: true,
      data: {
        id: 0, // Placeholder - not used by FE for file messages
        roomId,
        content: fileUrl,
        fileName: file.originalname,
        fileUrl,
        type,
        mimeType: file.mimetype,
        size: file.size,
        isVideo,
        caption: null,
        senderId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }
}
