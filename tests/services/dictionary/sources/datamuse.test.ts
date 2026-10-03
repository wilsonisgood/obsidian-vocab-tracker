import { describe, expect, it } from "vitest";
import { fetchDatamuseDefinition, fetchDatamuseRelated } from "../../../../src/services/dictionary/sources/datamuse";
import { FakeHttpPort, jsonResponse } from "../fakeHttp";

describe("fetchDatamuseDefinition", () => {
  it("maps the part-of-speech tag and trims the definition", async () => {
    const http = new FakeHttpPort(() => jsonResponse(200, [{ defs: ["n\tsome definition "] }]));
    expect(await fetchDatamuseDefinition(http, "test")).toEqual({
      definition: "some definition",
      partOfSpeech: "noun",
    });
  });

  it("falls back to the raw tag for an unmapped part of speech", async () => {
    const http = new FakeHttpPort(() => jsonResponse(200, [{ defs: ["weird\tsome definition"] }]));
    expect((await fetchDatamuseDefinition(http, "test")).partOfSpeech).toBe("weird");
  });

  it("throws a not-found error when there are no defs", async () => {
    const http = new FakeHttpPort(() => jsonResponse(200, [{ defs: [] }]));
    await expect(fetchDatamuseDefinition(http, "zzz")).rejects.toThrow(/not found/);
  });

  it("throws on a non-200 status", async () => {
    const http = new FakeHttpPort(() => jsonResponse(500, {}));
    await expect(fetchDatamuseDefinition(http, "test")).rejects.toThrow(/HTTP 500/);
  });
});

describe("fetchDatamuseRelated", () => {
  it("returns the related words", async () => {
    const http = new FakeHttpPort(() => jsonResponse(200, [{ word: "a" }, { word: "b" }]));
    expect(await fetchDatamuseRelated(http, "test", "rel_syn")).toEqual(["a", "b"]);
  });

  it("soft-fails to [] on a non-200 status", async () => {
    const http = new FakeHttpPort(() => jsonResponse(500, []));
    expect(await fetchDatamuseRelated(http, "test", "rel_ant")).toEqual([]);
  });

  it("soft-fails to [] when the transport throws", async () => {
    const http = new FakeHttpPort(() => {
      throw new Error("network down");
    });
    expect(await fetchDatamuseRelated(http, "test", "rel_syn")).toEqual([]);
  });
});
