import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AppModule } from './agent/agent.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ methods: ['GET', 'POST'] });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new BadRequestException(
          errors
            .flatMap((error) => Object.values(error.constraints ?? {}))
            .join('; '),
        ),
    }),
  );
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}
bootstrap();
