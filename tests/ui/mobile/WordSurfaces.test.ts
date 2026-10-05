import { describe, expect, it, vi } from "vitest";
import type { SectionRef } from "../../../src/services/anchors/ParagraphAnchorService";
import type { FormFactor } from "../../../src/ui/mobile/formFactor";
import { WordSurfaces, type SidebarTarget } from "../../../src/ui/mobile/WordSurfaces";

const REF: SectionRef = { path: "a.md", lineStart: 3, lineEnd: 3, text: "Last time I was in a stadium" };

function setup(form: FormFactor, opts: { sidebarOpen?: boolean; sidebarRebinding?: boolean; sheetRebinding?: boolean } = {}) {
  const sheet = {
    showWord: vi.fn(),
    openWord: vi.fn(),
    openParagraph: vi.fn(async () => {}),
    rebinding: !!opts.sheetRebinding,
  };
  const sidebar: SidebarTarget = {
    setWord: vi.fn(),
    openWord: vi.fn(),
    openParagraph: vi.fn(async () => {}),
    rebindThreadId: opts.sidebarRebinding ? "t1" : null,
  };
  const revealSidebar = vi.fn(async () => sidebar);
  const surfaces = new WordSurfaces({
    form: () => form,
    sheet,
    revealSidebar,
    existingSidebar: () => (opts.sidebarOpen || opts.sidebarRebinding ? sidebar : null),
  });
  return { surfaces, sheet, sidebar, revealSidebar };
}

describe("WordSurfaces", () => {
  it("iPhone: a tapped word opens the bottom sheet, never the sidebar", async () => {
    const { surfaces, sheet, revealSidebar } = setup("phone");
    await surfaces.revealWord("glittery", { sentence: "…a glittery leotard." });
    expect(sheet.showWord).toHaveBeenCalledWith("glittery", { ctx: { sentence: "…a glittery leotard." } });
    expect(revealSidebar).not.toHaveBeenCalled();
  });

  it("iPad and desktop: the sidebar, as before", async () => {
    for (const form of ["tablet", "desktop"] as const) {
      const { surfaces, sheet, sidebar } = setup(form);
      await surfaces.revealWord("glittery");
      expect(sidebar.setWord).toHaveBeenCalledWith("glittery");
      expect(sheet.showWord).not.toHaveBeenCalled();
    }
  });

  it("a word card on a tab (word page's 「在側欄開啟」)", async () => {
    const phone = setup("phone");
    await phone.surfaces.openWordCard("e1", "ai");
    expect(phone.sheet.openWord).toHaveBeenCalledWith("e1", "ai");
    const ipad = setup("tablet");
    await ipad.surfaces.openWordCard("e1", "ai");
    expect(ipad.sidebar.openWord).toHaveBeenCalledWith("e1", "ai");
  });

  it("a paragraph ✦: the sheet on iPhone, the sidebar elsewhere", async () => {
    const phone = setup("phone");
    await phone.surfaces.openParagraph(REF);
    expect(phone.sheet.openParagraph).toHaveBeenCalledWith(REF);
    expect(phone.revealSidebar).not.toHaveBeenCalled();

    const desk = setup("desktop");
    await desk.surfaces.openParagraph(REF);
    expect(desk.sidebar.openParagraph).toHaveBeenCalledWith(REF);
    expect(desk.sheet.openParagraph).not.toHaveBeenCalled();
  });

  it("a rebind waiting in the sidebar gets the ✦ even on iPhone", async () => {
    const { surfaces, sheet, sidebar, revealSidebar } = setup("phone", { sidebarRebinding: true });
    await surfaces.openParagraph(REF);
    expect(sidebar.openParagraph).toHaveBeenCalledWith(REF);
    expect(sheet.openParagraph).not.toHaveBeenCalled();
    expect(revealSidebar).not.toHaveBeenCalled();
  });

  it("a rebind started from the sheet gets the ✦ (whatever the form factor says now)", async () => {
    const { surfaces, sheet, sidebar } = setup("desktop", { sheetRebinding: true });
    await surfaces.openParagraph(REF);
    expect(sheet.openParagraph).toHaveBeenCalledWith(REF);
    expect(sidebar.openParagraph).not.toHaveBeenCalled();
  });

  it("an open sidebar on iPhone that isn't rebinding doesn't take over", async () => {
    const { surfaces, sheet } = setup("phone", { sidebarOpen: true });
    await surfaces.openParagraph(REF);
    expect(sheet.openParagraph).toHaveBeenCalled();
  });
});
