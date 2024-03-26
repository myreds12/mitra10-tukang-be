import { Module } from '@nestjs/common';
import { CsiService } from './csi.service';
import { CsiController } from './csi.controller';
import { HttpModule } from '@nestjs/axios';
import { GoogleSheetModule } from 'nest-google-sheet-connector';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  controllers: [CsiController],
  providers: [CsiService],
  imports: [
    HttpModule,
    GoogleSheetModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        auth_uri: configService.get<string>('AUTH_URI'),
        client_id: configService.get<string>('CLIENT_ID'),
        auth_provider_x509_cert_url: configService.get<string>(
          'AUTH_PROVIDER_X509_CERT_URL',
        ),
        client_x509_cert_url: configService.get<string>('CLIENT_X509_CERT_URL'),
        client_email: configService.get<string>('CLIENT_EMAIL'),
        private_key: configService
          .get<string>('PRIVATE_KEY')
          .replace(/\\n/g, '\n'),
        private_key_id: configService.get<string>('PRIVATE_KEY_ID'),
        project_id: configService.get<string>('PROJECT_ID'),
        token_uri: configService.get<string>('TOKEN_URI'),
        type: configService.get<string>('TYPE'),
      }),
    }),
  ],
})
export class CsiModule {}
