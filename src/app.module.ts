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
import { TukangModule } from './tukang/tukang.module';
import { MemberModule } from './member/member.module';
import { TukangServiceModule } from './tukang_service/tukang_service.module';
import { PermissionsModule } from './permissions/permissions.module';
import { OrderModule } from './order/order.module';
import { EventLoggerModule } from './event-logger/event-logger.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CategoriesModule } from './categories/categories.module';
import { StatusModule } from './status/status.module';
import { WorkOrdersModule } from './work_orders/work_orders.module';
import { QuotationModule } from './quotation/quotation.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { ComplaintChannelsModule } from './complaint_channels/complaint_channels.module';
import { CaslModule } from './casl/casl.module';
import { RemedialsModule } from './remedials/remedials.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ReportsModule } from './reports/reports.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CityModule } from './city/city.module';
import { RefundModule } from './refund/refund.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    StoreModule,
    RolesModule,
    PositionsModule,
    MenusModule,
    ServiceTypeModule,
    BankModule,
    EmployeeModule,
    SalesModule,
    ItemsModule,
    VendorModule,
    TukangModule,
    MemberModule,
    TukangServiceModule,
    PermissionsModule,
    OrderModule,
    EventLoggerModule,
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    CategoriesModule,
    StatusModule,
    WorkOrdersModule,
    QuotationModule,
    ComplaintsModule,
    ComplaintChannelsModule,
    CaslModule,
    RemedialsModule,
    InvoicesModule,
    ReportsModule,
    ScheduleModule.forRoot(),
    CityModule,
    RefundModule
  ],
  controllers: [AppController],
  providers: [AppService],
  // Uncomment This
  // exports: [CaslAbilityFactory, PermissionsGuard],
})
export class AppModule {}
