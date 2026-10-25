import csv, sys
src, dst = sys.argv[1], sys.argv[2]
order = ["A1", "A2", "B1", "B2"]
best = {}
with open(src, encoding="utf-8") as f:
    for row in csv.DictReader(f):
        lv = row["CEFR"].strip().upper()
        if lv not in order:
            continue
        for w in row["headword"].split("/"):
            w = w.strip().lower()
            if not w or not all(c.isalpha() or c in " '-." for c in w):
                continue
            if w not in best or order.index(lv) < order.index(best[w]):
                best[w] = lv
by = {lv: sorted(w for w, l in best.items() if l == lv) for lv in order}
for lv in order:
    for w in by[lv]:
        assert "|" not in w and "`" not in w and "\\" not in w and "$" not in w
lines = [
    "// CEFR-J Wordlist Version 1.5 (A1–B2), word → lowest level listed.",
    "// Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from",
    "// http://www.cefr-j.org/download.html (via github.com/openlanguageprofiles/olp-en-cefrj).",
    "// Free for research and commercial use with citation; copyright Tono Laboratory, TUFS.",
    "// Generated file — do not edit by hand.",
    "",
    "export const CEFRJ_WORDS: Readonly<Record<\"A1\" | \"A2\" | \"B1\" | \"B2\", string>> = {",
]
for lv in order:
    lines.append(f"  {lv}: \"{'|'.join(by[lv])}\",")
lines.append("};")
open(dst, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print({lv: len(by[lv]) for lv in order}, "total", len(best))
