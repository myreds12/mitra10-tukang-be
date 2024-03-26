import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { OrderModule } from 'src/order/order.module';
import { GoogleSheetModule } from 'nest-google-sheet-connector';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  imports: [
    HttpModule,
    OrderModule,
    GoogleSheetModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        console.log(configService.get<string>('SPREADSHEETS.PRIVATE_KEY'));

        return {
          auth_uri: configService.get<string>('SPREADSHEETS.AUTH_URI'),
          client_id: configService.get<string>('SPREADSHEETS.CLIENT_ID'),
          auth_provider_x509_cert_url: configService.get<string>(
            'AUTH_PROVIDER_X509_CERT_URL',
          ),
          client_x509_cert_url: configService.get<string>(
            'CLIENT_X509_CERT_URL',
          ),
          client_email: configService.get<string>('SPREADSHEETS.CLIENT_EMAIL'),
          private_key: configService
            .get<string>('SPREADSHEETS.PRIVATE_KEY')
            .replace(/\\n/g, '\n'),
          private_key_id: configService.get<string>(
            'SPREADSHEETS.PRIVATE_KEY_ID',
          ),
          project_id: configService.get<string>('SPREADSHEETS.PROJECT_ID'),
          token_uri: configService.get<string>('SPREADSHEETS.TOKEN_URI'),
          type: configService.get<string>('SPREADSHEETS.TYPE'),
        };
      },
    }),
  ],
})
export class ReportsModule {}
