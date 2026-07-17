import {
  Body,
  Controller,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  Get,
  Delete,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { WorkOrdersService } from './work_orders.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import {
  FileFieldsInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { StatusDetails } from './dto/work-order-status.dto';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { WorkOrderTukang } from './dto/wo-tukang.dto';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';

@ApiTags('Work Orders')
@ApiBearerAuth()
@Controller('work-orders')
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post('update-notes/:id')
  @ApiOperation({
    summary: 'Update Tukang Notes',
    description: 'Update notes for tukang (worker) assigned to work order',
  })
  @ApiParam({ name: 'id', description: 'Work Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'Notes updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updatTukangNotes(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
    @Body() dataDto: WorkOrderTukang,
  ) {
    return await this.workOrdersService.tukangUpdateNotes(id, req.user, dataDto);
  }

  @Get('/calender')
  @ApiOperation({
    summary: 'Get Work Orders Calendar View',
    description: 'Get work orders data formatted for calendar view',
  })
  @ApiResponse({ status: 200, description: 'Calendar data retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async orderCalender(@Query() query: QueryParamsDto) {
    try {
      return await this.workOrdersService.calenderWorkOrder(query);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Post(':id/set-materials')
  @ApiOperation({
    summary: 'Set Status with Materials',
    description: 'Update work order status and upload before/after material photos',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Work Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'Status and materials updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'work_order_before', maxCount: 10 },
      { name: 'work_order_after', maxCount: 10 },
    ]),
  )
  async setStatusWithMaterials(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: StatusDetails,
    @Request() req: RequestWithUser,
    @UploadedFiles()
    files: {
      work_order_before?: Express.Multer.File[];
      work_order_after?: Express.Multer.File[];
    },
  ) {
    return await this.workOrdersService.setStatusWithMaterials(id, req.user, body, files);
  }

  @Post(':id/replace-tukang')
  @ApiOperation({
    summary: 'Replace Tukang',
    description: 'Replace tukang (worker) assigned to work order with new one',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Work Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'Tukang replaced successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(
    FilesInterceptor('file', 10, {
      storage: diskStorage({
        destination: resolveUploadPath('request-tukang'),
        filename: (req, file, callback) => {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
  )
  async replaceTukang(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateWorkOrderDto,
    @UploadedFiles() file: Express.Multer.File[],
    @Request() req: RequestWithUser,
  ) {
    return await this.workOrdersService.replaceTukang(id, updateDto, req.user, file);
  }

  @Post('')
  @ApiOperation({
    summary: 'Create Work Order',
    description: 'Create a new work order with tukang assignments and evidence files',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Work order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FilesInterceptor('work_order_evidences', 5))
  async create(
    @Body() dataDto: CreateWorkOrderDto,
    @Request() req: RequestWithUser,
    @UploadedFiles() work_order_evidences: Express.Multer.File[],
  ) {
    if (!dataDto.work_order_tukang)
      throw new BadRequestException('Tukang cannot be null');
    if (!dataDto.work_order_tukang.length)
      throw new BadRequestException('Tukang should be an one or many.');

    return await this.workOrdersService.create(dataDto, req.user, work_order_evidences);
  }

  @Get('')
  @ApiOperation({
    summary: 'Get All Work Orders',
    description: 'Retrieve paginated list of all work orders with optional filters',
  })
  @ApiResponse({ status: 200, description: 'Successfully retrieved work orders' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Query() queryParamsDto: QueryParamsDto) {
    return await this.workOrdersService.findAll(queryParamsDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Work Order by ID',
    description: 'Retrieve a specific work order by its ID with full details',
  })
  @ApiParam({ name: 'id', description: 'Work Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'Successfully retrieved work order' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.workOrdersService.findOne(id);
  }

  @Post(':id')
  @ApiOperation({
    summary: 'Update Work Order',
    description: 'Update an existing work order with new data and/or evidence files',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Work Order ID to update', type: Number })
  @ApiResponse({ status: 200, description: 'Work order updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  @UseInterceptors(FilesInterceptor('work_order_evidences', 10))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dataDto: UpdateWorkOrderDto,
    @Request() req: RequestWithUser,
    @UploadedFiles() work_order_evidences: Express.Multer.File[],
  ) {
    return await this.workOrdersService.update(id, dataDto, req.user, work_order_evidences);
  }

  @Post(':id/replace-foto')
  @ApiOperation({
    summary: 'Replace Work Order Photos',
    description: 'Replace all evidence photos for a work order',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Work Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'Photos replaced successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FilesInterceptor('work_order_evidences', 10))
  async updateFoto(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
    @UploadedFiles() work_order_evidences: Express.Multer.File[],
  ) {
    return await this.workOrdersService.updateFoto(id, req.user, work_order_evidences);
  }

  @Post(':id/add-foto-before')
  @ApiOperation({
    summary: 'Add Before Photos',
    description: 'Add before photos to work order (photos taken before work starts)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Work Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'Before photos added successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FilesInterceptor('work_order_before', 10))
  async addFotoBefore(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
    @UploadedFiles() work_order_before: Express.Multer.File[],
  ) {
    return await this.workOrdersService.addFotoBefore(id, req.user, work_order_before);
  }

  @Post(':id/add-foto-after')
  @ApiOperation({
    summary: 'Add After Photos',
    description: 'Add after photos to work order (photos taken after work completes)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Work Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'After photos added successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FilesInterceptor('work_order_after', 10))
  async addFotoAfter(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
    @UploadedFiles() work_order_after: Express.Multer.File[],
  ) {
    return await this.workOrdersService.addFotoAfter(id, req.user, work_order_after);
  }

  @Delete(':id/delete-foto')
  @ApiOperation({
    summary: 'Delete Work Order Photos',
    description: 'Delete all photos/evidence from a work order',
  })
  @ApiParam({ name: 'id', description: 'Work Order ID', type: Number })
  @ApiResponse({ status: 200, description: 'Photos deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteFoto(@Param('id', ParseIntPipe) id: number) {
    return await this.workOrdersService.deleteFoto(id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete Work Order',
    description: 'Delete a work order by ID',
  })
  @ApiParam({ name: 'id', description: 'Work Order ID to delete', type: Number })
  @ApiResponse({ status: 200, description: 'Work order deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async delete(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const user_id = req.user.id;
    return await this.workOrdersService.delete(id, user_id);
  }
}
