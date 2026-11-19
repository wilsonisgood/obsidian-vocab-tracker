import type { KindModule } from "../../types";
import { base, baseSchema, sObj } from "../../kit/parse";
import { explain } from "../../kit/dom";

// 佔位：subagent 會換成真正的 parse / schema / render / builtin。
export const agreementKind: KindModule<"agreement"> = {
  kind: "agreement",
  parse: () => null,
  schema: sObj(baseSchema("agreement")),
  guide: "",
  render(parent, v, ctx) {
    parent.appendChild(explain(ctx, v.explain));
  },
  builtin: {},
};

void base;
