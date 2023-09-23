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
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { DataDto } from './dto/create-item.dto';
import { UpdateDataDto } from './dto/update-item.dto';

@Controller('items')
@UseGuards(JwtAuthGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) { }

  @Post('/create')
  create(@Body() dataDto: DataDto, @Request() req) {
    const user_id = req.user.id;
    return this.itemsService.create(dataDto, user_id);
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
    @Body() UpdateDataDto: UpdateDataDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    return this.itemsService.update(+id, UpdateDataDto, user_id);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id;
    return this.itemsService.remove(+id, user_id);
  }
}
