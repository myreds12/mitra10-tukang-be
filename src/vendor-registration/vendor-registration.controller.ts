/* eslint-disable prettier/prettier */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { createReadStream } from 'fs';
import { existsSync } from 'fs';

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
      'Ambil dokumen Syarat & Ketentuan aktif (HTML atau metadata PDF). Untuk tipe PDF, konten dilayani terpisah via GET /terms-and-conditions/file (streaming read-only).',
  })
  @ApiResponse({ status: 200, description: 'Returns active terms and conditions content' })
  async getActiveTermsAndConditions() {
    return this.service.getActiveTermsAndConditions();
  }

  // Streaming PDF T&C aktif - READ-ONLY:
  // - inline (bukan attachment) -> browser tampilkan viewer, TIDAK menawarkan download
  // - Content-Disposition: inline tanpa filename download
  // - cache disabled supaya link tidak bisa dipakai ulang di luar viewer
  @Get('terms-and-conditions/file')
  @ApiOperation({
    summary: '[PUBLIC] Stream Active Terms & Conditions PDF (read-only)',
    description:
      'Stream file PDF T&C aktif untuk viewer inline. Read-only - tidak bisa didownload.',
  })
  @ApiResponse({ status: 200, description: 'Returns PDF stream (inline, no download)' })
  @ApiResponse({ status: 404, description: 'No active PDF terms and conditions' })
  async streamActiveTermsPdf(@Res() res: any) {
    const pdf = await this.service.getActiveTermsPdfPath();

    if (!pdf) {
      throw new NotFoundException(
        'T&C aktif bukan tipe PDF atau file tidak ditemukan.',
      );
    }

    if (!existsSync(pdf.absolutePath)) {
      throw new NotFoundException('File PDF T&C tidak ditemukan di server.');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = createReadStream(pdf.absolutePath);
    stream.pipe(res);
  }

  @Get('terms-and-conditions/versions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN HO / SUPER USER] List All Terms & Conditions Versions',
    description: 'Riwayat semua versi T&C untuk halaman setting (versi aktif + arsip).',
  })
  @ApiResponse({ status: 200, description: 'Returns all terms and conditions versions' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin HO / Super User only' })
  async listTermsAndConditions(@User() user: any) {
    return this.service.listTermsAndConditions(user?.id);
  }

  @Get('terms-and-conditions/versions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN HO / SUPER USER] Get Terms & Conditions Version by ID',
    description: 'Detail satu versi T&C (termasuk konten) untuk form edit.',
  })
  @ApiParam({ name: 'id', description: 'Version ID', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Returns terms and conditions version detail' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async getTermsVersionById(
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    return this.service.getTermsVersionById(id, user?.id);
  }

  @Put('terms-and-conditions/versions/:id/activate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN HO / SUPER USER] Activate Terms & Conditions Version',
    description: 'Aktifkan satu versi T&C. Single-active: semua versi lain otomatis dinonaktifkan.',
  })
  @ApiParam({ name: 'id', description: 'Version ID', type: Number, example: 2 })
  @ApiResponse({ status: 200, description: 'Version activated successfully' })
  @ApiResponse({ status: 400, description: 'Version already active' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async activateTermsVersion(
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    return this.service.activateTermsVersion(id, user?.id);
  }

  @Put('terms-and-conditions/versions/:id/deactivate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '[ADMIN HO / SUPER USER] Deactivate Terms & Conditions Version',
    description:
      'Nonaktifkan versi T&C. Ditolak jika ini satu-satunya versi aktif (minimal 1 harus aktif).',
  })
  @ApiParam({ name: 'id', description: 'Version ID', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Version deactivated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot deactivate the only active version' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async deactivateTermsVersion(
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    return this.service.deactivateTermsVersion(id, user?.id);
  }

  @Put('terms-and-conditions')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
          return;
        }
        cb(
          new BadRequestException(
            `File harus berformat PDF (application/pdf). Diterima: ${file.mimetype || 'unknown'}`,
          ),
          false,
        );
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '[ADMIN HO / SUPER USER] Update Terms & Conditions (CREATE NEW VERSION)',
    description:
      'Update T&C (HTML dari Quill atau upload PDF) tanpa redeploy. Membuat versi baru yang otomatis menjadi SATU-SATUNYA versi aktif. File PDF max 10 MB. Untuk edit in-place pada versi yang sudah ada, gunakan PUT /terms-and-conditions/versions/:id.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 5, maxLength: 200 },
        content: { type: 'string', description: 'HTML content (tipe HTML)' },
        document_type: { type: 'string', enum: ['HTML', 'PDF'] },
        file: {
          type: 'string',
          format: 'binary',
          description: 'File PDF (tipe PDF, max 10 MB)',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Terms and conditions updated successfully (new version created)' })
  @ApiResponse({ status: 400, description: 'Bad Request - validation failed (title length, PDF mime/size)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin HO / Super User only' })
  async updateTermsAndConditions(
    @Body() dto: UpdateTermsAndConditionsDto,
    @User() user: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.updateTermsAndConditions(dto, user?.id, file);
  }

  @Put('terms-and-conditions/versions/:id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
          return;
        }
        cb(
          new BadRequestException(
            `File harus berformat PDF (application/pdf). Diterima: ${file.mimetype || 'unknown'}`,
          ),
          false,
        );
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '[ADMIN HO / SUPER USER] Edit Terms & Conditions Version IN-PLACE',
    description:
      'Edit konten (title/content/file) dari versi T&C yang sudah ada TANPA membuat versi baru. Cocok untuk memperbaiki typo. Single-active TETAP berlaku — is_active versi yang diedit TIDAK berubah: edit versi aktif → tetap aktif; edit versi arsip → tetap arsip. Setelah edit, aktivasi manual jika diperlukan (lihat PUT /terms-and-conditions/versions/:id/activate).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 5, maxLength: 200 },
        content: { type: 'string', description: 'HTML content (tipe HTML)' },
        document_type: { type: 'string', enum: ['HTML', 'PDF'] },
        file: {
          type: 'string',
          format: 'binary',
          description: 'File PDF baru (tipe PDF, max 10 MB) — opsional, gunakan existing jika tidak upload',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Version edited in place successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request - validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin HO / Super User only' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async editTermsVersionInPlace(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTermsAndConditionsDto,
    @User() user: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.editTermsVersionInPlace(id, dto, user?.id, file);
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
