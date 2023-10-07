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
import { BankService } from './bank.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('bank')
@UseGuards(JwtAuthGuard)
export class BankController {
  constructor(private readonly bankService: BankService) { }

  @Post('/create')
  create(@Body() createBankDto: CreateBankDto, @Request() req) {
    const user_id = req.user.id;
    return this.bankService.create(createBankDto, user_id);
  }

  @Get('/get')
  findAll() {
    return this.bankService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.bankService.findOne(+id);
  }

  @Post('/update/:id')
  update(
    @Param('id') id: string,
    @Body() updateBankDto: UpdateBankDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.bankService.update(+id, updateBankDto, user_id);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.bankService.remove(+id, user_id);
  }
}
