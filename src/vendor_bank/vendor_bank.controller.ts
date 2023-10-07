import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { VendorBankService } from './vendor_bank.service';
import { CreateVendorBankDto } from './dto/create-vendor_bank.dto';
import { UpdateVendorBankDto } from './dto/update-vendor_bank.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('vendor-bank')
export class VendorBankController {
  constructor(private readonly vendorBankService: VendorBankService) { }

  @Post('/create')
  create(@Body() createVendorBankDto: CreateVendorBankDto, @Request() req) {
    const user_id = req.user.id
    return this.vendorBankService.create(createVendorBankDto, user_id);
  }

  @Get('/get')
  findAll() {
    return this.vendorBankService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.vendorBankService.findOne(+id);
  }

  @Post('/update/:id')
  update(@Param('id') id: string, @Body() updateVendorBankDto: UpdateVendorBankDto, @Request() req) {
    const user_id = req.user.id
    return this.vendorBankService.update(+id, updateVendorBankDto, user_id);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id
    return this.vendorBankService.remove(+id, user_id);
  }
}
