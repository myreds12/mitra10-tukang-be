/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { create } from 'html-pdf';
import { existsSync, readFileSync } from 'fs';
import { resolve, extname } from 'path';
import { renderFile } from 'pug';

@Injectable()
export class PdfService {
  private getTemplatePath(templatePath: string): string {
    const templateFile = `${templatePath}.pug`;
    const candidates = [
      resolve(__dirname, '..', '..', '..', 'templates', templateFile),
      resolve(__dirname, '..', '..', '..', '..', 'templates', templateFile),
    ];

    return candidates.find((path) => existsSync(path)) ?? candidates[0];
  }

  // ============================================================
  // Helper: convert local image file to base64 data URI
  // html-pdf (PhantomJS) cannot reliably load external HTTPS URLs
  // Using base64 embeds images directly in the HTML, avoiding network issues
  // ============================================================
  getImageAsBase64(imagePath: string): string | null {
    try {
      if (!existsSync(imagePath)) {
        console.warn(`Image file not found: ${imagePath}`);
        return null;
      }
      const ext = extname(imagePath).toLowerCase().replace('.', '');
      const mimeType =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'png'
          ? 'image/png'
          : ext === 'gif'
          ? 'image/gif'
          : ext === 'svg'
          ? 'image/svg+xml'
          : 'image/png';
      const buffer = readFileSync(imagePath);
      const base64 = buffer.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error(`Failed to convert image to base64: ${imagePath}`, error.message);
      return null;
    }
  }

  async generate(templatePath: string, data: any) {
    return new Promise((resolve, reject) => {
      const html = renderFile(this.getTemplatePath(templatePath), {
        data,
      });


      create(html, { format: 'A4',
        border: {
          top: "0.5in",
          right: "0.5in",
          bottom: "0",
          left: "0.5in"
        },
        header: {
          height: "10mm",
        },
        footer: {
          height: "5mm",
        },
        timeout: 100000,
        orientation: 'landscape' }).toBuffer((err, buffer) => {
        if (err) {
          reject(err);
        } else {
          resolve(buffer);
        }
      });
    });
  }

  async generatePotrait(templatePath: string, data: any) {
    return new Promise((resolve, reject) => {
      const html = renderFile(this.getTemplatePath(templatePath), {
        data,
      });

      
      create(html, { format: 'A4',
        header: {
          height: "2mm",
        },
        footer: {
          height: "5mm",
        },
        timeout: 100000,
        orientation: 'portrait' }).toBuffer((err, buffer) => {
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
      const html = renderFile(this.getTemplatePath(templatePath), {
        data,
      });

      const options = {
        format: 'A4',
        border: {
          top: "4in",
          right: "1in",
          bottom: "1in",
          left: "1in"
        },
        header: {
          height: "30mm",
          contents: '<div style="text-align: center;"></div>'
        },
        footer: {
          height: "5mm",
          contents: '<div style="text-align: center;"></div>'
        },
        timeout: 60000,
        orientation: 'landscape'
      };


      create(html, {
        format: 'A4',
        border: {
          top: "0.5in",
          right: "0.5in",
          bottom: "0",
          left: "0.5in"
        },
        header: {
          height: "10mm",
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
