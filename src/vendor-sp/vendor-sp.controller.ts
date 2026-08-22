/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  ForbiddenException,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VendorSpService } from './vendor-sp.service';
import {
  QueryVendorSpDto,
  CreateVendorSpDto,
  UpdateVendorSpDto,
  ReactivateVendorDto,
} from './dto/vendor-sp.dto';
import { PenaltyReceiptDto } from './dto/penalty-receipt.dto';
import { NoViolationCertificateDto } from './dto/no-violation-certificate.dto';
import { CleanVendorRecapDto } from './dto/clean-vendor-recap.dto';
import { QueryReactivationLogDto } from './dto/query-reactivation-log.dto';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { User } from 'src/common/decorator/user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('Vendor SP (Surat Peringatan)')
@ApiBearerAuth()
@Controller('vendor-sp')
@UseGuards(JwtAuthGuard)
export class VendorSpController {
  constructor(private readonly service: VendorSpService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all Vendor SP records',
    description: 'Retrieve paginated list of all Vendor SP (Surat Peringatan) records with optional filters',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number, example: 1 })
  @ApiQuery({ name: 'take', required: false, description: 'Records per page', type: Number, example: 10 })
  @ApiQuery({ name: 'vendor_id', required: false, description: 'Filter by vendor ID', type: Number })
  @ApiQuery({ name: 'sp_level', required: false, description: 'Filter by SP level (1, 2, or 3)', type: Number })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (0=Inactive, 1=Active)', type: Number })
  @ApiQuery({ name: 'quarter', required: false, description: 'Filter by quarter (1-4)', type: Number })
  @ApiQuery({ name: 'year', required: false, description: 'Filter by year', type: Number })
  @ApiQuery({ name: 'date_from', required: false, description: 'Filter start date from (YYYY-MM-DD)' })
  @ApiQuery({ name: 'date_to', required: false, description: 'Filter start date to (YYYY-MM-DD)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by vendor name' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved SP records' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Query() query: QueryVendorSpDto) {
    return this.service.findAll(query);
  }

  @Get('vendor/:vendorId')
  @ApiOperation({
    summary: 'Get SP records by Vendor ID',
    description: 'Retrieve all SP (Surat Peringatan) records for a specific vendor',
  })
  @ApiParam({ name: 'vendorId', description: 'Vendor ID', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Successfully retrieved vendor SP records' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async findByVendor(@Param('vendorId', ParseIntPipe) vendorId: number) {
    return this.service.findByVendor(vendorId);
  }

  @Get('check/:vendorId')
  @ApiOperation({
    summary: 'Check Vendor SP Status',
    description: 'Check if a vendor has active SP and their current status. Returns SP details if active, or "no active SP" message if clean.',
  })
  @ApiParam({ name: 'vendorId', description: 'Vendor ID to check', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Returns SP status and details if active' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async checkVendorSpStatus(@Param('vendorId', ParseIntPipe) vendorId: number) {
    return this.service.checkVendorSpStatus(vendorId);
  }

  @Get('vendor-list')
  @ApiOperation({
    summary: 'Get Vendors with SP Status',
    description: 'Get list of vendors with their current SP status. Useful for dropdown lists in frontend.',
  })
  @ApiQuery({ name: 'vendor_ids', required: false, description: 'Comma-separated vendor IDs to filter (e.g., "1,2,3")' })
  @ApiResponse({ status: 200, description: 'Returns list of vendors with SP status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getVendorsWithSpStatus(@Query('vendor_ids') vendorIds?: string) {
    const ids = vendorIds
      ? vendorIds.split(',').map((id) => parseInt(id.trim(), 10))
      : undefined;
    return this.service.getVendorsWithSpStatus(ids);
  }

  @Get('reactivation')
  @ApiOperation({
    summary: 'Get Vendor Reactivation Logs',
    description:
      'Retrieve history of vendor reactivation after SP3 deactivation. ' +
      'Supports filter by vendor name/PIC (search), status, ' +
      'reactivation request date range, dan pagination. ' +
      'Proteksi: JWT-only + role-check (Admin HO / Super User).',
  })
  @ApiResponse({ status: 200, description: 'Returns reactivation log history' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — Admin HO / Super User only' })
  async getReactivationLogs(
    @Query() query: QueryReactivationLogDto,
    @User() user: any,
  ) {
    const userRole = await this.service.getRoleName(user?.id);
    if (userRole !== 'Admin HO' && userRole !== 'Super User') {
      throw new ForbiddenException(
        `Akses hanya untuk role Admin HO / Super User. Role Anda: ${userRole ?? 'tidak diketahui'}.`,
      );
    }
    return this.service.findReactivationLogs(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get SP Record by ID',
    description: 'Retrieve a specific SP (Surat Peringatan) record by its ID',
  })
  @ApiParam({ name: 'id', description: 'SP Record ID', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Successfully retrieved SP record' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'SP record not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({
    summary: '[NOT RECOMMENDED] Create New SP Manually',
    description: '**WARNING: SP is normally created automatically by the system via violation detection. Use this only for manual override.** Records a new SP for a vendor. Usually triggered automatically when violation points reach threshold.',
  })
  @ApiResponse({ status: 201, description: 'SP created successfully (if used)' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @Body() dto: CreateVendorSpDto,
    @User() user: RequestWithUser,
  ) {
    return { message: 'SP biasanya dibuat otomatis oleh sistem. Gunakan endpoint violation untuk mencatat pelanggaran.' };
  }

  @Put('extend/:id')
  @ApiOperation({
    summary: 'Extend SP Duration',
    description: 'Extend the end date of an active SP. Used when vendor needs more time to complete SP requirements.',
  })
  @ApiParam({ name: 'id', description: 'SP Record ID to extend', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'SP duration extended successfully' })
  @ApiResponse({ status: 400, description: 'Invalid end_date format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'SP record not found' })
  async extendSpDuration(
    @Param('id', ParseIntPipe) id: number,
    @Body('end_date') endDate: string,
    @User() user: any,
  ) {
    return this.service.extendSpDuration(id, new Date(endDate), user?.id);
  }

  @Put('complete/:id')
  @ApiOperation({
    summary: 'Mark SP as Completed',
    description: 'Manually mark an SP as completed/finished. Usually used when vendor has fulfilled SP requirements before expiration.',
  })
  @ApiParam({ name: 'id', description: 'SP Record ID to complete', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'SP marked as completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'SP record not found' })
  async completeSp(
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    return this.service.completeSp(id, user?.id);
  }

  @Post('reactivate')
  @ApiOperation({
    summary: 'Reactivate Vendor after SP3',
    description: 'Reactivate a vendor that was deactivated due to SP3. Only HO (Head Office) can perform this action. Vendor will be set to active again after SP3 expires naturally.',
  })
  @ApiResponse({ status: 201, description: 'Vendor reactivated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async reactivateVendor(
    @Body() dto: ReactivateVendorDto,
    @User() user: any,
  ) {
    return this.service.reactivateVendor(dto, user?.id);
  }

  // ================================
  // POIN 3: PDF REKAP PENALTY (Bukti SP)
  // ================================

  @Post('penalty-receipt/export')
  @ApiOperation({
    summary: '[POIN 3] Export PDF Bukti Surat Peringatan',
    description:
      'Generate PDF Bukti SP untuk vendor di quarter tertentu. ' +
      'Mengandung info vendor, ringkasan order/pelanggaran/poin, rincian ' +
      'pelanggaran (tabel), dan section tanda tangan Admin HO + Vendor. ' +
      'Proteksi: JWT-only + role-check handler (Admin HO / Super User).',
  })
  @ApiResponse({ status: 200, description: 'PDF attachment streamed inline' })
  @ApiResponse({ status: 400, description: 'Invalid input (vendor_id/quarter/year)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — Admin HO / Super User only' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async exportPenaltyReceipt(
    @Body() dto: PenaltyReceiptDto,
    @User() user: any,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const userRole = await this.service.getRoleName(user?.id);
    if (userRole !== 'Admin HO' && userRole !== 'Super User') {
      throw new ForbiddenException(
        `Akses hanya untuk role Admin HO / Super User. Role Anda: ${userRole ?? 'tidak diketahui'}.`,
      );
    }

    const result = await this.service.generatePenaltyReceiptPdf(
      dto.vendor_id,
      dto.quarter,
      dto.year,
      user?.id ?? null,
    );

    if (!fs.existsSync(result.filePath)) {
      throw new NotFoundException(
        `File PDF tidak ditemukan di server: ${result.filePath}`,
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.userFileName}"`,
    );

    const stream = fs.createReadStream(result.filePath);
    stream.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error(`penalty-receipt stream error: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).end('Export stream error');
      }
    });
    stream.pipe(res);
  }

  // ================================
  // POIN 4: PDF REKAP VENDOR TANPA PELANGGARAN
  // ================================

  @Post('no-violation-certificate/export')
  @ApiOperation({
    summary: '[POIN 4] Export PDF Surat Bebas Pelanggaran',
    description:
      'Generate PDF Surat Keterangan Bebas Pelanggaran. ' +
      'WAJIB: (1) vendor TIDAK punya pelanggaran aktif di quarter tsb, ' +
      '(2) quarter harus lampau (bukan yang sedang berjalan). ' +
      'Mengandung info vendor, ringkasan, kalimat resmi, dan tanda tangan Admin HO. ' +
      'Proteksi: JWT-only + role-check handler (Admin HO / Super User).',
  })
  @ApiResponse({ status: 200, description: 'PDF attachment streamed inline' })
  @ApiResponse({ status: 400, description: 'Ada pelanggaran aktif ATAU kuartal masih berjalan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — Admin HO / Super User only' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async exportNoViolationCertificate(
    @Body() dto: NoViolationCertificateDto,
    @User() user: any,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const userRole = await this.service.getRoleName(user?.id);
    if (userRole !== 'Admin HO' && userRole !== 'Super User') {
      throw new ForbiddenException(
        `Akses hanya untuk role Admin HO / Super User. Role Anda: ${userRole ?? 'tidak diketahui'}.`,
      );
    }

    const result = await this.service.generateNoViolationCertificatePdf(
      dto.vendor_id,
      dto.quarter,
      dto.year,
      user?.id ?? null,
    );

    if (!fs.existsSync(result.filePath)) {
      throw new NotFoundException(
        `File PDF tidak ditemukan di server: ${result.filePath}`,
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.userFileName}"`,
    );

    const stream = fs.createReadStream(result.filePath);
    stream.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error(`no-violation-certificate stream error: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).end('Export stream error');
      }
    });
    stream.pipe(res);
  }

  // Poin 4 (varian aggregate): PDF rekap LIST vendor tanpa pelanggaran.
  // Pattern konsisten dengan Poin 3 + Poin 4 (POST + body + role-check + file streaming).
  @Post('clean-vendor-recap/export')
  @ApiOperation({
    summary: '[POIN 4] Export PDF Rekap Vendor Tanpa Pelanggaran',
    description:
      'Generate PDF berisi LIST semua vendor dengan 0 pelanggaran pada ' +
      'quarter+year tsb. Filter kategori violation_type opsional. ' +
      'Proteksi: JWT-only + role-check handler (Admin HO / Super User).',
  })
  @ApiResponse({ status: 200, description: 'PDF attachment streamed inline' })
  @ApiResponse({ status: 400, description: 'Invalid input (quarter/year/category)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — Admin HO / Super User only' })
  async exportCleanVendorRecap(
    @Body() dto: CleanVendorRecapDto,
    @User() user: any,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const userRole = await this.service.getRoleName(user?.id);
    if (userRole !== 'Admin HO' && userRole !== 'Super User') {
      throw new ForbiddenException(
        `Akses hanya untuk role Admin HO / Super User. Role Anda: ${userRole ?? 'tidak diketahui'}.`,
      );
    }

    const result = await this.service.generateCleanVendorRecapPdf(
      dto.quarter,
      dto.year,
      dto.category,
      user?.id ?? null,
    );

    if (!fs.existsSync(result.filePath)) {
      throw new NotFoundException(
        `File PDF tidak ditemukan di server: ${result.filePath}`,
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.userFileName}"`,
    );

    const stream = fs.createReadStream(result.filePath);
    stream.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error(`clean-vendor-recap stream error: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).end('Export stream error');
      }
    });
    stream.pipe(res);
  }
}
