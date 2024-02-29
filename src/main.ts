import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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

  app.useStaticAssets(join(__dirname, '../../', 'uploads'), {
    prefix: '/public/',
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  app.setBaseViewsDir(join('templates'));
  app.setViewEngine('pug');

  await app.listen(3093);
}
bootstrap();
