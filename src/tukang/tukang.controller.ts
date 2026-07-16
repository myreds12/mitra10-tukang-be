import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Request,
  UseInterceptors,
  UseGuards,
  Res,
  Query,
  UploadedFiles,
} from '@nestjs/common';
import { TukangService } from './tukang.service';
import { CreateTukangDto } from './dto/create-tukang.dto';
import { UpdateTukangDto } from './dto/update-tukang.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';

@ApiTags('Tukang')
@Controller('tukang')
@UseGuards(JwtAuthGuard)
export class TukangController {
  constructor(private readonly tukangService: TukangService) {}

  @Post('/delete-duplicate/:id')
  async tukangDeleteDuplicateRelation(
    @Param('id') id: number,
    @Body('type') type: 'service_type' | 'area',
    @Body('take') take: number,
  ) {
    const data = await this.tukangService.deleteDuplicateRelationTukang(
      id,
      type,
      take,
    );
    return data;
  }

  @Get('/export-pdf-order')
  async tukangOrderExportPdf(
    @Query() query: QueryParamsDto,
    @Res() res: Response,
  ) {
    const data = await this.tukangService.tukangOrderPdf(res, query);
    return data;
  }

  @Get('/export-excel-order')
  @UseGuards(JwtAuthGuard)
  async tukangOrderExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: Response,
  ) {
    const data = await this.tukangService.tukangExportOrderExcel(res, query);
    return data;
  }

  @Get('/export-excel')
  @UseGuards(JwtAuthGuard)
  async tukangExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: Response,
  ) {
    const data = await this.tukangService.tukangExportExcel(res, query);
    return data;
  }

  @Get('next-code')
  async getCode() {
    try {
      const code = await this.tukangService.getCode();
      let nextCode = 1;
      if (code) nextCode = code.id + 1;

      return { code: nextCode };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'tukang_document', maxCount: 5 },
      { name: 'npwp_file', maxCount: 1 },
      { name: 'ktp_file', maxCount: 1 },
    ]),
  )
  async create(
    @Body() createTukangDto: CreateTukangDto,
    @Request() req: RequestWithUser,
    @UploadedFiles() files: TukangFiles,
  ) {
    const user = req.user;
    console.log(user);

    return await this.tukangService.create(createTukangDto, user, files);
  }

  @Get('/')
  async findAll(@Query() query: QueryParamsDto) {
    return await this.tukangService.findAll(query);
  }

  @Get('/:id')
  async findOne(@Param('id') id: number) {
    return await this.tukangService.findOne(id);
  }

  @Post('/:id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'vendor_document', maxCount: 5 },
      { name: 'npwp_file', maxCount: 1 },
      { name: 'ktp_file', maxCount: 1 },
    ]),
  )
  async update(
    @Param('id') id: number,
    @Body() updateTukangDto: UpdateTukangDto,
    @Request() req: RequestWithUser,
    @UploadedFiles() files?: TukangFiles,
  ) {
    const user = req.user;
    return await this.tukangService.update(id, updateTukangDto, user, files);
  }

  @Delete('/:id')
  async remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    const user_id = req.user.id;
    return await this.tukangService.remove(+id, user_id);
  }
}
