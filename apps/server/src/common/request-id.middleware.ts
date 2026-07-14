import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import * as crypto from "crypto";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = crypto.randomUUID();
    (req as any).requestId = requestId;
    res.setHeader("X-Request-ID", requestId);
    next();
  }
}
