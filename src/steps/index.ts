import type { Step } from "../core/schema";
import type { Handler } from "./types";
import { readBySelector } from "./readBySelector";
import { saveValue } from "./saveValue";
import { regexExtract } from "./regexExtract";
import { inputToSelector } from "./inputToSelector";
import { selectOptionStep } from "./selectOption";
import { focusBySelector } from "./focusBySelector";
import { clickBySelector } from "./clickBySelector";
import { pressKey } from "./pressKey";
import { wait } from "./wait";
import { waitForSelector } from "./waitForSelector";
import { popup } from "./popup";
import { popupJson } from "./popupJson";
import { promptInput } from "./promptInput";
import { openUrlInNewTab } from "./openUrlInNewTab";
import { openUrlInCurrentTab } from "./openUrlInCurrentTab";
import { fetchUrl } from "./fetchUrl";
import { repeatLastRoutine } from "./repeatLastRoutine";
import { addTime } from "./addTime";
import { calculate } from "./calculate";

export const handlers: Record<Step["type"], Handler> = {
  readBySelector,
  saveValue,
  regexExtract,
  inputToSelector,
  selectOption: selectOptionStep,
  focusBySelector,
  clickBySelector,
  pressKey,
  wait,
  waitForSelector,
  popup,
  popupJson,
  promptInput,
  openUrlInNewTab,
  openUrlInCurrentTab,
  fetchUrl,
  repeatLastRoutine,
  addTime,
  calculate
};
