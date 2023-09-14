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
} from '@nestjs/common';
import { VendorAreaService } from './vendor_area.service';
import { CreateVendorAreaDto } from './dto/create-vendor_area.dto';
import { UpdateVendorAreaDto } from './dto/update-vendor_area.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@Controller('vendor-area')
@UseGuards(JwtAuthGuard)
export class VendorAreaController {
  constructor(private readonly vendorAreaService: VendorAreaService) {}

  @Post('/create')
  create(@Body() createVendorAreaDto: CreateVendorAreaDto, @Request() req) {
    const user_id = req.user.id;
    return this.vendorAreaService.create(createVendorAreaDto, user_id);
  }

  @Get('/get')
  findAll() {
    return this.vendorAreaService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.vendorAreaService.findOne(+id);
  }

  @Patch('/update/:id')
  update(
    @Param('id') id: string,
    @Body() updateVendorAreaDto: UpdateVendorAreaDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.vendorAreaService.update(+id, updateVendorAreaDto, user_id);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.vendorAreaService.remove(+id, user_id);
  }
}
