import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RoleMenuPermissionsService } from './role_menu_permissions.service';
import { CreateRoleMenuPermissionDto } from './dto/create-role_menu_permission.dto';
import { UpdateRoleMenuPermissionDto } from './dto/update-role_menu_permission.dto';

@Controller('role-menu-permissions')
export class RoleMenuPermissionsController {
  constructor(private readonly roleMenuPermissionsService: RoleMenuPermissionsService) { }

  @Post('/create')
  create(@Body() createRoleMenuPermissionDto: CreateRoleMenuPermissionDto) {
    return this.roleMenuPermissionsService.create(createRoleMenuPermissionDto);
  }

  @Get('/get')
  findAll() {
    return this.roleMenuPermissionsService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.roleMenuPermissionsService.findOne(+id);
  }

  @Patch('/update/:id')
  update(@Param('id') id: string, @Body() updateRoleMenuPermissionDto: UpdateRoleMenuPermissionDto) {
    return this.roleMenuPermissionsService.update(+id, updateRoleMenuPermissionDto);
  }
}
