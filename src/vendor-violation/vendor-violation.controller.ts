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
import { VendorViolationService } from './vendor-violation.service';
import { VendorViolationRevisionService } from './vendor-violation-revision.service';
import {
  CreateVendorViolationTypeDto,
  UpdateVendorViolationTypeDto,
  QueryVendorViolationTypeDto,
} from './dto/create-violation-type.dto';
import {
  CreateViolationLogDto,
  QueryViolationLogDto,
} from './dto/create-violation-log.dto';
import {
  CreateViolationRevisionRequestDto,
  QueryViolationRevisionRequestDto,
  ReviewViolationRevisionRequestDto,
} from './dto/violation-revision-request.dto';
import { User } from 'src/common/decorator/user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('Vendor Violation')
@ApiBearerAuth()
@Controller(['vendor-violation', 'vendor-violations'])
@UseGuards(JwtAuthGuard)
export class VendorViolationController {
  constructor(
    private readonly service: VendorViolationService,
    private readonly revisionService: VendorViolationRevisionService,
  ) {}

  // ================================
  // VENDOR VIOLATION TYPE ENDPOINTS
  // ================================

  @Post('type')
  @ApiOperation({
    summary: 'Create New Violation Type',
    description: 'Create a new violation type/master data. Used for defining types of SLA violations vendors can commit.',
  })
  @ApiResponse({ status: 201, description: 'Violation type created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createViolationType(
    @Body() dto: CreateVendorViolationTypeDto,
    @User() user: any,
  ) {
    return this.service.createViolationType(dto, user?.id);
  }

  @Get('type')
  @ApiOperation({
    summary: 'Get All Violation Types',
    description: 'Retrieve paginated list of all vendor violation types with optional filters',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number, example: 1 })
  @ApiQuery({ name: 'take', required: false, description: 'Records per page', type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, description: 'Search by code, name, or description' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'is_active', required: false, description: 'Filter by active status (true/false)', type: Boolean })
  @ApiResponse({ status: 200, description: 'Successfully retrieved violation types' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAllViolationTypes(@Query() query: QueryVendorViolationTypeDto) {
    return this.service.findAllViolationTypes(query);
  }

  @Get('type/:id')
  @ApiOperation({
    summary: 'Get Violation Type by ID',
    description: 'Retrieve a specific violation type by its ID',
  })
  @ApiParam({ name: 'id', description: 'Violation Type ID', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Successfully retrieved violation type' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Violation type not found' })
  async findOneViolationType(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOneViolationType(id);
  }

  @Put('type/:id')
  @ApiOperation({
    summary: 'Update Violation Type',
    description: 'Update an existing violation type (e.g., change point value, deactivate old types)',
  })
  @ApiParam({ name: 'id', description: 'Violation Type ID to update', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Violation type updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Violation type not found' })
  async updateViolationType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVendorViolationTypeDto,
    @User() user: any,
  ) {
    return this.service.updateViolationType(id, dto, user?.id);
  }

  @Delete('type/:id')
  @ApiOperation({
    summary: 'Delete Violation Type',
    description: 'Delete a violation type. Usually used for deactivating obsolete violation types.',
  })
  @ApiParam({ name: 'id', description: 'Violation Type ID to delete', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Violation type deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Violation type not found' })
  async deleteViolationType(
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    return this.service.deleteViolationType(id, user?.id);
  }

  // ================================
  // VENDOR VIOLATION LOG ENDPOINTS
  // ================================

  @Post('log')
  @ApiOperation({
    summary: 'Record Vendor Violation',
    description: 'Record a new violation for a vendor. This will add violation log and automatically calculate total points. If points exceed threshold, SP will be triggered automatically.',
  })
  @ApiResponse({ status: 201, description: 'Violation recorded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createViolationLog(
    @Body() dto: CreateViolationLogDto,
    @User() user: any,
  ) {
    return this.service.createViolationLog(dto, user?.id);
  }

  @Get('log')
  @ApiOperation({
    summary: 'Get All Violation Logs',
    description: 'Retrieve paginated list of all vendor violation logs with optional filters',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number, example: 1 })
  @ApiQuery({ name: 'take', required: false, description: 'Records per page', type: Number, example: 10 })
  @ApiQuery({ name: 'vendor_id', required: false, description: 'Filter by vendor ID', type: Number })
  @ApiQuery({ name: 'quarter', required: false, description: 'Filter by quarter (1-4)', type: Number })
  @ApiQuery({ name: 'year', required: false, description: 'Filter by year', type: Number })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by violation category' })
  @ApiQuery({ name: 'date_from', required: false, description: 'Filter from date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'date_to', required: false, description: 'Filter to date (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved violation logs' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAllViolationLogs(@Query() query: QueryViolationLogDto) {
    return this.service.findAllViolationLogs(query);
  }

  @Get('vendor/:vendorId/points')
  @ApiOperation({
    summary: 'Get Vendor Quarter Points',
    description: 'Get total violation points for a vendor in specific quarter. Used to check if vendor is approaching SP threshold.',
  })
  @ApiParam({ name: 'vendorId', description: 'Vendor ID', type: Number, example: 1 })
  @ApiQuery({ name: 'quarter', required: false, description: 'Quarter to check (1-4). Default: current quarter', type: Number })
  @ApiQuery({ name: 'year', required: false, description: 'Year to check. Default: current year', type: Number })
  @ApiResponse({ status: 200, description: 'Returns total points and violation count' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getVendorQuarterPoints(
    @Param('vendorId', ParseIntPipe) vendorId: number,
    @Query('quarter') quarter?: string,
    @Query('year') year?: string,
  ) {
    return this.service.getVendorQuarterPoints(
      vendorId,
      quarter ? parseInt(quarter, 10) : undefined,
      year ? parseInt(year, 10) : undefined,
    );
  }

  @Get('summary/:vendorId')
  @ApiOperation({
    summary: 'Get Vendor Violation Summary',
    description: 'Get current quarter points, SP level, quarter period, and SP status for a vendor.',
  })
  @ApiParam({ name: 'vendorId', description: 'Vendor ID', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Returns current quarter SP summary' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getVendorSummary(@Param('vendorId', ParseIntPipe) vendorId: number) {
    return this.service.getVendorQuarterPoints(vendorId);
  }

  // ================================
  // REVISION / RESET POINT REQUESTS
  // ================================

  @Post('revision-request')
  @ApiOperation({
    summary: 'Create violation point revision/reset request',
    description: 'Admin HO submits a request to revise one violation log point or reset current quarter points. Requires Super User approval before applied.',
  })
  async createRevisionRequest(
    @Body() dto: CreateViolationRevisionRequestDto,
    @User() user: any,
  ) {
    return this.revisionService.createRequest(dto, user);
  }

  @Get('revision-request')
  @ApiOperation({
    summary: 'Get violation point revision/reset requests',
    description: 'Retrieve revision/reset requests with optional vendor/status filters.',
  })
  async findRevisionRequests(@Query() query: QueryViolationRevisionRequestDto) {
    return this.revisionService.findAll(query);
  }

  @Get('revision-request/:id')
  @ApiOperation({
    summary: 'Get revision/reset request detail',
  })
  async findRevisionRequest(@Param('id', ParseIntPipe) id: number) {
    return this.revisionService.findOne(id);
  }

  @Put('revision-request/:id/approve')
  @ApiOperation({
    summary: 'Approve revision/reset request',
    description: 'Super User approves request and applies point revision/reset in one Prisma transaction.',
  })
  async approveRevisionRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewViolationRevisionRequestDto,
    @User() user: any,
  ) {
    return this.revisionService.approve(id, dto, user);
  }

  @Put('revision-request/:id/reject')
  @ApiOperation({
    summary: 'Reject revision/reset request',
  })
  async rejectRevisionRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewViolationRevisionRequestDto,
    @User() user: any,
  ) {
    return this.revisionService.reject(id, dto, user);
  }
}
