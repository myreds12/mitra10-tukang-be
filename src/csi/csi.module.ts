import { Module } from '@nestjs/common';
import { CsiService } from './csi.service';
import { CsiController } from './csi.controller';
import { HttpModule } from '@nestjs/axios';
import { GoogleSheetModule } from 'nest-google-sheet-connector';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';

@Module({
  controllers: [CsiController],
  providers: [CsiService],
  imports: [
    HttpModule,
    GoogleSheetModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        auth_uri: configService.get<string>('SPREADSHEETS.PRIVATE_KEY'),
        client_id: configService.get<string>('SPREADSHEETS.AUTH_URI'),
        auth_provider_x509_cert_url: configService.get<string>(
          'SPREADSHEETS.AUTH_PROVIDER_X509_CERT_URL',
        ),
        client_x509_cert_url: configService.get<string>(
          'SPREADSHEETS.CLIENT_ID',
        ),
        client_email: configService.get<string>('SPREADSHEETS.CLIENT_EMAIL'),
        private_key: configService.get<string>('SPREADSHEETS.PRIVATE_KEY'),
        // .replace(/\\n/g, '\n'),
        private_key_id: configService.get<string>(
          'SPREADSHEETS.PRIVATE_KEY_ID',
        ),
        project_id: configService.get<string>('SPREADSHEETS.PROJECT_ID'),
        token_uri: configService.get<string>('SPREADSHEETS.TOKEN_URI'),
        type: configService.get<string>('SPREADSHEETS.TYPE'),
      }),
    }),
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
        delay: 20000,
      },
    }),
  ],
})
export class CsiModule {}
