import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../common/decorator/user.decorator';
import { HomeStage, ProfileFlags, VendorPortalService, VendorPortalStatus } from './vendor-portal.service';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { VendorPortalGateway } from './vendor-portal.gateway';

class UpdateStageDto {
  @IsIn(['pendaftaran', 'verifikasi', 'review_admin', 'approval', 'approved', 'rejected'])
  stage: HomeStage;

  @IsOptional()
  @IsString()
  stage_note?: string;
}

class UpdateProfileDto {
  @IsBoolean() company_data: boolean;
  @IsBoolean() legal_docs: boolean;
  @IsBoolean() portfolio_photos: boolean;
  @IsBoolean() certification: boolean;
  @IsBoolean() bank_account: boolean;
}

@Controller('vendor-portal')
export class VendorPortalController {
  constructor(
    private readonly service: VendorPortalService,
    private readonly gateway: VendorPortalGateway,
  ) {}

  /**
   * Public read endpoint — status pendaftaran vendor (stepper & profile completion).
   * Auth required — vendor must be logged in.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@User() user: any): Promise<VendorPortalStatus> {
    return this.service.getStatus({ userId: user?.id });
  }

  /**
   * Endpoint detail kelengkapan dokumen vendor yang sedang login
   */
  @Get('me/documents')
  @UseGuards(JwtAuthGuard)
  async getMyDocuments(@User() user: any) {
    return this.service.getDocuments({ userId: user?.id });
  }

  /**
   * Endpoint upload & update kelengkapan dokumen vendor (KTP, NPWP, Portofolio, SIUP, Bank)
   */
  @Post('me/documents')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'ktp_photo', maxCount: 1 },
        { name: 'npwp_photo', maxCount: 1 },
        { name: 'compro_photo', maxCount: 1 },
        { name: 'siup_photo', maxCount: 1 },
        { name: 'vendor_photo', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      },
    ),
  )
  async updateMyDocuments(
    @User() user: any,
    @Body() body: any,
    @UploadedFiles()
    files: {
      ktp_photo?: Express.Multer.File[];
      npwp_photo?: Express.Multer.File[];
      compro_photo?: Express.Multer.File[];
      siup_photo?: Express.Multer.File[];
      vendor_photo?: Express.Multer.File[];
    },
  ) {
    const res = await this.service.updateDocuments(
      { userId: user?.id },
      body,
      files,
    );
    if (res.status?.vendor_id) {
      this.gateway.publishStatusUpdate(res.status.vendor_id, res.status);
    }
    return res;
  }

  @Get(':vendorId')
  async getById(@Param('vendorId', ParseIntPipe) vendorId: number): Promise<VendorPortalStatus> {
    return this.service.getStatus({ vendorId });
  }

  @Get(':vendorId/documents')
  async getDocumentsById(@Param('vendorId', ParseIntPipe) vendorId: number) {
    return this.service.getDocuments({ vendorId });
  }

  @Post(':vendorId/documents')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'ktp_photo', maxCount: 1 },
        { name: 'npwp_photo', maxCount: 1 },
        { name: 'compro_photo', maxCount: 1 },
        { name: 'siup_photo', maxCount: 1 },
        { name: 'vendor_photo', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 },
      },
    ),
  )
  async updateDocumentsById(
    @Param('vendorId', ParseIntPipe) vendorId: number,
    @Body() body: any,
    @UploadedFiles()
    files: {
      ktp_photo?: Express.Multer.File[];
      npwp_photo?: Express.Multer.File[];
      compro_photo?: Express.Multer.File[];
      siup_photo?: Express.Multer.File[];
      vendor_photo?: Express.Multer.File[];
    },
  ) {
    const res = await this.service.updateDocuments(
      { vendorId },
      body,
      files,
    );
    this.gateway.publishStatusUpdate(vendorId, res.status);
    return res;
  }

  /**
   * Admin endpoints (for testing/management).
   */
  @Post(':vendorId/stage')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async updateStage(
    @Param('vendorId', ParseIntPipe) vendorId: number,
    @Body() body: UpdateStageDto,
  ): Promise<VendorPortalStatus> {
    const status = await this.service.updateStage(
      vendorId,
      body.stage,
      body.stage_note,
    );
    this.gateway.publishStatusUpdate(vendorId, status);
    return status;
  }

  @Post(':vendorId/profile')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async updateProfile(
    @Param('vendorId', ParseIntPipe) vendorId: number,
    @Body() body: UpdateProfileDto,
  ): Promise<VendorPortalStatus> {
    const profile: ProfileFlags = body;
    const status = await this.service.updateProfile(vendorId, profile);
    this.gateway.publishStatusUpdate(vendorId, status);
    return status;
  }
}
