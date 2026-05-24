/**
 * Strip non-serializable fields from a Question before returning it to the client.
 * (Question.prerequisite is a function and cannot be JSON-encoded.)
 */
import type { Question, EducationalInsert, AnswerOption } from "./types";

export interface ClientAnswerOption {
  id: string;
  text: string;
  ghost?: boolean;
}

export interface ClientQuestion {
  id: string;
  text: string;
  subtext?: string;
  options: ClientAnswerOption[];
  educationalInsert?: EducationalInsert;
}

function toClientOption(o: AnswerOption): ClientAnswerOption {
  return {
    id: o.id,
    text: o.text,
    ...(o.ghost ? { ghost: true } : {}),
  };
}

export function sanitizeQuestion(q: Question): ClientQuestion {
  return {
    id: q.id,
    text: q.text,
    ...(q.subtext ? { subtext: q.subtext } : {}),
    options: q.options.map(toClientOption),
    ...(q.educationalInsert ? { educationalInsert: q.educationalInsert } : {}),
  };
}
