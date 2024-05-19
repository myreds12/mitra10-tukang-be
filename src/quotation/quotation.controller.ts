import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  Res,
  HttpStatus,
  Query,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {
  FileFieldsInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { users } from '@prisma/client';

interface UserRequest extends IExpressRequest {
  user: users;
}

@UseGuards(JwtAuthGuard)
@Controller('quotation')
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) {}

  @Get('next-code')
  async getCode(@Req() req: UserRequest, @Res() res: IExpressResponse) {
    try {
      const code = await this.quotationService.getCode();
      let nextCode = 1;
      if (code) nextCode = code.id + 1;

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Quotation code pulled',
        data: { code: nextCode },
      });
    } catch (error) {
      console.error(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While pulling complaint code',
        stack: error,
      });
    }
  }

  @Post(':id/set-status/:status_id')
  async setStatus(
    @Param('id') id: number,
    @Param('status_id') status_id: number,
    @Request() req,
    @Res() response,
  ) {
    try {
      const user = req.user;
      const quotation = await this.quotationService.setStatus(
        id,
        status_id,
        user,
      );
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Quotation Updated',
        data: quotation,
      });
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: error.message,
        stack: error,
      });
    }
  }

  @Post()
  @UseInterceptors(FilesInterceptor('quotation_files'))
  async create(
    @Body() createQuotationDto: CreateQuotationDto,
    @UploadedFiles() quotation_files: Express.Multer.File[],
    @Req() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const user = req.user;
      const quotation = await this.quotationService.create(
        createQuotationDto,
        user,
        quotation_files,
      );

      return res.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Quotation Created',
        data: quotation,
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
  async findAll(@Query() queryParamsDto: QueryParamsDto, @Res() response) {
    try {
      const { data, page, skip, take, total, takeTotal, quotationGrandTotal } =
        await this.quotationService.findAll(queryParamsDto);

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Quotation',
        data,
        total,
        page,
        take,
        skip,
        quotationGrandTotal,
        takeTotal,
      });
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: IExpressResponse) {
    try {
      const quotation = await this.quotationService.findOne(+id);

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Find Quotation',
        data: quotation,
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Find',
        stack: error,
      });
    }
  }

  @Post(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'quotation_files', maxCount: 10 },
      { name: 'quotation_receipts', maxCount: 10 },
    ]),
  )
  async update(
    @Param('id') id: string,
    @Body() updateQuotationDto: UpdateQuotationDto,
    @Request() req,
    @UploadedFiles() files: { [name: string]: Express.Multer.File[] },
    @Res() response,
  ) {
    try {
      const user = req.user;
      console.log(user);
      console.log('files => ', files);
      const quotation = await this.quotationService.update(
        +id,
        updateQuotationDto,
        user,
        files,
      );
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Quotation Updated',
        // data: quotation,
      });
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update',
        stack: error,
      });
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req, @Res() response) {
    try {
      const user_id = req.user.id;
      const quotation = await this.quotationService.remove(+id, user_id);

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Quotation Deleted',
        data: quotation,
      });
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Update',
        stack: error,
      });
    }
  }
}
