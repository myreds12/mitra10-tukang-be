import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
} from '@nestjs/common';
import { StoreGroupService } from './store_group.service';
import { UpdateStoreGroupDto } from './dto/update-store_group.dto';
import { RequestWithUser } from 'src/common/interface/request-with-user.interface';

@Controller('store-group')
export class StoreGroupController {
  constructor(private readonly storeGroupService: StoreGroupService) {}

  @Get('/:id')
  async findStoreWithStoreGroup(@Param('id') id: string) {
    return this.storeGroupService.storeByGroup(+id);
  }

  @Post('')
  async createStoreGroup(
    @Body() body: { group_name: string },
    @Request() req: RequestWithUser,
  ) {
    const { group_name } = body;
    const user_id = req.user.id;

    return await this.storeGroupService.createStoreGroup(group_name, user_id);
  }

  @Get()
  findAll() {
    return this.storeGroupService.findAll();
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateStoreGroupDto: UpdateStoreGroupDto,
  ) {
    return this.storeGroupService.update(+id, updateStoreGroupDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.storeGroupService.remove(+id);
  }
}
