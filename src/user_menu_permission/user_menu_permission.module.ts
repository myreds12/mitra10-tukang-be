import { Module } from '@nestjs/common';
import { UserMenuPermissionService } from './user_menu_permission.service';
import { UserMenuPermissionController } from './user_menu_permission.controller';

@Module({
  controllers: [UserMenuPermissionController],
  providers: [UserMenuPermissionService]
})
export class UserMenuPermissionModule {}
