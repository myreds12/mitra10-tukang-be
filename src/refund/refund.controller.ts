import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Req,
  Res,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
} from '@nestjs/common';
import { RefundService } from './refund.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { UpdateRefundDto } from './dto/update-refund.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { Response as IExpressResponse } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery, ApiConsumes } from '@nestjs/swagger';

@ApiTags('Refunds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('refund')
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Get('/export-excel')
  @ApiOperation({
    summary: 'Export Refunds to Excel',
    description: 'Export filtered refunds to Excel file',
  })
  @ApiResponse({ status: 200, description: 'Excel file generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async refundExportExcel(
    @Res() res: IExpressResponse,
    @Query() query: QueryParamsDto,
  ) {
    return await this.refundService.refundExportExcel(res, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Create New Refund Request',
    description: 'Create a new refund request. Triggers violation detection for refund count threshold.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Refund created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FilesInterceptor('refund_evidences'))
  async create(
    @UploadedFiles() refund_evidences: Array<Express.Multer.File>,
    @Body() createRefundDto: CreateRefundDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return await this.refundService.create(createRefundDto, user, refund_evidences);
  }

  @Get()
  @ApiOperation({
    summary: 'Get All Refunds',
    description: 'Retrieve paginated list of all refunds with optional filters',
  })
  @ApiResponse({ status: 200, description: 'Successfully retrieved refunds' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Query() query: QueryParamsDto) {
    return await this.refundService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Refund by ID',
    description: 'Retrieve a specific refund by its ID with full details',
  })
  @ApiParam({ name: 'id', description: 'Refund ID', type: Number })
  @ApiResponse({ status: 200, description: 'Successfully retrieved refund' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Refund not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.refundService.findOne(id);
  }

  @Post(':id')
  @ApiOperation({
    summary: 'Update Refund',
    description: 'Update an existing refund with new data and/or evidence files',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Refund ID to update', type: Number })
  @ApiResponse({ status: 200, description: 'Refund updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Refund not found' })
  @UseInterceptors(FilesInterceptor('refunds_evidences'))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRefundDto: UpdateRefundDto,
    @Req() req: RequestWithUser,
    @UploadedFiles() refunds_evidences: Array<Express.Multer.File>,
  ) {
    const user = req.user;
    return await this.refundService.update(id, updateRefundDto, user, refunds_evidences);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete Refund',
    description: 'Delete a refund by ID',
  })
  @ApiParam({ name: 'id', description: 'Refund ID to delete', type: String })
  @ApiResponse({ status: 200, description: 'Refund deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  remove(@Param('id') id: string) {
    return this.refundService.remove(+id);
  }
}