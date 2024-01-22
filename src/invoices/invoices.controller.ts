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
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from 'src/prisma/prisma.service';

interface UserRequest extends IExpressRequest {
  user: users;
}
@ApiTags('Invoices')
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly dbService: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  @Post('/payment')
  @UseInterceptors(FilesInterceptor('invoice_evidences'))
  async updateInvoiceToPayment(
    @Body() dto: UpdateInvoiceDto,
    @Res() res: IExpressResponse,
  ) {
    try {
      const updated = await this.invoicesService.updateInvoicesPayment(
       dto
      );

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Invoice Updated',
        data: updated,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.messages ?? error?.messages ?? 'Error while update',
        stack: error,
      });
    }
  }

  @Get('next-code')
  async nextCode(
    @Request() req: IExpressRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const invoices = await this.invoicesService.nextCode();
      let nextCode: number;
      if (invoices) {
        nextCode = invoices.id + 1;
      } else {
        nextCode = 0 + 1;
      }

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Next Code',
        data: {
          code: nextCode,
        },
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Post()
  @UseInterceptors(FilesInterceptor('invoice_evidences'))
  async create(
    @Body() createInvoiceDto: CreateInvoiceDto,
    @Request() req: UserRequest,
    @UploadedFiles() invoice_evidences: Array<Express.Multer.File>,
    @Res() res: IExpressResponse,
  ) {
    try {
      console.log(createInvoiceDto);

      let invoice;
      if (invoice_evidences) {
        invoice = await this.invoicesService.create(
          createInvoiceDto,
          req.user,
          invoice_evidences,
        );
      } else {
        invoice = await this.invoicesService.create(createInvoiceDto, req.user);
      }
      console.log(invoice);

      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Invoice Created',
        data: invoice,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error,
      });
    }
  }

  @Get()
  async findAll(@Query() query: QueryParamsDto, @Res() res: IExpressResponse) {
    try {
      const invoice = await this.invoicesService.findAll(query);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Invoice',
        data: invoice,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: IExpressResponse) {
    try {
      const invoice = await this.invoicesService.findOne(+id);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Invoice',
        data: invoice,
      });
    } catch (error) {
      console.log(error);
      
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Post(':id')
  @UseInterceptors(FilesInterceptor('invoice_evidences'))
  async update(
    @Param('id') id: number,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
    @Request() req: UserRequest,
    @UploadedFiles() invoice_evidences: Array<Express.Multer.File>,
    @Res() res: IExpressResponse,
  ) {
    try {
      const invoice = await this.dbService.invoices.findFirstOrThrow({
        where: { id },
      });
      const updated = await this.invoicesService.update(
        invoice,
        updateInvoiceDto,
        req.user,
        invoice_evidences,
      );

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Invoice Updated',
        data: updated,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.messages ?? error?.messages ?? 'Error while update',
        stack: error,
      });
    }
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Request() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const invoice = await this.invoicesService.remove(+id, req.user);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Invoice Deleted',
        data: invoice,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Delete',
        stack: error,
      });
    }
  }
}
