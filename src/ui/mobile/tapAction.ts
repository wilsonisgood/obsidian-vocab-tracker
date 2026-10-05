import { resolveUiPrefs, type TapAction, type UiSettings } from "../../core/model/settings";
import { isMobileForm, type FormFactor } from "./formFactor";

// Tapping a word in reading view (規劃書 01 §3.2): which setting applies,
// and what to do with this particular word.

// Desktop has its own setting; iPhone and iPad share the mobile one.
export function tapActionFor(ui: Partial<UiSettings> | undefined, form: FormFactor): TapAction {
  const prefs = resolveUiPrefs(ui);
  return isMobileForm(form) ? prefs.tapActionMobile : prefs.tapAction;
}

//   menu — the 「加入／開啟」 menu
//   save — add the word now, Notice with 復原
//   show — the word's card (sidebar / bottom sheet); an untracked word shows
//          the 「加入單字庫」 prompt there
export type TapPlan = "menu" | "save" | "show";

// With "save", a word that's already saved has nothing left to save — the
// second tap on it opens its card (規劃書 01 §3.3 「再點一次同一個字」).
export function planTap(action: TapAction, tracked: boolean): TapPlan {
  switch (action) {
    case "save":
      return tracked ? "show" : "save";
    case "open":
      return "show";
    default:
      return "menu";
  }
}
