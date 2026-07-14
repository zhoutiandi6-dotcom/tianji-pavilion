// Load .env first
const fs = require("fs");
const path = require("path");
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Security: JWT_SECRET is required. App must not start without it.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "change-me-to-a-random-secret") {
  console.error("FATAL: JWT_SECRET environment variable is required.");
  console.error("Set a secure random value before starting.");
  console.error("Example (generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"):");
  process.exit(1);
}

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { UnifiedExceptionFilter } from "./common/unified-exception.filter";
import { ResponseInterceptor } from "./common/response.interceptor";
import { AppLogger } from "./common/logger.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new AppLogger(),
  });

  app.setGlobalPrefix("api");

  // CORS: Dev allows localhost, Production reads from env
  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv === "production") {
    // Production: only explicitly allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((o: string) => o.trim())
      : [];
    app.enableCors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    });
  } else {
    // Development: allow localhost + same-LAN 192.168.*.* frontend origins.
    const devOrigins: string[] = [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
    ];
    // DEV_ALLOWED_ORIGINS supports comma-separated origins for LAN access
    // Example: DEV_ALLOWED_ORIGINS=http://192.168.1.100:3000,http://192.168.1.101:3000
    if (process.env.DEV_ALLOWED_ORIGINS) {
      const extra = process.env.DEV_ALLOWED_ORIGINS.split(",").map((o: string) => o.trim());
      devOrigins.push(...extra);
    }
    const isLanDevOrigin = (origin: string) => /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:3000$/.test(origin);
    app.enableCors({
      origin: (origin, callback) => {
        if (!origin || devOrigins.includes(origin) || isLanDevOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS origin not allowed: ${origin}`));
      },
      credentials: true,
    });
  }

  // 优雅关闭
  app.enableShutdownHooks();

  // Global pipe
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Global exception filter
  app.useGlobalFilters(new UnifiedExceptionFilter());

  // Global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = process.env.SERVER_PORT ?? 3001;
  await app.listen(port, "0.0.0.0");
  console.log(`🚀 天机阁服务已启动: http://0.0.0.0:${port}/api`);
}
bootstrap();

