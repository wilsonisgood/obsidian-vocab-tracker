import { Platform } from "obsidian";
import { formFactorOf, type FormFactor } from "./formFactor";

// Read on every call, not cached: emulateMobile() can flip it at runtime.
export function currentFormFactor(): FormFactor {
  const body = typeof document !== "undefined" ? document.body?.classList : null;
  return formFactorOf(Platform, body);
}
