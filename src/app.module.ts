import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtConfig } from './jwt.config';
import { StoreModule } from './store/store.module';
import { RolesModule } from './roles/roles.module';
import { PositionsModule } from './positions/positions.module';
import { MenusModule } from './menus/menus.module';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ServiceTypeModule } from './service_type/service_type.module';
import { BankModule } from './bank/bank.module';
import { EmployeeModule } from './employee/employee.module';
import { SalesModule } from './sales/sales.module';
import { ItemsModule } from './items/items.module';
import { VendorModule } from './vendor/vendor.module';
import { VendorAreaModule } from './vendor_area/vendor_area.module';
import { TukangModule } from './tukang/tukang.module';
import { MemberModule } from './member/member.module';
import { VendorServiceModule } from './vendor_service/vendor_service.module';
import { TukangServiceModule } from './tukang_service/tukang_service.module';
import { PermissionModule } from './permission/permission.module';
import { UserMenuPermissionModule } from './user_menu_permission/user_menu_permission.module';
import { OrderModule } from './order/order.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    StoreModule,
    RolesModule,
    PositionsModule,
    MenusModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    ServiceTypeModule,
    BankModule,
    EmployeeModule,
    SalesModule,
    ItemsModule,
    VendorModule,
    VendorAreaModule,
    TukangModule,
    MemberModule,
    VendorServiceModule,
    TukangServiceModule,
    PermissionModule,
    UserMenuPermissionModule,
    OrderModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
