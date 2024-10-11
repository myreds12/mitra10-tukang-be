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


      create(html, { timeout: 60000 }).toBuffer((err, buffer) => {
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

      const options = {
        format: 'A4',
        border: {
          top: "1in",
          right: "0.5in",
          bottom: "0.5in",
          left: "0.5in"
        },
        header: {
          height: "20mm",
          contents: '<div style="text-align: center;"></div>'
        },
        footer: {
          height: "20mm",
          contents: '<div style="text-align: center;"></div>'
        },
        timeout: 60000,
        orientation: 'landscape'
      };


      create(html, {
        format: 'A4',
        border: {
          top: "0",
          right: "0.5in",
          bottom: "0.5in",
          left: "0.5in"
        },
        header: {
          height: "5mm",
        },
        footer: {
          height: "5mm",
        },
        timeout: 60000,
        orientation: 'landscape'
      }).toBuffer((err, buffer) => {
        if (err) {
          reject(err);
        } else {
          resolve(buffer);
        }
      });
    });
  }
}
