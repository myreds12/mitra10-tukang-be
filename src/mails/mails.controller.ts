import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { MailType } from './enum/mail_type.enum';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { MailsService } from './mails.service';
import { CreateEmailMessageDto } from './dto/create-email-message.dto';
import { UpdateEmailMessageDto } from './dto/update-email-message.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { MailerService } from '@nestjs-modules/mailer';
import { existsSync } from 'fs';
import { resolve } from 'path';
import * as pug from 'pug';
import { TestSendEmailDto } from './dto/test-send-email.dto';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';

@ApiTags('Mails')
@Controller('mails')
export class MailsController {
  constructor(
    private readonly mailsService: MailsService,
    private readonly mailerService: MailerService,
  ) { }

  private getTemplatePath(templateName: string): string {
    const templateFullPath = resolve(process.cwd(), 'templates', templateName);

    return templateFullPath;
  }

  @UseGuards(JwtAuthGuard)
  @Delete('/history/:id')
  @HttpCode(200)
  async removeHistory(@Param('id') id: string) {
    const data = await this.mailsService.removeHistory(+id);
    return data;
  }

  @Get('types')
  getAvailableTypes() {
    const enumKeys = Object.keys(MailType).filter((key) => isNaN(Number(key)));
    const result = {};
    for (let i = 0; i < enumKeys.length; i++) {
      result[enumKeys[i]] = MailType[enumKeys[i]];
    }
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(201)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'header_files', maxCount: 10 },
      { name: 'footer_files', maxCount: 10 },
    ]),
  )
  async create(
    @Req() req: RequestWithUser,
    @Body() createEmailMessageDto: CreateEmailMessageDto,
    @UploadedFiles() files: { [name: string]: Express.Multer.File[] },
  ) {
    const user = req.user;
    const data = await this.mailsService.create(
      createEmailMessageDto,
      user.id,
      files,
    );
    return data;
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @HttpCode(200)
  async findAll(@Query() query: QueryParamsDto) {
    const data = await this.mailsService.findAll(query);
    return data;
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @HttpCode(200)
  async findOne(@Param('id') id: string) {
    const data = await this.mailsService.findOne(+id);
    return data;
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @HttpCode(200)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'header_files', maxCount: 10 },
      { name: 'footer_files', maxCount: 10 },
    ]),
  )
  async update(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() updateEmailMessageDto: UpdateEmailMessageDto,
    @UploadedFiles() files: { [name: string]: Express.Multer.File[] },
  ) {
    const user = req.user;
    const data = await this.mailsService.update(
      +id,
      updateEmailMessageDto,
      user.id,
      files,
    );

    return data;
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(200)
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    const user = req.user;
    const data = await this.mailsService.remove(+id, user.id);
    return data;
  }

  // ================================
  // PREVIEW EMAIL TEMPLATES (DEV ONLY)
  // ================================

  @Get('preview/vendor-approval')
  async previewVendorApprovalMail() {
    const baseUrl = 'https://instalasi.mitra10.com';
    const data = {
      company_name: 'PT Contoh Teknologi Indonesia',
      token: 'abc123exampleTokenXYZ456789abcdef',
      expires_hours: 48,
      username: 'vendor_ptycontekindo',
      password: 'M1tr410@2026',
      website_url: baseUrl,
      login_url: `${baseUrl}/login`,
    };

    const templatePath = this.getTemplatePath('vendor-approval.pug');
    const compiledFn = pug.compileFile(templatePath);
    const html = compiledFn({ data });

    return { html };
  }

  @Get('preview/vendor-rejection')
  async previewVendorRejectionMail(
    @Query('reason') reason: string = 'Dokumen pendukung tidak lengkap atau sudah kadaluarsa. Mohon perbaiki danupload ulang.',
  ) {
    const data = {
      company_name: 'PT Contoh Teknologi Indonesia',
      rejection_reason: reason,
      website_url: 'https://instalasi.mitra10.com',
    };

    const templatePath = this.getTemplatePath('vendor-rejection.pug');
    const compiledFn = pug.compileFile(templatePath);
    const html = compiledFn({ data });

    return { html };
  }

  // ================================
  // TEST SEND EMAIL (DIAGNOSTIC & TRACING)
  // ================================

  @Post('send-email')
  @HttpCode(200)
  async sendEmail(@Body() body: TestSendEmailDto) {
    return await this.mailsService.sendTestEmail(body.email);
  }

  @Post('test-send')
  @HttpCode(200)
  async testSend(@Body() body: TestSendEmailDto) {
    return await this.mailsService.sendTestEmail(body.email);
  }

  // ================================
  // TRACE REDIS & BULL QUEUE (DIAGNOSTIC)
  // ================================

  @Get('trace-redis')
  @ApiOperation({
    summary: 'Trace koneksi Redis & Bull Queue',
    description: 'Diagnostik koneksi TCP ke Redis, status client Bull Queue, dan statistik antrean email.',
  })
  async traceRedisGet() {
    return await this.mailsService.traceRedis();
  }

  @Post('trace-redis')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Trace koneksi Redis & Bull Queue (POST)',
    description: 'Diagnostik koneksi TCP ke Redis, status client Bull Queue, dan statistik antrean email.',
  })
  async traceRedisPost() {
    return await this.mailsService.traceRedis();
  }
}
