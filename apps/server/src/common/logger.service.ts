import { Injectable, LoggerService as NestLogger } from "@nestjs/common";

export interface LogEntry {
  timestamp: string;
  level: string;
  requestId?: string;
  message: string;
  data?: any;
}

@Injectable()
export class AppLogger implements NestLogger {
  private format(level: string, message: string, meta?: any): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: meta,
    };
    return JSON.stringify(entry);
  }

  log(message: string, meta?: any) { console.log(this.format("info", message, meta)); }
  error(message: string, meta?: any) { console.error(this.format("error", message, meta)); }
  warn(message: string, meta?: any) { console.warn(this.format("warn", message, meta)); }
  debug(message: string, meta?: any) { console.debug(this.format("debug", message, meta)); }
  verbose(message: string, meta?: any) { console.log(this.format("verbose", message, meta)); }
}
