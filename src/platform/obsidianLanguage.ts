import * as obsidian from "obsidian";

// Obsidian's UI language. getLanguage() only exists from 1.8.7 (the
// manifest still allows older apps), so fall back to the localStorage key
// Obsidian itself has long used for the language setting.
export function obsidianLanguage(): string {
  const getLanguage = (obsidian as { getLanguage?: () => string }).getLanguage;
  if (typeof getLanguage === "function") return getLanguage();
  try {
    return window.localStorage.getItem("language") ?? "en";
  } catch {
    return "en";
  }
}
