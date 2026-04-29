import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFiles,
  Req,
  Query,
  UseGuards,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import { ComissionSalesIncentiveService } from './comission_sales_incentive.service';
import { CreateComissionSalesIncentiveDto } from './dto/create-comission_sales_incentive.dto';
import { UpdateComissionSalesIncentiveDto } from './dto/update-comission_sales_incentive.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('comission-sales-incentive')
@UseGuards(JwtAuthGuard)
export class ComissionSalesIncentiveController {
  constructor(
    private readonly comissionSalesIncentiveService: ComissionSalesIncentiveService,
  ) {}

  @Get('/export-excel')
  async invoiceRekonselExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.comissionSalesIncentiveService.comissionSalesIncentiveExportExcel(
      query,
      res,
    );
  }
  @Get('/:id/pdf')
  async rekonselPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: IExpressResponse,
  ) {
    return await this.comissionSalesIncentiveService.comissionSalesIncentiveExportPdf(
      id,
      res,
    );
  }

  @Get('/:id/export-excel')
  async invoiceRekonselExportExcelDetails(
    @Param('id') id: string,
    @Res() res: IExpressResponse,
  ) {
    return await this.comissionSalesIncentiveService.comissionSalesIncentiveDetailExportExcel(
      +id,
      res,
    );
  }

  @Post()
  @UseInterceptors(FilesInterceptor('comission_sales_incentive_evidences'))
  async create(
    @Body() createComissionSalesIncentiveDto: CreateComissionSalesIncentiveDto,
    @Req() req: RequestWithUser,
    @UploadedFiles() comission_sales_incentive_evidences: Express.Multer.File[],
  ) {
    return await this.comissionSalesIncentiveService.create(
      createComissionSalesIncentiveDto,
      req.user,
      comission_sales_incentive_evidences,
    );
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto) {
    return await this.comissionSalesIncentiveService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.comissionSalesIncentiveService.findOne(+id);
  }

  @Patch(':id')
  @UseInterceptors(FilesInterceptor('comission_sales_incentive_evidences'))
  update(
    @Param('id') id: string,
    @Body() updateComissionSalesIncentiveDto: UpdateComissionSalesIncentiveDto,
    @UploadedFiles() comission_sales_incentive_evidences: Express.Multer.File[],
    @Req() req: RequestWithUser,
  ) {
    return this.comissionSalesIncentiveService.update(
      +id,
      updateComissionSalesIncentiveDto,
      comission_sales_incentive_evidences,
      req.user,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.comissionSalesIncentiveService.remove(+id);
  }
}
