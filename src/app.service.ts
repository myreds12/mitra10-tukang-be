import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { resolve } from 'path';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getDebugPaths() {
    const staticPath = resolve(process.cwd(), 'uploads');
    const uploadPath = resolve(process.cwd(), 'uploads', 'general');

    // Check actual file existence
    const headerJpg = resolve(uploadPath, 'header.jpg');
    const headerJpeg = resolve(uploadPath, 'header.jpeg');
    const footerJpg = resolve(uploadPath, 'footer.jpg');
    const footerJpeg = resolve(uploadPath, 'footer.jpeg');

    return {
      cwd: process.cwd(),
      expressStaticPath: staticPath,
      expressStaticExists: existsSync(staticPath),
      resolveUploadGeneralPath: uploadPath,
      resolveUploadGeneralExists: existsSync(uploadPath),
      files: {
        'general/header.jpg': { path: headerJpg, exists: existsSync(headerJpg) },
        'general/header.jpeg': { path: headerJpeg, exists: existsSync(headerJpeg) },
        'general/footer.jpg': { path: footerJpg, exists: existsSync(footerJpg) },
        'general/footer.jpeg': { path: footerJpeg, exists: existsSync(footerJpeg) },
      },
    };
  }
}
