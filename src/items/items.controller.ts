import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { ItemsService } from './items.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateItemDto } from './dto/create-item.dto';
import { QueryParamsDto } from 'src/common/dto/query-params.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ApiTags } from '@nestjs/swagger';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';

@ApiTags('Items')
@Controller('items')
@UseGuards(JwtAuthGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  async create(
    @Body() dataDto: CreateItemDto,
    @Req() request: RequestWithUser,
  ) {
    const user_id = request.user.id;
    return await this.itemsService.create(dataDto, user_id);
  }

  @Get('/')
  async findAll(@Query() queryParamsDto: QueryParamsDto) {
    return await this.itemsService.findAll(queryParamsDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.itemsService.findOne(+id);
  }

  @Post(':id')
  async update(
    @Param('id') id: string,
    @Body() UpdateDataDto: UpdateItemDto,
    @Req() request: RequestWithUser,
  ) {
    const user_id = request.user.id;
    return await this.itemsService.update(+id, UpdateDataDto, user_id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: RequestWithUser) {
    const user_id = request.user.id;
    return await this.itemsService.remove(+id, user_id);
  }
}
