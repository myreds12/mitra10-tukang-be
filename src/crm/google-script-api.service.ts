import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleScriptApiService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async sendFormWithFile(data: {
    namaLengkap: string;
    mobile: string;
    email: string;
    detail: string;
    receivedByInstallationWeb: string;
    receivedBy: string;
    melaluiMedia: string;
    locationIdInstallationWeb: string;
    documentPath: string;
    variable: string;
  }): Promise<any> {
    const form = new FormData();

    form.append('Nama_Lengkap_Input', data.namaLengkap);
    form.append('Mobile', data.mobile);
    form.append('Email_Address', data.email);
    form.append('Detail', data.detail);
    form.append('Received_by_Installation_Web', data.receivedByInstallationWeb);
    form.append('Received_By', data.receivedBy);
    form.append('Melalui_Media', data.melaluiMedia);
    form.append('LocationID_Installation_Web', data.locationIdInstallationWeb);

    // DEBUG
    console.log('=== CRM DEBUG ===');
    console.log('documentPath received:', data.documentPath);
    console.log('cwd:', process.cwd());
    console.log('file exists:', data.documentPath !== 'N/A' 
      ? fs.existsSync(data.documentPath) 
      : 'N/A - skipped'
    );

    if (
      data.documentPath &&
      data.documentPath !== 'N/A' &&
      fs.existsSync(data.documentPath)
    ) {
      console.log('file akan dikirim:', path.basename(data.documentPath));
      const fileBuffer = fs.readFileSync(data.documentPath);
      const arrayBuffer = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength,
      ) as ArrayBuffer;
      const mimeType = mime.lookup(data.documentPath) || 'application/octet-stream';
      const filename = path.basename(data.documentPath);
      const blob = new Blob([arrayBuffer], { type: mimeType });
      form.append('Document', blob, filename);
      console.log('mimeType:', mimeType);
      console.log('filename:', filename);
    } else {
      console.log('file SKIP - tidak dikirim');
    }

    form.append('variabel', data.variable); // fix: variabel bukan variable

    const url = this.configService.get<string>('CRM_NEW_ENDPOINT');
    console.log('CRM_NEW_ENDPOINT:', url);
    console.log('=== END CRM DEBUG ===');

    const response = await fetch(url, {
      method: 'POST',
      body: form as any,
    });

    const responseData = await response.json();
    console.log('CRM response status:', response.status);
    console.log('CRM response data:', responseData);

    return {
      status: response.status,
      data: responseData,
    };
  }
}