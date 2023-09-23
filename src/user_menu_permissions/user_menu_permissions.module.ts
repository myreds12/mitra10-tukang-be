import { Module } from '@nestjs/common';
import { UserMenuPermissionsService } from './user_menu_permissions.service';
import { UserMenuPermissionsController } from './user_menu_permissions.controller';

@Module({
  controllers: [UserMenuPermissionsController],
  providers: [UserMenuPermissionsService]
})
export class UserMenuPermissionsModule {}
