/* eslint-disable prettier/prettier */
import {
  Controller,
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
  ValidateTokenDto,
  CreateUserFromTokenDto,
} from './dto/vendor-registration.dto';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
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

  @Get('validate-token')
  @ApiOperation({
    summary: '[PUBLIC] Validate Registration Token',
    description: 'Validate if the registration token is still valid and not expired. Used before creating user account.',
  })
  @ApiQuery({ name: 'token', description: 'Registration token from email', type: String, example: 'abc123def456' })
  @ApiResponse({ status: 200, description: 'Token is valid, returns registration details' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async validateToken(@Query() query: ValidateTokenDto) {
    return this.service.validateToken(query.token);
  }

  @Post('create-user')
  @ApiOperation({
    summary: '[PUBLIC] Create User from Token',
    description: 'Create vendor user account after email validation. Requires valid token from registration email.',
  })
  @ApiResponse({ status: 201, description: 'User created successfully. Vendor is now active.' })
  @ApiResponse({ status: 400, description: 'Invalid token or data' })
  async createUserFromToken(@Body() dto: CreateUserFromTokenDto & ValidateTokenDto) {
    return this.service.createUserFromToken(dto.token, {
      username: dto.username,
      password: dto.password,
    });
  }

  // ================================
  // ADMIN: MANAGE REGISTRATIONS
  // ================================

  @Get('stats')
  @ApiOperation({
    summary: '[ADMIN] Get Registration Statistics',
    description: 'Get summary statistics of vendor registrations (pending, approved, rejected counts)',
  })
  @ApiResponse({ status: 200, description: 'Returns registration statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRegistrationStats() {
    return this.service.getRegistrationStats();
  }

  @Get()
  @ApiOperation({
    summary: '[ADMIN] Get All Registrations',
    description: 'Retrieve paginated list of all vendor registrations with optional filters',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number, example: 1 })
  @ApiQuery({ name: 'take', required: false, description: 'Records per page', type: Number, example: 10 })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (1=Pending, 2=Approved, 3=Rejected)', type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Search by company name or email' })
  @ApiQuery({ name: 'date_from', required: false, description: 'Filter date from (YYYY-MM-DD)' })
  @ApiQuery({ name: 'date_to', required: false, description: 'Filter date to (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved registrations' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAllRegistrations(@Query() query: QueryVendorRegistrationDto) {
    return this.service.findAllRegistrations(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '[ADMIN] Get Registration by ID',
    description: 'Retrieve a specific vendor registration by its ID',
  })
  @ApiParam({ name: 'id', description: 'Registration ID', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Successfully retrieved registration' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async findOneRegistration(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOneRegistration(id);
  }

  @Put(':id/approve')
  @ApiOperation({
    summary: '[ADMIN] Approve Vendor Registration',
    description: 'Approve a pending vendor registration. This will set status to APPROVED and vendor can proceed with user creation.',
  })
  @ApiParam({ name: 'id', description: 'Registration ID to approve', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Registration approved successfully' })
  @ApiResponse({ status: 400, description: 'Registration already approved or rejected' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async approveRegistration(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveVendorRegistrationDto,
    @User() user: RequestWithUser,
  ) {
    return this.service.approveRegistration(id, dto, user?.user?.id);
  }

  @Put(':id/reject')
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
    @User() user: RequestWithUser,
  ) {
    return this.service.rejectRegistration(id, dto, user?.user?.id);
  }
}