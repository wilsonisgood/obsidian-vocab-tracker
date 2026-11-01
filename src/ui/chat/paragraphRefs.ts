// 1101: 「¶3」 in a rendered AI answer becomes a link that jumps to that
// paragraph of the note (the whole-note AI discussion). Code, links and
// what's already a ref are left alone.

const REF_RE = /¶\s?(\d{1,4})/g;
const SKIP = "code, pre, a, .vt-para-ref";

export function linkParagraphRefs(root: HTMLElement, open: (n: number) => void): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) || !(n.nodeValue ?? "").includes("¶") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const node of nodes) {
    const text = node.nodeValue ?? "";
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(REF_RE)) {
      const i = m.index ?? 0;
      if (i > last) frag.appendChild(document.createTextNode(text.slice(last, i)));
      const n = Number(m[1]);
      const ref = document.createElement("span");
      ref.className = "vt-para-ref";
      ref.textContent = m[0];
      ref.setAttribute("role", "link");
      ref.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        open(n);
      });
      frag.appendChild(ref);
      last = i + m[0].length;
    }
    if (last === 0) continue;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.replaceWith(frag);
  }
}
