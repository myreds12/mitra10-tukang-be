import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@Controller('store')
@UseGuards(JwtAuthGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) { }

  @Post('/create')
  create(@Body() createStoreDto: CreateStoreDto, @Request() req) {
    const user_id = req.user.id

    return this.storeService.create(createStoreDto, user_id);
  }

  @Get('/get')
  findAll() {
    return this.storeService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.storeService.findOne(+id);
  }

  @Patch('/update/:id')
  update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto, @Request() req) {
    const user_id = req.user.id
    return this.storeService.update(+id, updateStoreDto, user_id);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id
    return this.storeService.remove(+id, user_id);
  }
}
