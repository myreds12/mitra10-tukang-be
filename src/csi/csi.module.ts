import { Module } from '@nestjs/common';
import { CsiService } from './csi.service';
import { CsiController } from './csi.controller';
import { HttpModule } from '@nestjs/axios';
import { GoogleSheetModule } from 'nest-google-sheet-connector';

@Module({
  controllers: [CsiController],
  providers: [CsiService],
  imports: [
    HttpModule,
    GoogleSheetModule.register({
      auth_uri: process.env.AUTH_URI,
      client_id: process.env.CLIENT_ID,
      auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
      private_key_id: process.env.PRIVATE_KEY_ID,
      project_id: process.env.PROJECT_ID,
      token_uri: process.env.TOKEN_URI,
      type: 'tukang-csi-f176f1331afd',
    }),
  ],
})
export class CsiModule {}
