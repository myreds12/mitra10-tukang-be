import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { PrismaExceptionFilter } from './common/filters/prisma-known-exception.filter';
import { PrismaValidationFilter } from './common/filters/prisma-validation-error.filter';
import { NotFoundExceptionFilter } from './common/filters/not-found-exceptopm.filter';
import * as express from 'express';

async function bootstrap() {
  try {
    console.log('🚀 Starting NestJS application...');

    // ✅ 1. CREATE APP dengan config yang lebih aman
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      cors: false, // Nonaktifkan CORS bawaan, kita konfigurasi manual
      abortOnError: false, // PENTING: Jangan crash saat error startup
      bufferLogs: true, // Buffer logs untuk konsistensi
      snapshot: process.env.NODE_ENV !== 'production', // Enable snapshot di development
    });

    // ✅ 2. INCREASE REQUEST SIZE LIMITS (untuk file upload)
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    // ✅ 3. DETAILED CORS CONFIGURATION
    const allowedOrigins = [
      'https://livechatapi.smartonline.id',
      'http://localhost:3000',
      'https://instalasi.mitra10.com',
      'https://instalasitraining.mitra10.com',
    ];

    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, postman)
        if (!origin) {
          return callback(null, true);
        }

        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // For development, log but allow (optional)
        if (process.env.NODE_ENV === 'development') {
          console.log(`⚠️ Development: Allowing origin ${origin}`);
          return callback(null, true);
        }

        // Block origin
        console.error(`🚫 CORS blocked: ${origin}`);
        return callback(new Error(`Origin ${origin} not allowed`), false);
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'Accept',
        'X-Requested-With',
        'X-Api-Key',
        'X-Client-ID',
        'X-Timestamp',
        'Access-Control-Allow-Headers',
      ],
      exposedHeaders: [
        'Content-Disposition',
        'Content-Length',
        'X-Total-Count',
        'X-Response-Time',
      ],
      credentials: true,
      maxAge: 86400, // 24 hours cache for preflight
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });

    // ✅ 4. REQUEST LOGGING MIDDLEWARE (untuk debugging)
    app.use((req, res, next) => {
      const start = Date.now();
      const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);

      // Attach request ID untuk tracing
      req['requestId'] = requestId;
      req['startTime'] = start;

      // Log incoming request
      console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.url} - ID: ${requestId}`);

      res.on('finish', () => {
        const duration = Date.now() - start;
        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

        console.log(`📤 [${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms - ${memoryMB}MB - ID: ${requestId}`);
      });

      next();
    });

    // ✅ 5. SWAGGER CONFIGURATION
    const swaggerConfig = new DocumentBuilder()
      .setTitle('INSTALASI REST API')
      .setDescription('The Instalasi REST API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .addServer(`http://localhost:${process.env.PORT || 3000}`, 'Development')
      .addServer('https://api.yourdomain.com', 'Production')
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, swaggerDocument, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });

    // ✅ 6. STATIC ASSETS CONFIGURATION
    app.useStaticAssets(join(__dirname, '../../', 'uploads'), {
      prefix: '/public/',
      setHeaders: (res) => {
        res.set('Cache-Control', 'public, max-age=3600'); // Cache 1 jam
      },
    });

    // ✅ 7. GLOBAL VALIDATION PIPE dengan error handling
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true, // Strip properties tanpa decorator
      forbidNonWhitelisted: true, // Throw error untuk non-whitelisted
      transformOptions: {
        enableImplicitConversion: true, // Auto convert types
        excludeExtraneousValues: true, // Exclude non-decorated properties
      },
      exceptionFactory: (errors) => {
        const messages = errors.map(error => {
          const constraints = error.constraints ? Object.values(error.constraints) : [];
          return `${error.property}: ${constraints.join(', ')}`;
        });

        console.warn(`⚠️ Validation failed: ${messages.join('; ')}`);
        return new BadRequestException({
          statusCode: 400,
          message: 'Validation failed',
          errors: messages,
          timestamp: new Date().toISOString(),
        });
      },
    }));

    // ✅ 8. GLOBAL FILTERS (dengan logging)
    app.useGlobalFilters(
      new HttpExceptionFilter(),
      new PrismaExceptionFilter(),
      new PrismaValidationFilter(),
      new NotFoundExceptionFilter(),
    );

    // ✅ 9. GLOBAL INTERCEPTORS
    app.useGlobalInterceptors(new TransformInterceptor());

    // ✅ 10. VIEW ENGINE CONFIG
    app.setBaseViewsDir(join('templates'));
    app.setViewEngine('pug');

    // ✅ 11. HEALTH CHECK ENDPOINT (sebelum listen)
    app.getHttpAdapter().get('/health', (req, res) => {
      const health = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        },
        node: {
          version: process.version,
          env: process.env.NODE_ENV || 'development',
        },
        requestId: req['requestId'] || 'unknown',
      };

      res.status(200).json(health);
    });

    // ✅ 12. READINESS CHECK ENDPOINT
    app.getHttpAdapter().get('/ready', async (req, res) => {
      try {
        // Check database connection jika ada
        const dbHealthy = true; // Ganti dengan actual DB check

        if (dbHealthy) {
          res.status(200).json({
            status: 'READY',
            timestamp: new Date().toISOString(),
            services: {
              database: 'healthy',
              api: 'running',
            },
          });
        } else {
          res.status(503).json({
            status: 'NOT_READY',
            timestamp: new Date().toISOString(),
            services: {
              database: 'unhealthy',
            },
          });
        }
      } catch (error) {
        res.status(503).json({
          status: 'ERROR',
          timestamp: new Date().toISOString(),
          error: error.message,
        });
      }
    });

    // ✅ 13. GRACEFUL SHUTDOWN HANDLERS
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);

      try {
        // Beri waktu 10 detik untuk cleanup
        setTimeout(() => {
          console.error('❌ Force shutdown after timeout');
          process.exit(1);
        }, 10000);

        await app.close();
        console.log('✅ HTTP server closed');
        console.log('✅ Application shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Tangkap shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // ✅ 14. UNCAUGHT EXCEPTION HANDLING
    process.on('uncaughtException', (error) => {
      console.error('💥 UNCAUGHT EXCEPTION:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        timestamp: new Date().toISOString(),
      });
      // Don't exit immediately, let the server try to recover
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 UNHANDLED REJECTION at:', {
        promise,
        reason,
        timestamp: new Date().toISOString(),
      });
    });

    // ✅ 15. MEMORY MONITORING (opsional)
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const memory = process.memoryUsage();
        console.log(`🧠 Memory: RSS=${Math.round(memory.rss / 1024 / 1024)}MB, Heap=${Math.round(memory.heapUsed / 1024 / 1024)}MB/${Math.round(memory.heapTotal / 1024 / 1024)}MB`);
      }, 30000); // Setiap 30 detik
    }

    // ✅ 16. START SERVER dengan error handling
    const port = process.env.PORT || 3000;
    const host = '0.0.0.0'; // Listen on all interfaces

    await app.listen(port, host);

    console.log('\n' + '='.repeat(60));
    console.log(`✅ SERVER STARTED SUCCESSFULLY`);
    console.log('='.repeat(60));
    console.log(`📍 Local: http://localhost:${port}`);
    console.log(`🌐 Network: http://${host}:${port}`);
    console.log(`📚 API Docs: http://localhost:${port}/api`);
    console.log(`🏥 Health: http://localhost:${port}/health`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Node.js: ${process.version}`);
    console.log('='.repeat(60));
    console.log('🚀 Application ready to accept requests\n');

  } catch (error) {
    // ✅ 17. STARTUP ERROR HANDLING
    console.error('\n❌❌❌ APPLICATION FAILED TO START ❌❌❌');
    console.error('='.repeat(60));
    console.error('Error:', error.message);
    console.error('Name:', error.name);
    console.error('Stack:', error.stack);

    if (error.code) {
      console.error('Code:', error.code);
    }

    if (error.port) {
      console.error('Port:', error.port);
    }

    console.error('='.repeat(60));
    console.error('\n💡 Troubleshooting tips:');
    console.error('1. Check if port is already in use');
    console.error('2. Check database connection');
    console.error('3. Check environment variables');
    console.error('4. Check file permissions');

    process.exit(1);
  }
}

// ✅ 18. Error handling untuk bootstrap itu sendiri
bootstrap().catch(error => {
  console.error('FATAL: Bootstrap failed:', error);
  process.exit(1);
});