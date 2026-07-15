import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StoreModule } from './store/store.module';
import { RolesModule } from './roles/roles.module';
import { PositionsModule } from './positions/positions.module';
import { MenusModule } from './menus/menus.module';
import { ServiceTypeModule } from './service_type/service_type.module';
import { BankModule } from './bank/bank.module';
import { DataMasterModule } from './data_master/dataMaster.module';
import { EmployeeModule } from './employee/employee.module';
import { SalesModule } from './sales/sales.module';
import { ManagerModule } from './manager/manager.module';
import { ItemsModule } from './items/items.module';
import { VendorModule } from './vendor/vendor.module';
import { TukangModule } from './tukang/tukang.module';
import { MemberModule } from './member/member.module';
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
import { RefundModule } from './refund/refund.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { PugAdapter } from '@nestjs-modules/mailer/dist/adapters/pug.adapter';
import { BrandsModule } from './brands/brands.module';
import { RescheduleModule } from './reschedule/reschedule.module';
import { CsiModule } from './csi/csi.module';
import { StoreGroupModule } from './store_group/store_group.module';
import { join } from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AreaModule } from './area/area.module';
import spreadsheetsConfig from 'config/spreadsheets.config';
import { BullModule } from '@nestjs/bull';
import { MailsModule } from './mails/mails.module';
import { PromotionModule } from './promotion/promotion.module';
import { IncentiveModule } from './incentive/incentive.module';
import { CommonModule } from './common/common.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ComissionSalesIncentiveModule } from './comission_sales_incentive/comission_sales_incentive.module';
import { ComissionStoreIncentiveModule } from './comission_store_incentive/comission_store_incentive.module';
import { QuotationPromotionModule } from './quotation_promotion/quotation_promotion.module';
import { CrmModule } from './crm/crm.module';
import { VendorViolationModule } from './vendor-violation/vendor-violation.module';
import { VendorSpModule } from './vendor-sp/vendor-sp.module';
import { VendorRegistrationModule } from './vendor-registration/vendor-registration.module';
import { ChatProxyModule } from './chat-proxy/chat-proxy.module';
import { VendorViolationScheduler } from './scheduler/vendor-violation.scheduler';
import { ViolationDetectorService } from './common/services/violation-detector.service';

const isVendorSpEnabled = process.env.VENDOR_SP_ENABLED === 'true';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CommonModule,
    StoreModule,
    RolesModule,
    PositionsModule,
    MenusModule,
    ServiceTypeModule,
    BankModule,
    DataMasterModule,
    EmployeeModule,
    SalesModule,
    ItemsModule,
    VendorModule,
    TukangModule,
    MemberModule,
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
    RefundModule,
    RescheduleModule,
    ReportsModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('MAIL_HOST'),
          port: configService.get<number>('MAIL_PORT'),
          auth: {
            // type: 'OAUTH2',
            // serviceClient: configService.get<string>('SPREADSHEETS.AUTH_URI'),
            user: configService.get<string>('MAIL_USERNAME'),
            // privateKey: configService.get<string>('SPREADSHEETS.PRIVATE_KEY'),
            pass: configService.get<string>('MAIL_PASSWORD'),
          },
        },
        defaults: {
          from: configService.get<string>('MAIL_DEFAULTS'),
          bcc: configService.get<string>('MAIL_BCC_LIST'),
        },
        preview: {
          dir: join(process.cwd(), '/previews/'),
        },
        template: {
          dir: join(process.cwd(), '/templates/'),
          adapter: new PugAdapter({
            inlineCssEnabled: false,
          }),
          options: {
            strict: true,
          },
        },
      }),
    }),
    BrandsModule,
    // CsiModule, // Disabled - requires Google Sheets credentials
    StoreGroupModule,
    MailsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [spreadsheetsConfig],
    }),
    AreaModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
          username: configService.get<string>('REDIS_USERNAME'),
          password: configService.get<string>('REDIS_PASSWORD'),
          tls: configService.get<object>('REDIS_TLS'),
        },
      }),
      inject: [ConfigService],
    }),
    PromotionModule,
    IncentiveModule,
    NotificationsModule,
    ComissionSalesIncentiveModule,
    ComissionStoreIncentiveModule,
    QuotationPromotionModule,
    // CrmModule, // Disabled - requires Google Sheets credentials
    //manager
    ManagerModule,
    // Vendor SP & Violation System
    ...(isVendorSpEnabled ? [VendorViolationModule, VendorSpModule] : []),
    VendorRegistrationModule,
    ChatProxyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ViolationDetectorService,
    ...(isVendorSpEnabled ? [VendorViolationScheduler] : []),
  ],
  // Uncomment This
  // exports: [CaslAbilityFactory, PermissionsGuard],
})
export class AppModule {}
