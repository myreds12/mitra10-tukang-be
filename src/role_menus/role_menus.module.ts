import { Module } from '@nestjs/common';
import { RoleMenusService } from './role_menus.service';
import { RoleMenusController } from './role_menus.controller';

@Module({
  controllers: [RoleMenusController],
  providers: [RoleMenusService]
})
export class RoleMenusModule {}
