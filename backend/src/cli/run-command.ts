import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../modules/app.module';

export async function runCommand<T>(command: (app: INestApplicationContext) => Promise<T>) {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    return await command(app);
  } finally {
    await app.close();
  }
}
