import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { buildCorsOriginChecker } from "./common/cors-origin";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: buildCorsOriginChecker(process.env.FRONTEND_PORT ?? "3001"),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix("api/v1");
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
