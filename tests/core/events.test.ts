import { describe, expect, it, vi } from "vitest";
import { TypedEmitter } from "../../src/core/events";

describe("TypedEmitter", () => {
  it("calls subscribers with the emitted payload", () => {
    const emitter = new TypedEmitter<{ ping: number }>();
    const fn = vi.fn();
    emitter.on("ping", fn);
    emitter.emit("ping", 42);
    expect(fn).toHaveBeenCalledWith(42);
  });

  it("supports multiple subscribers", () => {
    const emitter = new TypedEmitter<{ ping: number }>();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on("ping", a);
    emitter.on("ping", b);
    emitter.emit("ping", 1);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("stops calling a listener after off()", () => {
    const emitter = new TypedEmitter<{ ping: number }>();
    const fn = vi.fn();
    emitter.on("ping", fn);
    emitter.off("ping", fn);
    emitter.emit("ping", 1);
    expect(fn).not.toHaveBeenCalled();
  });

  it("stops calling a listener after the unsubscribe function returned by on()", () => {
    const emitter = new TypedEmitter<{ ping: number }>();
    const fn = vi.fn();
    const unsubscribe = emitter.on("ping", fn);
    unsubscribe();
    emitter.emit("ping", 1);
    expect(fn).not.toHaveBeenCalled();
  });

  it("does nothing when emitting an event with no subscribers", () => {
    const emitter = new TypedEmitter<{ ping: number }>();
    expect(() => emitter.emit("ping", 1)).not.toThrow();
  });
});
