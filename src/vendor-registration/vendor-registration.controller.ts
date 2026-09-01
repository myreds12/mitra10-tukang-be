/* eslint-disable prettier/prettier */
import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VendorRegistrationService } from './vendor-registration.service';
import {
  RegisterVendorDto,
  QueryVendorRegistrationDto,
  ApproveVendorRegistrationDto,
  RejectVendorRegistrationDto,
  UpdateTermsAndConditionsDto,
} from './dto/vendor-registration.dto';
import { User } from 'src/common/decorator/user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@ApiTags('Vendor Registration')
@ApiBearerAuth()
@Controller('vendor-registration')
export class VendorRegistrationController {
  constructor(private readonly service: VendorRegistrationService) {}

  // ================================
  // PUBLIC: VENDOR REGISTRATION
  // ================================

  @Post('register')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'vendor_photo', maxCount: 1 },
      { name: 'ktp_photo', maxCount: 1 },
      { name: 'npwp_photo', maxCount: 1 },
      { name: 'compro_photo', maxCount: 1 },
      { name: 'surat_permohonan_photo', maxCount: 1 },
      { name: 'pks_photo', maxCount: 1 },
      { name: 'siup_photo', maxCount: 1 },
    ], {
      limits: {
        fileSize: 10 * 1024 * 1024,
      }
    }),
  )
  @ApiOperation({
    summary: '[PUBLIC] Register New Vendor',
    description: 'Submit a new vendor registration application. System will send confirmation email with registration token.',
  })
  @ApiResponse({ status: 201, description: 'Registration submitted successfully. Check email for token.' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async registerVendor(
    @Body() dto: RegisterVendorDto,
    @UploadedFiles() files: any,
  ) {
    return this.service.registerVendor(dto, files);
  }

  // ================================
  // PUBLIC: TERMS & CONDITIONS (T&C)
  // ================================
  // Catatan: route spesifik ini HARUS berada di atas @Get(':id') supaya tidak
  // tertangkap sebagai parameter id.

  @Get('terms-and-conditions')
  @ApiOperation({
    summary: '[PUBLIC] Get Active Terms & Conditions',
    description:
      'Ambil dokumen Syarat & Ketentuan aktif (HTML) untuk ditampilkan read-only. Tidak ada file yang bisa didownload - hanya konten untuk di-render.',
  })
  @ApiResponse({ status: 200, description: 'Returns active terms and conditions content' })
  @ApiResponse({ status: 404, description: 'No active terms and conditions found' })
  async getActiveTermsAndConditions() {
    return this.service.getActiveTermsAndConditions();
  }

  @Put('terms-and-conditions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN HO / SUPER USER] Update Terms & Conditions',
    description: 'Update konten T&C (HTML) tanpa redeploy. Membuat versi baru dan menonaktifkan versi lama.',
  })
  @ApiResponse({ status: 200, description: 'Terms and conditions updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin HO / Super User only' })
  async updateTermsAndConditions(
    @Body() dto: UpdateTermsAndConditionsDto,
    @User() user: any,
  ) {
    return this.service.updateTermsAndConditions(dto, user?.id);
  }

  // ================================
  // REGISTRANT (PENDAFTAR) DASHBOARD
  // ================================
  // Endpoint khusus role "Pendaftar Vendor" - ownership di-check di service
  // (role-check manual via getRoleName, tanpa CASL/PermissionsGuard).

  @Get('me/registrations')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[PENDAFTAR] Get My Registrations',
    description: 'Daftar pendaftaran vendor milik user yang login saja (ownership via user_id). Bukan semua pendaftar.',
  })
  @ApiResponse({ status: 200, description: 'Returns registrations owned by the current user' })
  @ApiResponse({ status: 403, description: 'Forbidden - Pendaftar Vendor role only' })
  async findMyRegistrations(@User() user: any) {
    return this.service.findMyRegistrations(user?.id);
  }

  @Get('me/profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[PENDAFTAR] Get My Registrant Profile',
    description: 'Profil ringkas akun pendaftar + pendaftaran terakhir untuk header dashboard.',
  })
  @ApiResponse({ status: 200, description: 'Returns registrant profile' })
  @ApiResponse({ status: 403, description: 'Forbidden - Pendaftar Vendor role only' })
  async getMyRegistrantProfile(@User() user: any) {
    return this.service.getMyRegistrantProfile(user?.id);
  }

  @Get('me/home')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[PENDAFTAR] Get Home Content',
    description: 'Konten statis halaman Home dashboard pendaftar (info & benefit Mitra10).',
  })
  @ApiResponse({ status: 200, description: 'Returns home content' })
  @ApiResponse({ status: 403, description: 'Forbidden - Pendaftar Vendor role only' })
  async getRegistrantHomeContent(@User() user: any) {
    await this.service.assertRegistrantAccess(user?.id);
    return this.service.getRegistrantHomeContent();
  }

  // ================================
  // ADMIN: MANAGE REGISTRATIONS
  // ================================

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN] Get Registration Statistics',
    description: 'Get summary statistics of vendor registrations (pending, approved, rejected counts)',
  })
  @ApiResponse({ status: 200, description: 'Returns registration statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRegistrationStats(@User() user: any) {
    return this.service.getRegistrationStats(user?.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN] Get All Registrations',
    description: 'Retrieve paginated list of all vendor registrations with optional filters',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number, example: 1 })
  @ApiQuery({ name: 'take', required: false, description: 'Records per page', type: Number, example: 10 })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (1=Menunggu Approve, 2=Proses Pitching, 3=Disetujui, 4=Ditolak)', type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Search by company name or email' })
  @ApiQuery({ name: 'company_name', required: false, description: 'Filter by company name' })
  @ApiQuery({ name: 'date_from', required: false, description: 'Filter date from (YYYY-MM-DD)' })
  @ApiQuery({ name: 'date_to', required: false, description: 'Filter date to (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved registrations' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAllRegistrations(
    @Query() query: QueryVendorRegistrationDto,
    @User() user: any,
  ) {
    return this.service.findAllRegistrations(query, user?.id);
  }

  @Get(':id/history')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN] Get Registration History',
    description: 'Retrieve approval and status transition history for a vendor registration',
  })
  @ApiParam({ name: 'id', description: 'Registration ID', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Successfully retrieved registration history' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async getRegistrationHistory(
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    return this.service.getRegistrationHistory(id, user?.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN] Get Registration by ID',
    description: 'Retrieve a specific vendor registration by its ID',
  })
  @ApiParam({ name: 'id', description: 'Registration ID', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Successfully retrieved registration' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async findOneRegistration(
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    return this.service.findOneRegistration(id, user?.id);
  }

  @Put(':id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN] Approve Vendor Registration',
    description: 'Stage-aware approval. Menunggu Approve becomes Proses Pitching; Proses Pitching becomes Disetujui and creates vendor credentials.',
  })
  @ApiParam({ name: 'id', description: 'Registration ID to approve', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Registration approved successfully' })
  @ApiResponse({ status: 400, description: 'Registration already approved or rejected' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async approveRegistration(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveVendorRegistrationDto,
    @User() user: any,
  ) {
    return this.service.approveRegistration(id, dto, user?.id);
  }

  @Put(':id/start-pitching')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN] Start Pitching',
    description: 'Move registration from Menunggu Approve to Proses Pitching.',
  })
  @ApiParam({ name: 'id', description: 'Registration ID to move to pitching', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Registration moved to pitching successfully' })
  async startPitching(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveVendorRegistrationDto,
    @User() user: any,
  ) {
    return this.service.approveRegistration(id, dto, user?.id);
  }

  @Put(':id/final-approve')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN] Final Approve Vendor Registration',
    description: 'Move registration from Proses Pitching to Disetujui and create vendor credentials.',
  })
  @ApiParam({ name: 'id', description: 'Registration ID to final approve', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Registration final approved successfully' })
  async finalApprove(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveVendorRegistrationDto,
    @User() user: any,
  ) {
    return this.service.approveRegistration(id, dto, user?.id);
  }

  @Put(':id/reject')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN] Reject Vendor Registration',
    description: 'Reject a pending vendor registration. Provide rejection reason for vendor clarity.',
  })
  @ApiParam({ name: 'id', description: 'Registration ID to reject', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Registration rejected successfully' })
  @ApiResponse({ status: 400, description: 'Registration already approved or rejected' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async rejectRegistration(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectVendorRegistrationDto,
    @User() user: any,
  ) {
    return this.service.rejectRegistration(id, dto, user?.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN] Delete Vendor Registration',
    description: 'Hard delete a vendor registration record. Existing active vendor/user data is not removed.',
  })
  @ApiParam({ name: 'id', description: 'Registration ID to delete', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Registration deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async deleteRegistration(
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    return this.service.deleteRegistration(id, user?.id);
  }
}
