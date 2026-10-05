import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ Platform: { isMobile: false, isPhone: false, isTablet: false } }));

import { Platform } from "obsidian";
import { formFactorOf, isMobileForm, wordSurface } from "../../../src/ui/mobile/formFactor";
import { currentFormFactor } from "../../../src/ui/mobile/platform";
import { planTap, tapActionFor } from "../../../src/ui/mobile/tapAction";

const classes = (...names: string[]) => ({ contains: (c: string) => names.includes(c) });

describe("formFactorOf", () => {
  it("iPhone → phone, iPad → tablet, else desktop", () => {
    expect(formFactorOf({ isMobile: true, isPhone: true })).toBe("phone");
    expect(formFactorOf({ isMobile: true, isTablet: true })).toBe("tablet");
    expect(formFactorOf({ isMobile: true })).toBe("tablet");
    expect(formFactorOf({})).toBe("desktop");
  });

  it("follows body classes too (app.emulateMobile on desktop)", () => {
    expect(formFactorOf({}, classes("is-mobile", "is-phone"))).toBe("phone");
    expect(formFactorOf({}, classes("is-mobile"))).toBe("tablet");
    expect(formFactorOf({}, classes("is-tablet"))).toBe("tablet");
    expect(formFactorOf({}, classes("theme-dark"))).toBe("desktop");
  });

  it("only the iPhone gets the bottom sheet", () => {
    expect(wordSurface("phone")).toBe("sheet");
    expect(wordSurface("tablet")).toBe("sidebar");
    expect(wordSurface("desktop")).toBe("sidebar");
    expect(isMobileForm("tablet")).toBe(true);
    expect(isMobileForm("desktop")).toBe(false);
  });

  it("currentFormFactor reads Platform and <body> on every call", () => {
    const P = Platform as unknown as { isMobile: boolean; isPhone: boolean };
    vi.stubGlobal("document", { body: { classList: classes() } });
    expect(currentFormFactor()).toBe("desktop");
    P.isMobile = true;
    P.isPhone = true;
    expect(currentFormFactor()).toBe("phone");
    P.isMobile = false;
    P.isPhone = false;
    vi.stubGlobal("document", { body: { classList: classes("is-mobile", "is-phone") } });
    expect(currentFormFactor()).toBe("phone");
    vi.unstubAllGlobals();
  });
});

describe("tapActionFor", () => {
  it("desktop uses tapAction, iPhone and iPad tapActionMobile — with defaults for old data", () => {
    expect(tapActionFor(undefined, "desktop")).toBe("menu");
    expect(tapActionFor({ locale: "auto" }, "phone")).toBe("save");
    expect(tapActionFor({ locale: "auto" }, "tablet")).toBe("save");
    const ui = { locale: "auto" as const, tapAction: "open" as const, tapActionMobile: "menu" as const };
    expect(tapActionFor(ui, "desktop")).toBe("open");
    expect(tapActionFor(ui, "phone")).toBe("menu");
    expect(tapActionFor(ui, "tablet")).toBe("menu");
  });
});

describe("planTap", () => {
  it("menu always shows the menu", () => {
    expect(planTap("menu", false)).toBe("menu");
    expect(planTap("menu", true)).toBe("menu");
  });

  it("save adds a new word, and opens the card of one already saved", () => {
    expect(planTap("save", false)).toBe("save");
    expect(planTap("save", true)).toBe("show");
  });

  it("open shows the card (or the add prompt) without saving", () => {
    expect(planTap("open", false)).toBe("show");
    expect(planTap("open", true)).toBe("show");
  });
});
