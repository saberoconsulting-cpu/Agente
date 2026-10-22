import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './modules/app.module';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'OAUTH_TOKEN_ENCRYPTION_KEY', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN']) {
      if (!process.env[key]) throw new Error(`${key} is required in production`);
    }
  }
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(value => value.trim()).filter(Boolean) : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://agent.saberoconsulting.com',
    ],
    credentials: true,
  });
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'integrations/google/callback', method: RequestMethod.GET }],
  });
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SABERO AI Sales Engine API')
    .setDescription('API independiente del agente comercial multiempresa de SABERO.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT || 3001);
  await app.listen(port, process.env.HOST || '0.0.0.0');
  console.log(`SABERO AI Sales Engine listening on ${port}`);
}

void bootstrap();
