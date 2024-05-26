import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  ParseIntPipe,
  UploadedFiles,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { VendorService } from './vendor.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';
import { Response } from 'express';

@Controller('vendor')
@UseGuards(JwtAuthGuard)
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}
  
  @Get('/export-excel')
  @UseGuards()
  async orderExportExcel(
    @Query() query: QueryParamsDto,
    @Res() res: Response) {
      const data = await this.vendorService.vendorExportExcel(res, query);
      return data;
  }

  @Get('next-code')
  async nextCode() {
    const vendor = await this.vendorService.nextCode();
    let nextCode: number;
    if (vendor) nextCode = vendor.id + 1;
    return { code: nextCode };
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
      { name: 'ptkp_file', maxCount: 1 },
    ]),
  )
  async create(
    @UploadedFiles() files: VendorFiles,
    @Body() createVendorDto: CreateVendorDto,
    @Request() req: RequestWithUser,
  ) {
    return await this.vendorService.create(files, createVendorDto, req.user);
  }

  @Get('/')
  async findAll(@Query() query: QueryParamsDto) {
    return await this.vendorService.findAll(query);
  }

  @Get('/:id')
  async findOne(@Param('id', ParseIntPipe) id: string) {
    return await this.vendorService.findOne(+id);
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
    @Request() req: RequestWithUser,
  ) {
    return await this.vendorService.update(
      id,
      files,
      updateVendorDto,
      req.user,
    );
  }

  @Delete('/:id')
  async remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    return await this.vendorService.remove(+id, req.user);
  }
}
