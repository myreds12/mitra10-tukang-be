import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpStatus,
  Res,
  Query,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSalesDto } from './dto/create-sales.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Response } from 'express';
import { sales } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { FileInterceptor } from '@nestjs/platform-express';
@ApiTags('Sales')
@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('/export-excel')
  @UseGuards()
  async salesExportExcel(@Query() query: QueryParamsDto, @Res() res: Response) {
    console.log(query.store_id);
    if (!query.store_id?.length) {
      throw new BadRequestException(
        'Anda harus memilih Store terlebih dahulu.',
      );
    }

    return await this.salesService.salesExportExcel(res, query);
  }

  @Post('/upload-excel-sales')
  @UseInterceptors(FileInterceptor('excel_file'))
  async syncSalesCommission(@UploadedFile() file: Express.Multer.File) {
    return await this.salesService.syncSalesCommission(file);
  }

  @Get('/export-excel-template')
  @UseGuards()
  async salesExportTemplateExcel(@Res() res: Response) {
    return await this.salesService.templateDefaultExcel(res);
  }

  @Get('next-code')
  async getCode() {
    const code = await this.salesService.getCode();
    let nextCode = 1;
    if (code) nextCode = code.id + 1;

    return { code: nextCode };
  }

  @Post('/salesUser/:store_id')
  async salesUser(@Param('store_id') store_id: number) {
    return await this.salesService.salesUser(store_id);
  }

  @Post()
  async create(
    @Body() createSaleDto: CreateSalesDto,
    @Request() req: RequestWithUser,
  ): Promise<sales> {
    const user = req.user;
    return await this.salesService.create(createSaleDto, user);
  }

  @Get()
  async findAll(
    @Query() query: QueryParamsDto,
  ): Promise<{ data: sales[]; meta?: any }> {
    return await this.salesService.findAll(query);
  }

  @Get('/:id')
  async findOne(@Param('id') id: number): Promise<sales> {
    return await this.salesService.findOne(id);
  }

  @Post('/:id')
  async update(
    @Param('id') id: number,
    @Body() updateSaleDto: UpdateSalesDto,
    @Request() req: RequestWithUser,
  ): Promise<sales> {
    const user = req.user;
    return await this.salesService.update(id, updateSaleDto, user);
  }

  @Delete('/:id')
  async remove(@Param('id') id: number, @Request() req: RequestWithUser) {
    const user = req.user;
    return await this.salesService.remove(id, user);
  }
}
