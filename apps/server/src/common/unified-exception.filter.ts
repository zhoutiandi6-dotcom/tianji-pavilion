import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Response, Request } from "express";
import { ErrorCode, httpStatusToErrorCode } from "./error-codes";

@Catch()
export class UnifiedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UnifiedExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId || "none";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.SYSTEM_ERROR;
    let message = "服务器内部错误";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;
      message = typeof res === "string" ? res : Array.isArray(res.message) ? res.message.join("; ") : res.message || exception.message;
      code = httpStatusToErrorCode(status);
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    // Log the exception
    this.logger.error(
      `[${requestId}] ${request.method} ${request.url} → ${status} ${code}: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      success: false,
      code,
      message,
      data: null,
      requestId,
    });
  }
}

