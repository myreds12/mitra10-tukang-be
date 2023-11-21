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
  Res,
  HttpStatus,
} from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';
@ApiTags('Stores')
@Controller('stores')
@UseGuards(JwtAuthGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post('/')
  async create(@Body() createStoreDto: CreateStoreDto, @Request() req) {
    const user_id = req.user.id;

    return this.storeService.create(createStoreDto, user_id);
  }

  @Get('/')
  async findAll(
    @Query() query: QueryParamsDto,
    @Res() response: IExpressResponse,
  ) {
    try {
      const complaint = await this.storeService.findAll(query);
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Store',
        data: complaint,
      });
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Get',
        stack: error,
      });
    }
  }

  @Get('/:id')
  async findOne(@Param('id') id: string) {
    return this.storeService.findOne(+id);
  }

  @Post('/:id')
  async update(
    @Param('id') id: string,
    @Body() updateStoreDto: UpdateStoreDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.storeService.update(+id, updateStoreDto, user_id);
  }

  @Delete('/:id')
  async remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.storeService.remove(+id, user_id);
  }
}
