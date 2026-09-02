import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../common/decorator/user.decorator';
import { HomeStage, ProfileFlags, VendorPortalService, VendorPortalStatus } from './vendor-portal.service';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
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
   * Public read endpoint — used for initial render fallback when WS not connected
   * (e.g. server-side render or before WS handshake).
   * Auth required — vendor must be logged in.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@User() user: any): Promise<VendorPortalStatus> {
    // For the registrant dashboard, look up by user_id
    // (vendor_registration.user_id is set after approval)
    return this.service.getStatus({ userId: user?.id });
  }

  @Get(':vendorId')
  async getById(@Param('vendorId', ParseIntPipe) vendorId: number): Promise<VendorPortalStatus> {
    return this.service.getStatus({ vendorId });
  }

  /**
   * Admin endpoints (for testing/management).
   * In real ops these would be behind an admin role-guard.
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
