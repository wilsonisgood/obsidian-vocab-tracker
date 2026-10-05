import type { AiRunResult, RunOptions } from "../ai/AiService";
import { formatAiRequest, withDebug, type AiDebugInfo } from "../ai/errors";
import type { AiTask } from "../ai/tasks/types";
import type { LearnAi } from "./ports";

// One structured AI run (字族 / 動詞用法): run the task, then parse its
// answer. When the answer can't be read (bad_output — from the provider's
// JSON parse or the task's own parse), the error carries what was sent and
// what came back (AiError.extra.debug), so the failure box can show both
// instead of only 「AI 回答的格式不對」 (1005 回饋 #4-2).
//
// The prompt is rebuilt with AiService.prepare from the same input: the
// same task, input and learner settings give the same request, byte for
// byte (prepare is what run() itself calls).

export interface StructuredRun<O> {
  result: AiRunResult;
  value: O;
}

function rawOutput(r: Pick<AiRunResult, "text" | "json">): string {
  if (r.text.trim()) return r.text;
  if (r.json === undefined) return "";
  try {
    return JSON.stringify(r.json, null, 2);
  } catch {
    return String(r.json);
  }
}

export async function runStructured<I, O>(
  ai: LearnAi,
  task: AiTask<I, O>,
  input: I,
  opts: RunOptions = {}
): Promise<StructuredRun<O>> {
  const prompt = (): string => {
    try {
      return ai.prepare ? formatAiRequest(ai.prepare(task, input).request) : "";
    } catch {
      return "";
    }
  };
  const debug = (extra: Partial<AiDebugInfo>): AiDebugInfo => ({ taskId: task.id, prompt: prompt(), output: "", ...extra });

  let result: AiRunResult;
  try {
    result = await ai.run(task, input, opts);
  } catch (e) {
    // The provider couldn't read the JSON: AiService keeps the text that
    // streamed in as partialText.
    throw withDebug(e, () => debug({ output: (e as { extra?: { partialText?: string } }).extra?.partialText ?? "" }));
  }
  if (!task.parse) throw new Error(`Task ${task.id} has no parser`);
  try {
    return { result, value: task.parse(result) };
  } catch (e) {
    throw withDebug(e, () => debug({ output: rawOutput(result), model: result.model, stop: result.stop }));
  }
}
