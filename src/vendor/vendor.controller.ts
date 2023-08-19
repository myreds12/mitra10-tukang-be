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
} from '@nestjs/common';
import { VendorService } from './vendor.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@Controller('vendor')
@UseGuards(JwtAuthGuard)
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}
  @Post('/create')
  create(@Body() createVendorDto: CreateVendorDto, @Request() req) {
    const user_id = req.user.id;
    return this.vendorService.create(createVendorDto, user_id);
  }

  @Get('/get')
  findAll() {
    return this.vendorService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.vendorService.findOne(+id);
  }

  @Patch('/update/:id')
  update(
    @Param('id') id: string,
    @Body() updateVendorDto: UpdateVendorDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.vendorService.update(+id, updateVendorDto, user_id);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.vendorService.remove(+id, user_id);
  }
}
