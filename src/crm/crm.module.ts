import { Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { GoogleSheetModule } from 'nest-google-sheet-connector';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

@Module({
  controllers: [CrmController],
  providers: [CrmService, ConfigService],
  imports: [
    HttpModule,
    GoogleSheetModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: configService.get<string>('CRM_TYPE'),
        project_id: configService.get<string>('CRM_PROJECT_ID'),
        private_key_id: configService.get<string>('CRM_PRIVATE_KEY_ID'),
        private_key: configService.get<string>('CRM_PRIVATE_KEY').replace(/\\n/g, '\n'),
        client_email: configService.get<string>('CRM_CLIENT_EMAIL'),
        client_id: configService.get<string>('CRM_CLIENT_ID'),
        auth_uri: configService.get<string>('CRM_AUTH_URI'),
        token_uri: configService.get<string>('CRM_TOKEN_URI'),
        auth_provider_x509_cert_url: configService.get<string>('CRM_AUTH_PROVIDER_X509_CERT_URL'),
        client_x509_cert_url: configService.get<string>('CRM_CLIENT_X509_CERT_URL'),
      }),
    }),
  ]
})
export class CrmModule {}
