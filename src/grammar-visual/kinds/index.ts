import type { KindModule, LayoutKind } from "../types";
import { timelineKind } from "./timeline";
import { scaleKind } from "./scale";
import { unrealKind } from "./unreal";
import { backshiftKind } from "./backshift";
import { focusKind } from "./focus";
import { verbslotKind } from "./verbslot";
import { pathKind } from "./path";
import { connectorKind } from "./connector";
import { orderKind } from "./order";
import { scopeKind } from "./scope";
import { clauseKind } from "./clause";
import { compareKind } from "./compare";
import { linkKind } from "./link";
import { agreementKind } from "./agreement";

// 每種版面一個資料夾（kinds/<kind>/），各自擁有 parse、schema、guide、
// render、builtin 與 style.css。
export const KINDS: { readonly [K in LayoutKind]: KindModule<K> } = {
  timeline: timelineKind,
  scale: scaleKind,
  unreal: unrealKind,
  backshift: backshiftKind,
  focus: focusKind,
  verbslot: verbslotKind,
  path: pathKind,
  connector: connectorKind,
  order: orderKind,
  scope: scopeKind,
  clause: clauseKind,
  compare: compareKind,
  link: linkKind,
  agreement: agreementKind,
};
