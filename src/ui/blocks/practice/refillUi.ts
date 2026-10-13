import { t } from "../../../core/i18n";
import { aiErrorBox } from "../../kit/aiDebug";
import { isAbort, learnButton, learnErrorText } from "../learnUi";

// 第十八波 T: the error line of a failed refill with 「再試一次」 inside the
// same aiErrorBox. Clears the note first; returns whether the refill failed
// (an abort or no error is not a failure).
export function renderRefillError(note: HTMLElement, error: unknown, onRetry: () => void): boolean {
  note.empty();
  if (!error || isAbort(error)) return false;
  const box = aiErrorBox({ text: learnErrorText(error), error });
  learnButton(box, { label: t("practice.retry"), icon: "rotate-ccw", ghost: true, onClick: onRetry });
  note.appendChild(box);
  return true;
}
