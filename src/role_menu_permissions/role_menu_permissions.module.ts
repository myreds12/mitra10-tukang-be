import { Module } from '@nestjs/common';
import { RoleMenuPermissionsService } from './role_menu_permissions.service';
import { RoleMenuPermissionsController } from './role_menu_permissions.controller';

@Module({
  controllers: [RoleMenuPermissionsController],
  providers: [RoleMenuPermissionsService]
})
export class RoleMenuPermissionsModule {}
