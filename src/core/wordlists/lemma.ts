// Possible base forms of an inflected word, most likely first, so text
// that says "analyzed" still hits a list entry "analyze". Only consulted
// when the word as written isn't in any list — a list that contains
// "building" keeps matching "building", never "build".
//
// Deliberately rule-based and small (規劃書 03 §3.2 第一階段): no
// irregular forms ("went" → "go"), and no -er/-est, which turn too many
// ordinary words into other words ("number" → "numb").

const MIN_BASE = 3;

function isConsonant(c: string): boolean {
  return /[b-df-hj-np-tv-z]/.test(c);
}

export function lemmaCandidates(lower: string): string[] {
  const w = lower.endsWith("'s") ? lower.slice(0, -2) : lower;
  // "student's" → "student" first, then that word's own inflections.
  const out: string[] = w !== lower ? [w] : [];
  const add = (base: string) => {
    if (base.length >= MIN_BASE && base !== w && !out.includes(base)) out.push(base);
  };

  if (w.endsWith("ies") || w.endsWith("ied")) {
    add(w.slice(0, -3) + "y"); // studies, studied → study
  }

  if (w.endsWith("s") && !w.endsWith("ss")) {
    add(w.slice(0, -1)); // makes → make
    if (w.endsWith("es")) add(w.slice(0, -2)); // boxes → box
  }

  // "feed", "speed", "seed" aren't past tenses.
  if (w.endsWith("ed") && !w.endsWith("eed")) {
    add(w.slice(0, -1)); // used → use
    const stem = w.slice(0, -2);
    add(stem); // walked → walk
    if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2] && isConsonant(stem[stem.length - 1])) {
      add(stem.slice(0, -1)); // stopped → stop
    }
  }

  if (w.endsWith("ing")) {
    const stem = w.slice(0, -3);
    add(stem); // walking → walk
    add(stem + "e"); // making → make
    if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2] && isConsonant(stem[stem.length - 1])) {
      add(stem.slice(0, -1)); // running → run
    }
    if (stem.endsWith("y")) add(stem.slice(0, -1) + "ie"); // lying → lie
  }

  if (w.endsWith("ily")) add(w.slice(0, -3) + "y"); // easily → easy
  if (w.endsWith("ly") && w.length - 2 >= 4) add(w.slice(0, -2)); // significantly → significant

  return out;
}
