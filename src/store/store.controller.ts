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
  Req,
} from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';

interface UserRequest extends IExpressRequest {
  user: users;
}
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { ApiTags } from '@nestjs/swagger';
import { users } from '@prisma/client';
@ApiTags('Stores')
@Controller('stores')
@UseGuards(JwtAuthGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get('next-code')
  async getCode(@Req() req: UserRequest, @Res() res: IExpressResponse) {
    try {
      const code = await this.storeService.getCode();
      let nextCode = 1;
      if (code) nextCode = code.id + 1;

      return res.status(200).json({
        status: HttpStatus.OK,
        message: 'Store code pulled',
        data: { code: nextCode },
      });
    } catch (error) {
      console.error(error);

      return res.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While pulling complaint code',
        stack: error,
      });
    }
  }

  @Post('/')
  async create(@Body() createStoreDto: CreateStoreDto, @Request() req) {
    const user_id = req.user.id;

    return await this.storeService.create(createStoreDto, user_id);
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
    try{

      const user_id = req.user.id;
      return this.storeService.update(+id, updateStoreDto, user_id);
    }catch(err){
      console.log(err);
      
    }
  }

  @Delete('/:id')
  async remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.storeService.remove(+id, user_id);
  }
}
