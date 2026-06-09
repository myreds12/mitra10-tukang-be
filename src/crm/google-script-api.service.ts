import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';

@Injectable()
export class GoogleScriptApiService {
  private readonly logger = new Logger(GoogleScriptApiService.name);

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
  }): Promise<any> {
    const hasDocumentPath = !!data.documentPath && data.documentPath !== 'N/A';
    const documentExists = hasDocumentPath ? fs.existsSync(data.documentPath) : false;
    let documentMeta: Record<string, unknown> | null = null;
    let documentPayload:
      | {
          fileName: string;
          mimeType: string;
          fileData: string;
        }
      | undefined;

    if (hasDocumentPath && documentExists) {
      const mimeType = mime.lookup(data.documentPath) || 'application/octet-stream';
      const filename = path.basename(data.documentPath);
      const fileSize = fs.statSync(data.documentPath).size;
      const fileData = fs.readFileSync(data.documentPath).toString('base64');
      documentMeta = {
        filename,
        mimeType,
        fileSize,
        transport: 'json-base64-object',
        base64Length: fileData.length,
      };
      documentPayload = {
        fileName: filename,
        mimeType,
        fileData,
      };
    }

    const url = this.configService.get<string>('CRM_NEW_ENDPOINT');
    const payload = {
      Nama_Lengkap_Input: data.namaLengkap,
      Mobile: data.mobile,
      Email_Address: data.email,
      Detail: data.detail,
      Received_by_Installation_Web: data.receivedByInstallationWeb,
      Received_By: data.receivedBy,
      Melalui_Media: data.melaluiMedia,
      LocationID_Installation_Web: data.locationIdInstallationWeb,
      ...(documentPayload ? { Document: documentPayload } : {}),
    };
    this.logger.log(
      `Sending CRM request to ${url} with payload ${JSON.stringify({
        ...payload,
        hasDocumentPath,
        documentExists,
        documentPath: data.documentPath,
        documentMeta,
      })}`,
    );

    try {
      const response$ = this.httpService.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const response = await lastValueFrom(response$);
      this.logger.log(
        `CRM response status=${response.status} data=${JSON.stringify(response.data)}`,
      );
      return response;
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `CRM request failed status=${axiosError.response?.status ?? 'NO_RESPONSE'} data=${JSON.stringify(
          axiosError.response?.data ?? axiosError.message,
        )}`,
      );
      throw error;
    }
  }
}
