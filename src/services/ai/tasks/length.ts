import type { LearnerProfile } from "../../../core/model/settings";

// Per-task answer length (規劃書 06 §6.4.1 #2). The learner's limit suits
// explanations, but a translation has to grow with the text it translates:
// a flat 300 characters cuts a long paragraph off mid-sentence.

// Target = the learner's limit + `ratio` characters per character of
// English source, rounded up to a multiple of 50 so the prompt doesn't
// carry oddly precise numbers. A Chinese translation runs about 0.35
// characters per English character; the rest of the ratio covers notes.
export function scaledChars(profileMax: number, sourceChars: number, ratio: number): number {
  if (profileMax <= 0) return 0;
  return Math.ceil((profileMax + sourceChars * ratio) / 50) * 50;
}

// The profile a task's build() should render: same learner, the task's
// length target. Unlimited stays unlimited.
export function profileForTask<I>(
  profile: LearnerProfile,
  task: { answerChars?: (input: I, profileMax: number) => number },
  input: I
): LearnerProfile {
  if (!task.answerChars || profile.maxAnswerChars <= 0) return profile;
  return { ...profile, maxAnswerChars: task.answerChars(input, profile.maxAnswerChars) };
}
