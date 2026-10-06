import { describe, expect, it } from "vitest";
import { routeIntent } from "../../supabase/functions/_shared/intent-router";

describe("assistant intent router", () => {
  it("routes client availability without granting owner scope", () => {
    expect(routeIntent("Когда ближайшее окно на полировку?", "client")).toEqual({ intent: "availability" });
    expect(routeIntent("Сколько денег получено?", "client")).toEqual({ intent: "general" });
  });

  it("routes owner statistics and schedule separately", () => {
    expect(routeIntent("Сколько денег получено на неделе?", "owner")).toEqual({ intent: "owner_stats", dateHint: "week" });
    expect(routeIntent("Что у меня завтра?", "owner")).toEqual({ intent: "owner_schedule", dateHint: "tomorrow" });
  });

  it("routes price and directions", () => {
    expect(routeIntent("Сколько стоит полировка?", "client").intent).toBe("price");
    expect(routeIntent("Как найти студию?", "client").intent).toBe("directions");
  });
});
