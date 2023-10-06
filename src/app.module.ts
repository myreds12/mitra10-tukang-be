import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
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
import { VendorBankModule } from './vendor_bank/vendor_bank.module';
import { VendorDocumentModule } from './vendor_document/vendor_document.module';
import { RoleMenusModule } from './role_menus/role_menus.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RoleMenuPermissionsModule } from './role_menu_permissions/role_menu_permissions.module';
import { UserMenuPermissionsModule } from './user_menu_permissions/user_menu_permissions.module';
import { OrderModule } from './order/order.module';
import { EventLoggerModule } from './event-logger/event-logger.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CategoriesModule } from './categories/categories.module';
import { StatusModule } from './status/status.module';
import { WorkOrdersModule } from './work_orders/work_orders.module';
import { QuotationModule } from './quotation/quotation.module';
import { ComplaintsModule } from './complaints/complaints.module';
<<<<<<< HEAD
import { ComplaintChannelModule } from './complaint_channel/complaint_channel.module';
=======
import { ComplaintChannelsModule } from './complaint_channels/complaint_channels.module';
>>>>>>> e5b6aef08d11020b7d2cd882a491470b2bea7752

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
    VendorBankModule,
    VendorDocumentModule,
    RoleMenusModule,
    PermissionsModule,
    RoleMenuPermissionsModule,
    UserMenuPermissionsModule,
    OrderModule,
    EventLoggerModule,
    EventEmitterModule.forRoot({
      wildcard: true,
      // the delimiter used to segment namespaces
      delimiter: '.',
      // set this to `true` if you want to emit the newListener event
      newListener: false,
      // set this to `true` if you want to emit the removeListener event
      removeListener: false,
      // the maximum amount of listeners that can be assigned to an event
      maxListeners: 10,
      // show event name in memory leak message when more than maximum amount of listeners is assigned
      verboseMemoryLeak: false,
      // disable throwing uncaughtException if an error event is emitted and it has no listeners
      ignoreErrors: false,
    }),
    CategoriesModule,
    StatusModule,
    WorkOrdersModule,
    QuotationModule,
    ComplaintsModule,
<<<<<<< HEAD
    ComplaintChannelModule,
=======
    ComplaintChannelsModule,
>>>>>>> e5b6aef08d11020b7d2cd882a491470b2bea7752
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
