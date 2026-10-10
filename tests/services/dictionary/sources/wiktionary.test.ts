import { describe, expect, it } from "vitest";
import { fetchWiktionaryDefinition, pickWiktionarySense } from "../../../../src/services/dictionary/sources/wiktionary";
import { FakeHttpPort, jsonResponse } from "../fakeHttp";

describe("fetchWiktionaryDefinition", () => {
  it("strips HTML tags and lowercases the part of speech", async () => {
    const http = new FakeHttpPort(() =>
      jsonResponse(200, {
        en: [{ partOfSpeech: "Noun", definitions: [{ definition: "a <i>test</i> thing" }] }],
      })
    );
    expect(await fetchWiktionaryDefinition(http, "test")).toEqual({
      definition: "a test thing",
      partOfSpeech: "noun",
    });
  });

  // Shapes below are trimmed from real REST responses (2026-10).
  const LABEL = '<span class="usage-label-sense" about="#mwt27" typeof="mw:Transclusion"></span> ';

  it("skips a blank sub-sense header instead of the whole entry (people → noun, not verb)", () => {
    expect(
      pickWiktionarySense([
        {
          partOfSpeech: "Noun",
          definitions: [{ definition: "" }, { definition: "plural of person" }],
        },
        { partOfSpeech: "Verb", definitions: [{ definition: `${LABEL}To interact with people; to socialize.` }] },
      ])
    ).toEqual({ partOfSpeech: "noun", definition: "plural of person", labeled: false });
  });

  it("passes over a lone labeled homograph (made → past of make, not maggot)", () => {
    expect(
      pickWiktionarySense([
        { partOfSpeech: "Noun", definitions: [{ definition: `${LABEL}A grub or maggot.` }] },
        {
          partOfSpeech: "Verb",
          definitions: [
            { definition: "simple past and past participle of make" },
            { definition: `${LABEL}simple past and past participle of myek` },
          ],
        },
      ])?.definition
    ).toBe("simple past and past participle of make");
  });

  it("still takes a labeled first sense when the entry has more senses (run)", () => {
    expect(
      pickWiktionarySense([
        { partOfSpeech: "Symbol", definitions: [{ definition: `${LABEL}ISO 639-2 &amp; ISO 639-3 language code for Kirundi.` }] },
        {
          partOfSpeech: "Verb",
          definitions: [{ definition: `${LABEL}To move swiftly.` }, { definition: `${LABEL}To go at a fast pace.` }],
        },
      ])?.definition
    ).toBe("To move swiftly.");
  });

  it("falls back to a lone labeled entry when nothing else exists", () => {
    expect(
      pickWiktionarySense([{ partOfSpeech: "Noun", definitions: [{ definition: `${LABEL}A grub or maggot.` }] }])
        ?.definition
    ).toBe("A grub or maggot.");
  });

  it("drops nested sub-senses, template styles and italic category headers", () => {
    const style = '<style data-mw-deduplicate="x">.mw-parser-output .defdate{font-size:smaller}</style>';
    expect(
      pickWiktionarySense([
        { partOfSpeech: "Verb", definitions: [{ definition: `To intend.\n<ol><li>To plan (to do). ${style}</li></ol>` }] },
      ])?.definition
    ).toBe("To intend.");
    expect(
      pickWiktionarySense([
        {
          partOfSpeech: "Adjective",
          definitions: [
            { definition: '<span class="use-with-mention">Senses referring to subjective quality.</span>\n<ol><li>Of superior quality.</li></ol>' },
            { definition: "Of superior quality." },
          ],
        },
      ])?.definition
    ).toBe("Of superior quality.");
    expect(
      pickWiktionarySense([
        { partOfSpeech: "Verb", definitions: [{ definition: `${LABEL}To perceive sounds through the ear. ${style}` }] },
      ])?.definition
    ).toBe("To perceive sounds through the ear.");
  });

  it("completes a header sense ending in a colon with the next sense (go)", () => {
    expect(
      pickWiktionarySense([
        {
          partOfSpeech: "Verb",
          definitions: [
            { definition: "To move, either physically or in an abstract sense:" },
            { definition: `${LABEL}To move through space.` },
          ],
        },
      ])?.definition
    ).toBe("To move, either physically or in an abstract sense: To move through space.");
  });

  it("throws a not-found error on 404", async () => {
    const http = new FakeHttpPort(() => jsonResponse(404, {}));
    await expect(fetchWiktionaryDefinition(http, "zzz")).rejects.toThrow(/not found/);
  });

  it("throws a not-found error when no entry has a definition", async () => {
    const http = new FakeHttpPort(() => jsonResponse(200, { en: [{ partOfSpeech: "noun", definitions: [] }] }));
    await expect(fetchWiktionaryDefinition(http, "zzz")).rejects.toThrow(/not found/);
  });

  it("throws on other HTTP errors", async () => {
    const http = new FakeHttpPort(() => jsonResponse(500, {}));
    await expect(fetchWiktionaryDefinition(http, "test")).rejects.toThrow(/HTTP 500/);
  });
});
