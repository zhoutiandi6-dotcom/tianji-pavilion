import { Injectable, Logger } from "@nestjs/common";

type EventHandler = (event: any) => void | Promise<void>;

@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private handlers = new Map<string, EventHandler[]>();

  subscribe(eventName: string, handler: EventHandler) {
    if (!this.handlers.has(eventName)) this.handlers.set(eventName, []);
    this.handlers.get(eventName)!.push(handler);
  }

  async publish(eventName: string, payload: any) {
    const handlers = this.handlers.get(eventName) || [];
    this.logger.log(`Event [${eventName}] published to ${handlers.length} handler(s)`);
    for (const h of handlers) {
      try { await h(payload); } catch (e: any) { this.logger.error(`Handler failed for ${eventName}: ${e.message}`); }
    }
  }

  getHandlerCount(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [k, v] of this.handlers) result[k] = v.length;
    return result;
  }
}
