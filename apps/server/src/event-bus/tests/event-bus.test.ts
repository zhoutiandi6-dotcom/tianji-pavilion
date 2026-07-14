import { EventBus } from "../event-bus";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("publishes event to subscribed handler", async () => {
    const handler = jest.fn();
    bus.subscribe("test.event", handler);
    await bus.publish("test.event", { data: "hello" });
    expect(handler).toHaveBeenCalledWith({ data: "hello" });
  });

  it("publishes to multiple handlers", async () => {
    const h1 = jest.fn();
    const h2 = jest.fn();
    bus.subscribe("test.event", h1);
    bus.subscribe("test.event", h2);
    await bus.publish("test.event", {});
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it("does not call handlers for different events", async () => {
    const handler = jest.fn();
    bus.subscribe("event.a", handler);
    await bus.publish("event.b", {});
    expect(handler).not.toHaveBeenCalled();
  });

  it("handler exception does not crash the bus", async () => {
    const failingHandler = jest.fn().mockRejectedValue(new Error("fail"));
    const goodHandler = jest.fn();
    bus.subscribe("test.event", failingHandler);
    bus.subscribe("test.event", goodHandler);
    await bus.publish("test.event", {});
    expect(goodHandler).toHaveBeenCalled();
  });

  it("publishing to unsubscribed event does nothing", async () => {
    await expect(bus.publish("no.handler", {})).resolves.not.toThrow();
  });

  it("tracks handler count", async () => {
    bus.subscribe("a", jest.fn());
    bus.subscribe("a", jest.fn());
    bus.subscribe("b", jest.fn());
    const counts = bus.getHandlerCount();
    expect(counts["a"]).toBe(2);
    expect(counts["b"]).toBe(1);
  });
});
