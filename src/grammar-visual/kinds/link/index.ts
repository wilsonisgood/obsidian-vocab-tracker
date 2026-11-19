import type { KindModule } from "../../types";
import { base, baseSchema, sObj } from "../../kit/parse";
import { explain } from "../../kit/dom";

// 佔位：subagent 會換成真正的 parse / schema / render / builtin。
export const linkKind: KindModule<"link"> = {
  kind: "link",
  parse: () => null,
  schema: sObj(baseSchema("link")),
  guide: "",
  render(parent, v, ctx) {
    parent.appendChild(explain(ctx, v.explain));
  },
  builtin: {},
};

void base;
