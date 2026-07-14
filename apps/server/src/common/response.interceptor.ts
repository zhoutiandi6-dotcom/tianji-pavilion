import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from "@nestjs/common";
import { Observable, map } from "rxjs";
import { Request } from "express";
import { ErrorCode } from "./error-codes";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = (request as any).requestId || "none";
    const startTime = Date.now();

    return next.handle().pipe(
      map((data) => {
        const duration = Date.now() - startTime;

        this.logger.log(
          `[${requestId}] ${request.method} ${request.url} → 200 (${duration}ms)`,
        );

        // If the controller already returns a formatted response, pass through
        if (data && typeof data === "object" && "success" in data && "code" in data) {
          return { ...data, requestId };
        }

        return {
          success: true,
          code: ErrorCode.OK,
          message: "",
          data: data ?? null,
          requestId,
        };
      }),
    );
  }
}
