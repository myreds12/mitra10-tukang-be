import { Global, Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { CaslAbilityFactory } from 'src/casl/factory/casl-ability.factory';
import { PermissionsGuard } from 'src/casl/guards/permissions.guard';

@Global()
@Module({
  providers: [CaslAbilityFactory, PermissionsGuard],
  exports: [CaslAbilityFactory, PermissionsGuard],
  imports: [AuthModule],
})
export class CaslModule {}
