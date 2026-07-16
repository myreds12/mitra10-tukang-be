import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { PermissionObjectType } from '../factory/casl-ability.factory';
import { PermissionAction } from 'src/casl/enum/permission-action.enum';

export type RequiredPermission = [PermissionAction, PermissionObjectType];
export const PERMISSION_CHECKER_KEY = 'permission_checker_key';
export const CheckPermissions = (
  ...params: RequiredPermission[]
): CustomDecorator<string> => SetMetadata(PERMISSION_CHECKER_KEY, params);
