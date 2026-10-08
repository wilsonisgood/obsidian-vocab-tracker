// 規劃書 10 §2.12：一條橫列、超出往右、可拖動（1007-2 #4 #5 #11）。
// 觸控用原生捲動；滑鼠按住拖 > 4px 才算拖，放開後吞掉那一次 click；
// 直向滾輪在沒有橫向位移時轉成橫向。回傳解除函式（給 Component.register）。
export function dragScroll(el: HTMLElement): () => void {
  el.addClass("vt-hscroll");
  let startX = 0;
  let startLeft = 0;
  let pointerId: number | null = null;
  let dragged = false;
  const down = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startLeft = el.scrollLeft;
    dragged = false;
  };
  const move = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) return;
    const dx = e.clientX - startX;
    if (!dragged && Math.abs(dx) <= 4) return;
    if (!dragged) {
      dragged = true;
      el.setPointerCapture(e.pointerId);
      el.addClass("is-dragging");
    }
    el.scrollLeft = startLeft - dx;
  };
  const up = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    el.removeClass("is-dragging");
  };
  const click = (e: MouseEvent) => {
    if (!dragged) return;
    dragged = false;
    e.stopPropagation();
    e.preventDefault();
  };
  const wheel = (e: WheelEvent) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > 0 || e.deltaY === 0) return;
    if (el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("click", click, true);
  el.addEventListener("wheel", wheel, { passive: false });
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    el.removeEventListener("click", click, true);
    el.removeEventListener("wheel", wheel);
  };
}
