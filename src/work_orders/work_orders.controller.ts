import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
  Get,
  Delete,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
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
import { ApiTags } from '@nestjs/swagger';
import { StatusDetails } from './dto/work-order-status.dto';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';

@ApiTags('Work Orders')
@Controller('work-orders')
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post(':id/set-materials')
  @UseInterceptors(
    FileFieldsInterceptor([
      {
        name: 'work_order_before',
        maxCount: 5,
      },
      {
        name: 'work_order_after',
        maxCount: 5,
      },
    ]),
  )
  async setStatusWithMaterials(
    @Param('id') id: number,
    @Body() body: StatusDetails,
    @Request() req: RequestWithUser,
    @UploadedFiles()
    files: {
      work_order_before?: Express.Multer.File[];
      work_order_after?: Express.Multer.File[];
    },
  ) {
    return await this.workOrdersService.setStatusWithMaterials(
      id,
      req.user,
      body,
      files,
    );
  }

  @Post('')
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

    return await this.workOrdersService.create(
      dataDto,
      req.user,
      work_order_evidences,
    );
  }

  @Get('')
  async findAll(@Query() queryParamsDto: QueryParamsDto) {
    return await this.workOrdersService.findAll(queryParamsDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    return await this.workOrdersService.findOne(id);
  }

  @Post(':id')
  @UseInterceptors(FilesInterceptor('work_order_evidences', 5))
  async update(
    @Param('id') id: number,
    @Body() dataDto: UpdateWorkOrderDto,
    @Request() req: RequestWithUser,
    @UploadedFiles() work_order_evidences: Express.Multer.File[],
  ) {
    console.log(
      'work order update : ',
      id,
      dataDto,
      req.user,
      work_order_evidences,
    );

    return await this.workOrdersService.update(
      id,
      dataDto,
      req.user,
      work_order_evidences,
    );
  }

  @Delete(':id')
  async delete(@Param('id') id: number, @Request() req) {
    const user_id = req.user.id;
    return await this.workOrdersService.delete(id, user_id);
  }
}
