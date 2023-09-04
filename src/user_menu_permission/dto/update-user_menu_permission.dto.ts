import { PartialType } from '@nestjs/swagger';
import { CreateUserMenuPermissionDto } from './create-user_menu_permission.dto';

export class UpdateUserMenuPermissionDto extends PartialType(CreateUserMenuPermissionDto) {}
