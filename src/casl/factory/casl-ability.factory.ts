import { MongoAbility, createMongoAbility } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { users } from '@prisma/client';
import { PermissionAction } from '../enum/permission-action.enum';

export type PermissionObjectType = any;
export type AppAbility = MongoAbility<[PermissionAction, PermissionObjectType]>;
interface CaslPermission {
  action: PermissionAction;
  // In our database, Invoice, Project... are called "object"
  // but in CASL they are called "subject"
  subject: string;
}

@Injectable()
export class CaslAbilityFactory {
  constructor(private authService: AuthService) {}

  async createForUser(user: users): Promise<AppAbility> {
    const dbPermissions = await this.authService.getUserPermission(user);
    const caslPermissions: CaslPermission[] = dbPermissions.map((p) => ({
      action: p.name,
      subject: p.menus.title.toLowerCase(),
    }));

    return createMongoAbility<AppAbility>(caslPermissions);
  }
}
