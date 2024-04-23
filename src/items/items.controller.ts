import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Res,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ItemsService } from './items.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateItemDto } from './dto/create-item.dto';
import { QueryParamsDto } from 'src/order/dto/query-params.dto';
import {
  Request as IExpressRequest,
  Response as IExpressResponse,
} from 'express';
import { users } from '@prisma/client';
import { UpdateItemDto } from './dto/update-item.dto';
import { ApiTags } from '@nestjs/swagger';

interface UserRequest extends IExpressRequest {
  user: users;
}
@ApiTags('Items')
@Controller('items')
@UseGuards(JwtAuthGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  async create(
    @Body() dataDto: CreateItemDto,
    @Req() request: UserRequest,
    @Res() response: IExpressResponse,
  ) {
    try {
      const user_id = request.user.id;
      const items = await this.itemsService.create(dataDto, user_id);
      return response.status(201).json({
        status: HttpStatus.CREATED,
        message: 'Item Created',
        data: items,
      });
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Create',
        stack: error,
      });
    }
  }

  @Get('/')
  async findAll(
    @Query() queryParamsDto: QueryParamsDto,
    @Req() request: UserRequest,
    @Res() response: IExpressResponse,
  ) {
    try {
      const user = request.user;

      const { data, total, page, take } = await this.itemsService.findAll(
        queryParamsDto,
        user,
      );

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Get Item',
        data,
        page,
        take,
        total,
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

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() response: IExpressResponse) {
    try {
      const items = await this.itemsService.findOne(+id);
      console.log(items);

      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Find Item',
        data: items,
      });
    } catch (error) {
      console.log(error);
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Find',
        stack: error,
      });
    }
  }

  @Post(':id')
  async update(
    @Param('id') id: string,
    @Body() UpdateDataDto: UpdateItemDto,
    @Req() request: UserRequest,
    @Res() response: IExpressResponse,
  ) {
    try {
      const user_id = request.user.id;
      const items = await this.itemsService.update(+id, UpdateDataDto, user_id);
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Item Updated',
        data: items,
      });
    } catch (error) {
      console.log(error);

      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Updating',
        stack: error,
      });
    }
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Req() request: UserRequest,
    @Res() response: IExpressResponse,
  ) {
    try {
      const user_id = request.user.id;
      const items = await this.itemsService.remove(+id, user_id);
      return response.status(200).json({
        status: HttpStatus.OK,
        message: 'Item Delete',
        data: items,
      });
    } catch (error) {
      return response.status(400).json({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error While Delete',
        stack: error,
      });
    }
  }
}
