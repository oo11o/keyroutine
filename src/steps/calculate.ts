import type { Handler } from "./types";
import { resolve } from "../core/context";

function toNumber(raw: string, side: "left side" | "right side"): number {
  const trimmed = raw.trim();
  const n = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(n)) throw new Error(`"${raw}" is not a number (${side})`);
  return n;
}

export const calculate: Handler = async (step, ctx) => {
  if (step.type !== "calculate") throw new Error("wrong handler");
  const a = toNumber(resolve(step.a, ctx), "left side");
  const b = toNumber(resolve(step.b, ctx), "right side");

  let result: number;
  switch (step.operator) {
    case "+":
      result = a + b;
      break;
    case "-":
      result = a - b;
      break;
    case "*":
      result = a * b;
      break;
    case "/":
      if (b === 0) throw new Error("division by zero");
      result = a / b;
      break;
  }

  const value = String(result);
  return { value, note: `${a} ${step.operator} ${b} = ${value}` };
};
