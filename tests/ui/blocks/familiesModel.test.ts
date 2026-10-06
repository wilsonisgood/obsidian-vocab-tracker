import { describe, expect, it } from "vitest";
import type { Family } from "../../../src/core/model/family";
import {
  focusFamily,
  onFamilyFocus,
  takeFamilyFocus,
  familiesWith,
  familyTitle,
  familyTree,
  findFamily,
  MemberLookup,
  parseFamiliesParams,
  pickSelected,
} from "../../../src/ui/blocks/familiesModel";
import { entry } from "../../services/learn/fakes";

const kitchen: Family = {
  id: "f1",
  topic: "kitchenware",
  label: "廚房用品",
  source: "ai",
  seedEntryIds: ["e-apron", "e-gone"],
  groups: [
    {
      label: "烹調",
      members: [
        { word: "pan", zh: "平底鍋" },
        { word: "spatula", zh: "鍋鏟" },
      ],
    },
    { label: "空的", members: [{ word: "  ", zh: "" }] },
    {
      label: "穿戴與清潔",
      members: [
        { entryId: "e-apron", word: "apron", zh: "圍裙" },
        { word: "oven mitt", zh: "隔熱手套" },
      ],
    },
  ],
};

const glow: Family = {
  id: "f2",
  topic: "gl-",
  label: "gl- 發光家族",
  source: "ai",
  groups: [{ label: "光", members: [{ word: "glitter", zh: "閃爍" }, { word: "Glittery", zh: "閃閃發光的" }] }],
};

describe("parseFamiliesParams", () => {
  it("reads topic (or family) and word, unquoted", () => {
    expect(parseFamiliesParams("topic: kitchenware\nword: 'glittery'")).toEqual({ topic: "kitchenware", word: "glittery" });
    expect(parseFamiliesParams("family: \"gl-\"")).toEqual({ topic: "gl-" });
  });

  it("is empty for an empty body", () => {
    expect(parseFamiliesParams("")).toEqual({});
    expect(parseFamiliesParams("topic:\nword:  ")).toEqual({});
  });
});

describe("familyTitle", () => {
  it("joins topic and label unless the label already has the topic", () => {
    expect(familyTitle(kitchen)).toBe("kitchenware 廚房用品");
    expect(familyTitle(glow)).toBe("gl- 發光家族");
    expect(familyTitle({ topic: "work", label: "" })).toBe("work");
    expect(familyTitle({ topic: "", label: "典禮" })).toBe("典禮");
  });
});

describe("findFamily", () => {
  it("matches topic, label or title, case-insensitively", () => {
    const all = [kitchen, glow];
    expect(findFamily(all, "Kitchenware")?.id).toBe("f1");
    expect(findFamily(all, "廚房用品")?.id).toBe("f1");
    expect(findFamily(all, "gl- 發光家族")?.id).toBe("f2");
    expect(findFamily(all, "nope")).toBeUndefined();
    expect(findFamily(all, undefined)).toBeUndefined();
  });
});

describe("familyTree", () => {
  it("turns groups into columns of known / suggested chips", () => {
    // "pans" is learned since the family was saved: matched by word.
    const lookup = new MemberLookup([entry("e-apron", "aprons"), entry("e-pan", "pans")]);
    const view = familyTree(kitchen, lookup);
    expect(view.title).toBe("kitchenware 廚房用品");
    expect(view.columns.map((c) => c.label)).toEqual(["烹調", "穿戴與清潔"]);
    expect(view.columns[0].chips).toEqual([
      { word: "pan", zh: "平底鍋", known: true, entryId: "e-pan" },
      { word: "spatula", zh: "鍋鏟", known: false },
    ]);
    expect(view.columns[1].chips[0]).toMatchObject({ word: "apron", known: true, entryId: "e-apron" });
    expect(view.knownCount).toBe(2);
    expect(view.suggestedCount).toBe(2);
    // Seeds no longer in the list are dropped.
    expect(view.seeds).toEqual(["aprons"]);
  });

  it("treats a member whose entry was deleted as a suggestion again", () => {
    const lookup = new MemberLookup([entry("e-apron", "apron", { deletedAt: "2026-10-01T00:00:00Z" })]);
    const chip = familyTree(kitchen, lookup).columns[1].chips[0];
    expect(chip.known).toBe(false);
  });
});

describe("familiesWith", () => {
  it("finds families by entry id or by spelling", () => {
    expect(familiesWith([kitchen, glow], entry("e-apron", "apron")).map((f) => f.id)).toEqual(["f1"]);
    expect(familiesWith([kitchen, glow], entry("x", "glittery")).map((f) => f.id)).toEqual(["f2"]);
    expect(familiesWith([kitchen, glow], entry("y", "cleaver"))).toEqual([]);
  });
});

describe("pickSelected", () => {
  it("keeps the current family, else the preferred topic, else the first", () => {
    expect(pickSelected([kitchen, glow], "f2")).toBe("f2");
    expect(pickSelected([kitchen, glow], "gone", "gl-")).toBe("f2");
    expect(pickSelected([kitchen, glow], undefined)).toBe("f1");
    expect(pickSelected([], "f1")).toBeUndefined();
  });
});

describe("1005 回饋: family tree dates and focus", () => {
  it("dates the tree and highlights the word the learner came from", () => {
    const f: Family = {
      ...kitchen,
      createdAt: new Date(2026, 9, 1, 12).toISOString(),
      updatedAt: new Date(2026, 9, 4, 12).toISOString(),
    };
    const lk = new MemberLookup([entry("e-apron", "apron"), entry("e-pan", "pan")]);
    const view = familyTree(f, lk, { focusEntryId: "e-apron", now: new Date(2026, 9, 5, 12) });
    expect(view.dates).toEqual({ added: "10/01", updated: "10/04" });
    const chips = view.columns.flatMap((c) => c.chips);
    expect(chips.filter((c) => c.focus).map((c) => c.word)).toEqual(["apron"]);
    expect(familyTree(f, lk).columns.flatMap((c) => c.chips).some((c) => c.focus)).toBe(false);
  });

  it("hands a focus request to an open tree, or to the next one that opens", () => {
    takeFamilyFocus();
    const seen: string[] = [];
    const off = onFamilyFocus((x) => seen.push(x.familyId));
    focusFamily({ familyId: "f1", entryId: "e-apron" });
    expect(seen).toEqual(["f1"]);
    expect(takeFamilyFocus()).toEqual({ familyId: "f1", entryId: "e-apron" });
    expect(takeFamilyFocus()).toBeNull();
    off();
    focusFamily({ familyId: "f2" });
    expect(seen).toEqual(["f1"]);
    expect(takeFamilyFocus()).toEqual({ familyId: "f2" });
  });
});
