import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { RoleMenusService } from './role_menus.service';
import { CreateRoleMenuDto } from './dto/create-role_menu.dto';
import { UpdateRoleMenuDto } from './dto/update-role_menu.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('role-menus')
export class RoleMenusController {
  constructor(private readonly roleMenusService: RoleMenusService) { }

  @Post('/create')
  create(@Body() createRoleMenuDto: CreateRoleMenuDto, @Request() req) {
    const user_id = req.user.id
    return this.roleMenusService.create(createRoleMenuDto, user_id);
  }

  @Get('/get')
  findAll() {
    return this.roleMenusService.findAll();
  }

  @Get('/find/:id')
  findOne(@Param('id') id: string) {
    return this.roleMenusService.findOne(+id);
  }

  @Patch('/update/:id')
  update(@Param('id') id: string, @Body() updateRoleMenuDto: UpdateRoleMenuDto, @Request() req) {
    const user_id = req.user.id
    return this.roleMenusService.update(+id, updateRoleMenuDto, user_id);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string, @Request() req) {
    const user_id = req.user.id
    return this.roleMenusService.remove(+id, user_id);
  }
}
