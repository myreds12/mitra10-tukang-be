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
  Query,
} from '@nestjs/common';
import { BankService } from './bank.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';

@Controller('bank')
@UseGuards(JwtAuthGuard)
export class BankController {
  constructor(private readonly bankService: BankService) { }

  @Post('/')
  create(@Body() createBankDto: CreateBankDto, @Request() req) {
    const user_id = req.user.id;
    return this.bankService.create(createBankDto, user_id);
  }

  @Get()
  findAll(@Query() query: QueryParamsDto) {
    return this.bankService.findAll(query);
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.bankService.findOne(+id);
  }

  @Post('/:id')
  update(
    @Param('id') id: string,
    @Body() updateBankDto: UpdateBankDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.bankService.update(+id, updateBankDto, user_id);
  }

  @Delete('/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.bankService.remove(+id, user_id);
  }
}
