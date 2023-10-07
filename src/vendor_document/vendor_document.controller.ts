import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, UseInterceptors, UploadedFile } from '@nestjs/common';
import { VendorDocumentService } from './vendor_document.service';
import { CreateVendorDocumentDto } from './dto/create-vendor_document.dto';
import { UpdateVendorDocumentDto } from './dto/update-vendor_document.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@UseGuards(JwtAuthGuard)
@Controller('vendor-document')
@UseInterceptors(
  FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/vendor',
      filename: (req, file, callback) => {
        const uniqueSuffix = Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname);
        const filename = `${uniqueSuffix}${ext}`;
        callback(null, filename);
      },
    }),
  }),
)
export class VendorDocumentController {
  constructor(private readonly vendorDocumentService: VendorDocumentService) { }

  @Post('/create')
  create(@Body() createVendorDocumentDto: CreateVendorDocumentDto, @Request() req, @UploadedFile() file: Express.Multer.File) {
    const user_id = req.user.id
    return this.vendorDocumentService.create(createVendorDocumentDto, user_id, file);
  }

  @Get('/get')
  findAll() {
    return this.vendorDocumentService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.vendorDocumentService.findOne(+id);
  }

  @Post('/update/:id')
  update(@Param('id') id: string, @Body() updateVendorDocumentDto: UpdateVendorDocumentDto, @Request() req, @UploadedFile() file: Express.Multer.File) {
    const user_id = req.user.id
    return this.vendorDocumentService.update(+id, updateVendorDocumentDto, user_id, file);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id
    return this.vendorDocumentService.remove(+id, user_id);
  }
}
