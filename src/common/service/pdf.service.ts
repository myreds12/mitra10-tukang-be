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
      console.log(html);
      console.log(
        join(process.cwd(), 'node_modules', `phantomjs-prebuilt/bin/phantomjs`),
      );
      create(html, {
        phantomPath: join(
          process.cwd(),
          'node_modules',
          `phantomjs-prebuilt/bin/phantomjs`,
        ),
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
