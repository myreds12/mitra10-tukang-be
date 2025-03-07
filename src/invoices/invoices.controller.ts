import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Res,
  Query,
  UploadedFiles,
  UseInterceptors,
  ParseIntPipe,
  UploadedFile,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Response as IExpressResponse } from 'express';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';

@ApiTags('Invoices')
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) { }

  // @Get('/order')
  // async getOrderInvoice(@Query() query: QueryParamsDto) {
  //   return await this.invoicesService.getOrderInvoice(query);
  // }

  @Get('/:id/export-excel')
  async invoiceDetailsExportExcel(
    @Param('id') id: string,
    @Res() res: IExpressResponse,
  ) {
    return await this.invoicesService.invoiceDetailsExportExcel(+id, res);
  }

  @Get('/pdf/:id')
  async downloadPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: IExpressResponse,
  ) {
    return await this.invoicesService.invoicePdf(id, res);
  }

  @Get('/rekonsel-pdf/:id')
  async rekonselPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: IExpressResponse,
  ) {
    return await this.invoicesService.rekonselPdf(id, res);
  }

  @Get('/:id/rekonsel/export-excel')
  async invoiceRekonselExportExcel(
    @Param('id') id: string,
    @Res() res: IExpressResponse,
  ) {
    return await this.invoicesService.rekonselInvoices(+id, res);
  }

  @Get('/export-excel')
  async invoiceExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: IExpressResponse,
  ) {
    return await this.invoicesService.invoiceExportExcel(res, query);
  }

  @Post('/upload-excel-invoice')
  @UseInterceptors(FileInterceptor('excel_file'))
  async syncInvoiceUpdate(@UploadedFile() file: Express.Multer.File) {
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
