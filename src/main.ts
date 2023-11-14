import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });
  app.useStaticAssets(join(__dirname, '../../', 'uploads'), {
    prefix: '/public/',
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.setBaseViewsDir(join('templates'));
  app.setViewEngine('pug');
  await app.listen(3030);
}
bootstrap();
