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
  ValidationPipe,
  UsePipes,
  Query,
  Res,
  HttpStatus,
  ParseIntPipe,
  UploadedFiles,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { VendorService } from './vendor.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { users } from '@prisma/client';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

interface UserRequest extends IExpressRequest {
  user: users;
}

@Controller('vendor')
@UseGuards(JwtAuthGuard)
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Get('next-code')
  async nextCode(@Req() req: IExpressRequest, @Res() res: IExpressResponse) {
    try {
      const vendor = await this.vendorService.nextCode();
      let nextCode;
      if (vendor) nextCode = vendor.id + 1;
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Next Code',
        data: {
          code: nextCode,
        },
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Post('/')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'vendor_document', maxCount: 5 },
      { name: 'npwp_file', maxCount: 1 },
      { name: 'ktp_file', maxCount: 1 },
      { name: 'compro_file', maxCount: 1 },
      { name: 'surat_permohonan_file', maxCount: 1 },
      { name: 'pks_file', maxCount: 1 },
      { name: 'suip_file', maxCount: 1 },
    ]),
  )
  async create(
    @UploadedFiles() files: VendorFiles,
    @Body() createVendorDto: CreateVendorDto,
    @Request() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const { vendor, users } = await this.vendorService.create(
        files,
        createVendorDto,
        req.user,
      );

      return res.status(201).json({
        status: HttpStatus.CREATED,
        messages: 'Vendor Created.',
        data: vendor,
        user: users,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      });
    }
  }

  @Get('/')
  async findAll(@Query() query: QueryParamsDto, @Res() res: IExpressResponse) {
    try {
      const { data, page, take, countTotal } = await this.vendorService.findAll(
        query,
      );
      return res.status(200).json({
        status: HttpStatus.OK,
        messages: 'Ok',
        data,
        page,
        take,
        total: countTotal,
      });
    } catch (error) {
      console.log(error.message);

      return {
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      };
    }
  }

  @Get('/:id')
  async findOne(@Param('id', ParseIntPipe) id: string) {
    try {
      const vendor = await this.vendorService.findOne(+id);
      return {
        status: HttpStatus.OK,
        messages: 'Ok',
        data: vendor,
      };
    } catch (error) {
      console.log(error.message);

      return {
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      };
    }
  }

  @Post('/:id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'vendor_document', maxCount: 5 },
      { name: 'npwp_file', maxCount: 1 },
      { name: 'ktp_file', maxCount: 1 },
      { name: 'compro_file', maxCount: 1 },
      { name: 'surat_permohonan_file', maxCount: 1 },
      { name: 'pks_file', maxCount: 1 },
      { name: 'suip_file', maxCount: 1 },
    ]),
  )
  async update(
    @Param('id') id: number,
    @UploadedFiles() files: VendorFiles,
    @Body() updateVendorDto: UpdateVendorDto,
    @Request() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const order = await this.vendorService.update(
        id,
        files,
        updateVendorDto,
        req.user,
      );

      return res.status(200).json({
        status: HttpStatus.OK,
        messages: 'Order Updated.',
        data: order,
      });
    } catch (error) {
      console.log(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      });
    }
  }

  @Delete('/:id')
  async remove(
    @Param('id') id: string,
    @Request() req: UserRequest,
    @Res() res: IExpressResponse,
  ) {
    try {
      const vendor = await this.vendorService.remove(+id, req.user);
      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Vendor Deleted',
      });
    } catch (error) {
      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        messages: error.message,
        stack: error,
      });
    }
  }
}
