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
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import { BankService } from './bank.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';

@Controller('bank')
export class BankController {
  constructor(private readonly bankService: BankService) {}

  // Public endpoint for vendor registration (no auth required)
  @Get('public/list')
  async findAllPublic() {
    return await this.bankService.findAllPublic();
  }

  @UseGuards(JwtAuthGuard)
  @Get('next-code')
  async getCode() {
    try {
      const code = await this.bankService.getCode();
      let nextCode = 1;
      if (code) nextCode = code.id + 1;

      return { code: nextCode };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('/')
  async create(
    @Body() createBankDto: CreateBankDto,
    @Request() req: RequestWithUser,
  ) {
    const user_id = req.user.id;
    return await this.bankService.create(createBankDto, user_id);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Query() query: QueryParamsDto) {
    return await this.bankService.findAll(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/find/:id')
  async findOne(@Param('id') id: string) {
    return await this.bankService.findOne(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/:id')
  async update(
    @Param('id') id: string,
    @Body() updateBankDto: UpdateBankDto,
    @Request() req: RequestWithUser,
  ) {
    const user_id = req.user.id;
    return await this.bankService.update(+id, updateBankDto, user_id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('/:id')
  async remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    const user_id = req.user.id;
    return await this.bankService.remove(+id, user_id);
  }
}
