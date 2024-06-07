import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Res,
  HttpStatus,
  Query,
  UploadedFiles,
  UseInterceptors,
  Req,
  ParseIntPipe,
  UploadedFile,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { users } from '@prisma/client';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from 'src/prisma/prisma.service';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';

@ApiTags('Invoices')
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('/export-excel')
  async orderExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.invoicesService.invoiceExportExcel(res, query);
  }

  @Post('/upload-excel-invoice')
  @UseInterceptors(FileInterceptor('excel_file'))
  async syncInvoiceUpdate(@UploadedFile() file: Express.Multer.File, @Req() req: IExpressRequest) {
    return await this.invoicesService.syncInvoiceFromExcel(file);
  }

  @Post('/payment')
  @UseInterceptors(FilesInterceptor('invoice_evidences'))
  async updateInvoiceToPayment(@Body() dto: UpdateInvoiceDto) {
    return await this.invoicesService.updateInvoicesPayment(dto);
  }

  @Get('/export-excel-template')
  async invoiceTemplateExcel(@Res() res: IExpressResponse) {
    return await this.invoicesService.templateInvoiceExcel(res);
  }

  @Get('next-code')
  async nextCode() {
    const invoices = await this.invoicesService.nextCode();
    let nextCode: number;
    if (invoices) {
      nextCode = invoices.id + 1;
    } else {
      nextCode = 0 + 1;
    }

    return {
      code: nextCode,
    };
  }

  @Post()
  @UseInterceptors(FilesInterceptor('invoice_evidences'))
  async create(
    @Body() createInvoiceDto: CreateInvoiceDto,
    @Request() req: RequestWithUser,
    @UploadedFiles() invoice_evidences: Array<Express.Multer.File>,
  ) {
    return await this.invoicesService.create(
      createInvoiceDto,
      req.user,
      invoice_evidences,
    );
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto) {
    console.log('invoice findAll')
    return await this.invoicesService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.invoicesService.findOne(+id);
  }

  @Post(':id')
  @UseInterceptors(FilesInterceptor('invoice_evidences'))
  async update(
    @Param('id') id: number,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
    @Request() req: RequestWithUser,
    @UploadedFiles() invoice_evidences: Array<Express.Multer.File>,
  ) {
    return await this.invoicesService.update(
      id,
      updateInvoiceDto,
      req.user,
      invoice_evidences,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    return await this.invoicesService.remove(+id, req.user);
  }
}
