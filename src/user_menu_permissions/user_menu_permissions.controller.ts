import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { UserMenuPermissionsService } from './user_menu_permissions.service';
import { CreateUserMenuPermissionDto } from './dto/create-user_menu_permission.dto';
import { UpdateUserMenuPermissionDto } from './dto/update-user_menu_permission.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('user-menu-permissions')
export class UserMenuPermissionsController {
  constructor(private readonly userMenuPermissionsService: UserMenuPermissionsService) { }

  @Post('/create')
  create(@Body() createUserMenuPermissionDto: CreateUserMenuPermissionDto, @Request() req) {
    const user_id = req.user.id
    return this.userMenuPermissionsService.create(createUserMenuPermissionDto, user_id);
  }

  @Get('/get')
  findAll() {
    return this.userMenuPermissionsService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.userMenuPermissionsService.findOne(+id);
  }

  @Patch('/update/:id')
  update(@Param('id') id: string, @Body() updateUserMenuPermissionDto: UpdateUserMenuPermissionDto, @Request() req) {
    const user_id = req.user.id
    return this.userMenuPermissionsService.update(+id, updateUserMenuPermissionDto, user_id);
  }
}
