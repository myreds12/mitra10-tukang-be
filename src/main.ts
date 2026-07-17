import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { PrismaExceptionFilter } from './common/filters/prisma-known-exception.filter';
import { PrismaValidationFilter } from './common/filters/prisma-validation-error.filter';
import { NotFoundExceptionFilter } from './common/filters/not-found-exceptopm.filter';

function resolveProjectPath(folderName: string): string {
  const candidates = [
    resolve(__dirname, '..', folderName),
    resolve(__dirname, '..', '..', folderName),
  ];

  return candidates.find((path) => existsSync(path)) ?? candidates[0];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('INSTALASI REST API')
    .setDescription('The Instalasi REST API Documentation')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, swaggerDocument);

  app.useStaticAssets(resolveProjectPath('uploads'), {
    prefix: '/public/',
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalFilters(
    new HttpExceptionFilter(),
    new PrismaExceptionFilter(),
    new PrismaValidationFilter(),
    new NotFoundExceptionFilter(),
  );
  app.useGlobalInterceptors(new TransformInterceptor());

  app.setBaseViewsDir(resolveProjectPath('templates'));
  app.setViewEngine('pug');

  await app.listen(process.env.PORT);
}
bootstrap();
