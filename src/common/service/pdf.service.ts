import { Injectable } from '@nestjs/common';
import { create } from 'html-pdf';
import { join } from 'path';
import { renderFile } from 'pug';

@Injectable()
export class PdfService {
  async generate(templatePath: string, data: any) {
    return new Promise((resolve, reject) => {
      const html = renderFile(join('templates', `${templatePath}.pug`), {
        data,
      });


      create(html, {timeout: 60000 }).toBuffer((err, buffer) => {
        if (err) {
          reject(err);
        } else {
          resolve(buffer);
        }
      });
    });
  }

  async generateLandscape(templatePath: string, data: any) {
    return new Promise((resolve, reject) => {
      const html = renderFile(join('templates', `${templatePath}.pug`), {
        data,
      });


      create(html, {timeout: 60000,orientation: 'landscape'  }).toBuffer((err, buffer) => {
        if (err) {
          reject(err);
        } else {
          resolve(buffer);
        }
      });
    });
  }
}
