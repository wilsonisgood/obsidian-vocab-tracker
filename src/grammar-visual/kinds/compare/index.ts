import type { KindModule } from "../../types";
import { base, baseSchema, sObj } from "../../kit/parse";
import { explain } from "../../kit/dom";

// 佔位：subagent 會換成真正的 parse / schema / render / builtin。
export const compareKind: KindModule<"compare"> = {
  kind: "compare",
  parse: () => null,
  schema: sObj(baseSchema("compare")),
  guide: "",
  render(parent, v, ctx) {
    parent.appendChild(explain(ctx, v.explain));
  },
  builtin: {},
};

void base;
