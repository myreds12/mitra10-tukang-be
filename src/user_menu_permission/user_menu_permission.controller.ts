import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { UserMenuPermissionService } from './user_menu_permission.service';
import { CreateUserMenuPermissionDto } from './dto/create-user_menu_permission.dto';
import { UpdateUserMenuPermissionDto } from './dto/update-user_menu_permission.dto';

@Controller('user-menu-permission')
export class UserMenuPermissionController {
  constructor(
    private readonly userMenuPermissionService: UserMenuPermissionService,
  ) {}

  @Post('/create')
  create(@Body() createUserMenuPermissionDto: CreateUserMenuPermissionDto) {
    return this.userMenuPermissionService.create(createUserMenuPermissionDto);
  }

  @Get('/data')
  findAll() {
    return this.userMenuPermissionService.findAll();
  }

  @Get('/data/:id')
  findOne(@Param('id') id: string) {
    return this.userMenuPermissionService.findOne(+id);
  }

  @Patch('/update/:id')
  update(
    @Param('id') id: string,
    @Body() updateUserMenuPermissionDto: UpdateUserMenuPermissionDto,
  ) {
    return this.userMenuPermissionService.update(
      +id,
      updateUserMenuPermissionDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userMenuPermissionService.remove(+id);
  }
}
