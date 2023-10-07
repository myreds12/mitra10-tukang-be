// import { MongoAbility } from '@casl/ability';
// import { Injectable } from '@nestjs/common';
// import { AuthService } from '../auth.service';
// import { user_menu_permissions, users } from '@prisma/client';
// export enum PermissionAction {
//   CREATE = 'create',
//   READ = 'read',
//   UPDATE = 'update',
//   DELETE = 'delete',
// }
// export type PermissionObjectType = any;
// export type AppAbility = MongoAbility<[PermissionAction, PermissionObjectType]>;
// interface CaslPermission {
//   action: PermissionAction;
//   // In our database, Invoice, Project... are called "object"
//   // but in CASL they are called "subject"
//   subject: string;
// }
// interface user {
//   id: number;
//   username: string;
// }
// @Injectable()
// export class CaslAbilityFactory {
//   constructor(private authService: AuthService) {}
//   async createForUser(user: users): Promise<AppAbility> {
//     const dbPermissions: user_menu_permissions[] =
//       await this.authService.getUserPermission(user);
//     const caslPermissions: CaslPermission[] = dbPermissions.map((p) => ({
//       action: p.action,
//       subject: p.permissionObject.name,
//     }));
//     return new Ability<[PermissionAction, PermissionObjectType]>(
//       caslPermissions,
//     );
//   }
// }
