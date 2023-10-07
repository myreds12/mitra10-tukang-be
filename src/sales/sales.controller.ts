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
import { SalesService } from './sales.service';
import { CreateSalesDto } from './dto/create-sale.dto';
import { UpdateSalesDto } from './dto/update-sale.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('/create')
  create(@Body() createSaleDto: CreateSalesDto, @Request() req) {
    const user_id = req.user.id;
    return this.salesService.create(createSaleDto, user_id);
  }

  @Get('/get')
  findAll() {
    return this.salesService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(+id);
  }

  @Post('/update/:id')
  update(
    @Param('id') id: string,
    @Body() updateSaleDto: UpdateSalesDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.salesService.update(+id, updateSaleDto, user_id);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.salesService.remove(+id, user_id);
  }
}
