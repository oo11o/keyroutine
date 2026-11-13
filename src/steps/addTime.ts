import type { Handler } from "./types";
import { resolve } from "../core/context";

const UNIT_MS: Record<"seconds" | "minutes" | "hours" | "days", number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000
};

export const addTime: Handler = async (step, ctx) => {
  if (step.type !== "addTime") throw new Error("wrong handler");
  const base = resolve(step.base, ctx);
  const ms = Date.parse(base);
  if (Number.isNaN(ms)) throw new Error(`"${base}" is not a date addTime can parse`);
  const shifted = new Date(ms + step.amount * UNIT_MS[step.unit]).toISOString();
  const sign = step.amount >= 0 ? "+" : "";
  return { value: shifted, note: `${base} ${sign}${step.amount} ${step.unit} → ${shifted}` };
};
