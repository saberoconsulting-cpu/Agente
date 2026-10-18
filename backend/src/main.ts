import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './modules/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://agent.saberoconsulting.com',
    ],
    credentials: true,
  });
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'integrations/google/callback', method: RequestMethod.GET }],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SABERO AI Sales Engine API')
    .setDescription('API independiente del agente comercial multiempresa de SABERO.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT || 3001);
  await app.listen(port);
  console.log(`SABERO AI Sales Engine listening on ${port}`);
}

void bootstrap();
