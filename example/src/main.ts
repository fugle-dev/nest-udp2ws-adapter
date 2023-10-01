import { NestFactory } from '@nestjs/core';
import { Udp2wsAdapter } from 'nest-udp2ws-adapter';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new Udp2wsAdapter(app, {
    type: 'udp4',
    port: 41234,
  }));
  await app.listen(3000);
}
bootstrap();
