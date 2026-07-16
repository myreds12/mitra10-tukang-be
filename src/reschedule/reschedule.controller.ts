import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RescheduleService } from './reschedule.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CreateRescheduleDto } from './dto/create-reschedule.dto';
import { users } from '@prisma/client';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateRescheduleDto } from './dto/update-reschedule.dto';

interface UserRequest extends IExpressRequest {
  user: users;
}

@UseGuards(JwtAuthGuard)
@Controller('reschedule')
export class RescheduleController {
  constructor(private readonly rescheduleService: RescheduleService) {}

  @Get('/export-excel')
  async rescheduleExportExcel(
    @Res() res: IExpressResponse,
    @Query() query: QueryParamsDto,
  ) {
    return await this.rescheduleService.rescheduleExportExcel(res, query);
  }

  @Get('next-code')
  async getCode() {
    const code = await this.rescheduleService.getCode();
    let nextCode = 1;
    if (code) nextCode = code.id + 1;

    return { code: nextCode };
  }

  @UseInterceptors(FilesInterceptor('reschedule_evidences'))
  @Post()
  async create(
    @Body() rescheduleDto: CreateRescheduleDto,
    @Req() req: UserRequest,
    @UploadedFiles() reschedule_evidences: Express.Multer.File[],
  ) {
    const user = req.user;
    return await this.rescheduleService.create(
      rescheduleDto,
      user,
      reschedule_evidences,
    );
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto) {
    return await this.rescheduleService.findAll(query);
  }

  @Get('/:id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.rescheduleService.findOne(id);
  }

  @UseInterceptors(FilesInterceptor('reschedule_evidences'))
  @Post('/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() rescheduleDto: UpdateRescheduleDto,
    @Req() req: UserRequest,
    @UploadedFiles() reschedule_evidences: Express.Multer.File[],
  ) {
    try {
      const user = req.user;
      return await this.rescheduleService.update(
        id,
        rescheduleDto,
        user,
        reschedule_evidences,
      );
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
}
