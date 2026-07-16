import {
    Controller,
    Post,
    Param,
    ParseIntPipe,
    UploadedFile,
    UseInterceptors,
    Req,
    Body,
    HttpCode,
    HttpStatus,
    BadRequestException,
    ServiceUnavailableException,
  } from '@nestjs/common';
  import { FileInterceptor } from '@nestjs/platform-express';
  import { ConfigService } from '@nestjs/config';
  import { Request } from 'express';
  
  @Controller('chat-proxy')
  export class ChatProxyController {
    constructor(private readonly configService: ConfigService) {}
  
    @Post('rooms/:roomId/upload')
    @HttpCode(HttpStatus.OK)
    @UseInterceptors(FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB - sama seperti live-chat-api
    }))
    async uploadFile(
      @Param('roomId', ParseIntPipe) roomId: number,
      @UploadedFile() file: Express.Multer.File,
      @Body('caption') caption: string,
      @Req() req: Request,
    ) {
      if (!file) {
        throw new BadRequestException('File tidak ditemukan');
      }
  
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        throw new BadRequestException('Authorization header diperlukan');
      }
  
      const liveChatApiUrl = this.configService.get<string>('LIVE_CHAT_API_URL');
      if (!liveChatApiUrl) {
        throw new ServiceUnavailableException(
          'LIVE_CHAT_API_URL belum dikonfigurasi di backend',
        );
      }
  
      const targetUrl = `${liveChatApiUrl}/rooms/${roomId}/upload`;
  
      const form = new FormData();
      const blob = new Blob([file.buffer], { type: file.mimetype });
      form.append('file', blob, file.originalname);
      if (caption) {
        form.append('caption', caption);
      }
  
      let response: Response;
      try {
        response = await fetch(targetUrl, {
          method: 'POST',
          body: form,
          headers: {
            Authorization: authHeader,
          },
        });
      } catch (err) {
        console.error('[ChatProxy] Gagal koneksi ke live-chat-api:', err);
        throw new ServiceUnavailableException(
          `Tidak dapat mengakses live-chat-api: ${err.message}`,
        );
      }
  
      const contentType = response.headers.get('content-type') || '';
      let responseData: any;
      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        const text = await response.text();
        responseData = { message: text };
      }
  
      if (!response.ok) {
        console.error('[ChatProxy] live-chat-api error:', response.status, responseData);
        throw new ServiceUnavailableException(
          `live-chat-api error ${response.status}: ${
            responseData?.message || JSON.stringify(responseData)
          }`,
        );
      }
  
      // Return same format as live-chat-api: { success: true, data: message }
      return responseData;
    }
  }
  