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
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@Controller('items')
@UseGuards(JwtAuthGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post('/create')
  create(@Body() createItemDto: CreateItemDto, @Request() req) {
    const user_id = req.user.id;
    return this.itemsService.create(createItemDto, user_id);
  }

  @Get('/get')
  findAll() {
    return this.itemsService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.itemsService.findOne(+id);
  }

  @Patch('/update/:id')
  update(
    @Param('id') id: string,
    @Body() updateItemDto: UpdateItemDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.itemsService.update(+id, updateItemDto, user_id);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.itemsService.remove(+id, user_id);
  }
}
