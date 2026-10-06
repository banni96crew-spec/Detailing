import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { businessConfigSchema } from "../../src/domain/business-schema";

async function fixture(slug: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve("tenants", slug, "business.json"), "utf8")) as unknown;
}

describe("business.json", () => {
  it.each(["graphite", "ember-garage"])("принимает демонстрационную конфигурацию %s", async (slug) => {
    const result = businessConfigSchema.parse(await fixture(slug));
    expect(result.slug).toBe(slug);
    expect(result.hours).toHaveLength(7);
  });

  it("отклоняет услугу с несуществующим ресурсом", async () => {
    const source = businessConfigSchema.parse(await fixture("graphite"));
    const invalid = {
      ...source,
      services: [{ ...source.services[0], resourceKeys: ["missing-bay"] }],
    };
    expect(() => businessConfigSchema.parse(invalid)).toThrow(/Неизвестный ресурс/);
  });
});
