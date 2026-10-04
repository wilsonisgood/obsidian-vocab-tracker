import type { AiTask, Surface } from "./types";

// Registry of every AI task (規劃書 06 §6.3). QuickActions (M4) renders
// `forSurface(s).filter(t => t.label)` as buttons; family/verb/trivia tasks
// register here when M7 adds them.
//
// Stored loosely typed: each task's input type is only known at its call
// site, which looks the task up by its exported constant, not by string.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTask = AiTask<any, unknown>;

export class TaskRegistry {
  private tasks = new Map<string, AnyTask>();

  constructor(initial: AnyTask[] = []) {
    for (const t of initial) this.register(t);
  }

  register(task: AnyTask): void {
    if (this.tasks.has(task.id)) throw new Error(`AI task "${task.id}" is already registered`);
    this.tasks.set(task.id, task);
  }

  get(id: string): AnyTask | undefined {
    return this.tasks.get(id);
  }

  forSurface(surface: Surface): AnyTask[] {
    return [...this.tasks.values()].filter((t) => t.surface === surface);
  }

  all(): AnyTask[] {
    return [...this.tasks.values()];
  }
}

export function defaultTaskRegistry(): TaskRegistry {
  return new TaskRegistry([]);
}
