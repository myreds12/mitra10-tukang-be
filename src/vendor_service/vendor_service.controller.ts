import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { VendorServiceService } from './vendor_service.service';
import { CreateVendorServiceDto } from './dto/create-vendor_service.dto';
import { UpdateVendorServiceDto } from './dto/update-vendor_service.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('vendor-service')
export class VendorServiceController {
  constructor(private readonly vendorServiceService: VendorServiceService) {}

  @Post('/create')
  create(@Body() createVendorServiceDto: CreateVendorServiceDto, @Req() req) {
    const user_id = req.user.id;
    return this.vendorServiceService.create(createVendorServiceDto, user_id);
  }

  @Get('/data')
  findAll() {
    return this.vendorServiceService.findAll();
  }

  @Get('/data/:id')
  findOne(@Param('id') id: string) {
    return this.vendorServiceService.findOne(+id);
  }

  @Post('/update/:id')
  update(
    @Param('id') id: string,
    @Body() updateVendorServiceDto: UpdateVendorServiceDto,
    @Req() req,
  ) {
    const user_id = req.user.id;
    return this.vendorServiceService.update(
      +id,
      updateVendorServiceDto,
      user_id,
    );
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Req() req) {
    const user_id = req.user.id;
    return this.vendorServiceService.remove(+id, user_id);
  }
}
