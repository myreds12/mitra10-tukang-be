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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VendorSpService } from './vendor-sp.service';
import {
  QueryVendorSpDto,
  CreateVendorSpDto,
  UpdateVendorSpDto,
  ReactivateVendorDto,
} from './dto/vendor-sp.dto';
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
    description: 'Retrieve history of vendor reactivation after SP3 deactivation',
  })
  @ApiQuery({ name: 'vendor_id', required: false, description: 'Filter by specific vendor ID', type: Number })
  @ApiResponse({ status: 200, description: 'Returns reactivation log history' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getReactivationLogs(@Query('vendor_id') vendorId?: string) {
    return this.service.getReactivationLogs(
      vendorId ? parseInt(vendorId, 10) : undefined,
    );
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
}
