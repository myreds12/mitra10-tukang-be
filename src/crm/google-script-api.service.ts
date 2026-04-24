import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as FormData from 'form-data';
import * as fs from 'fs';

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
    if (
        data.documentPath &&
        data.documentPath !== 'N/A' &&
        fs.existsSync(data.documentPath)
    ) {
        form.append('Document', fs.createReadStream(data.documentPath));
    }
    form.append('variable', data.variable);

    const url = this.configService.get<string>('CRM_NEW_ENDPOINT');

    const response$ = this.httpService.post(url, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    const response = await lastValueFrom(response$);
    return response;
  }
}
