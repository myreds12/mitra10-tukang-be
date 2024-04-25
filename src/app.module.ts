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
import { EmployeeModule } from './employee/employee.module';
import { SalesModule } from './sales/sales.module';
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
import { CityModule } from './city/city.module';
import { RefundModule } from './refund/refund.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { PugAdapter } from '@nestjs-modules/mailer/dist/adapters/pug.adapter';
import { BrandsModule } from './brands/brands.module';
import { RescheduleModule } from './reschedule/reschedule.module';
import { CsiModule } from './csi/csi.module';
import { StoreGroupModule } from './store_group/store_group.module';
import { join } from 'path';
import { EmailMessagesModule } from './email-messages/email-messages.module';
import { ConfigModule } from '@nestjs/config';
import { AreaModule } from './area/area.module';
import spreadsheetsConfig from 'config/spreadsheets.config';

// TODO : Dynamic for production Setu
const user = 'jasa.service';
const pass = 'Tukang@Mitra10';
const smtpServ = 'mail5.mitra10.com';
const transporter = 'smtps';
const query = '?pool=true';
const mailTransporter = `${transporter}://${user}:${pass}@${smtpServ}:2525/${query}`;

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
    RefundModule,
    RescheduleModule,
    ReportsModule,
    MailerModule.forRoot({
      transport: {
        host: 'mail5.mitra10.com',
        port: 25,
        auth: {
          user: 'jasa.service',
          pass: 'Tukang@Mitra10',
        },
      },
      defaults: {
        from: '"Mitra 10 - Instalasi" <noreply@instalasimitra10.com>',
      },
      preview: true,
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
    BrandsModule,
    CsiModule,
    StoreGroupModule,
    EmailMessagesModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [spreadsheetsConfig],
    }),
    AreaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  // Uncomment This
  // exports: [CaslAbilityFactory, PermissionsGuard],
})
export class AppModule {}
