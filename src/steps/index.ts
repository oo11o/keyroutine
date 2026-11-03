import type { Step } from "../core/schema";
import type { Handler } from "./types";
import { readBySelector } from "./readBySelector";
import { saveValue } from "./saveValue";
import { inputToSelector } from "./inputToSelector";
import { focusBySelector } from "./focusBySelector";
import { clickBySelector } from "./clickBySelector";
import { pressKey } from "./pressKey";
import { wait } from "./wait";
import { waitForSelector } from "./waitForSelector";
import { popup } from "./popup";
import { popupJson } from "./popupJson";
import { openUrlInNewTab } from "./openUrlInNewTab";
import { openUrlInCurrentTab } from "./openUrlInCurrentTab";
import { fetchUrl } from "./fetchUrl";

export const handlers: Record<Step["type"], Handler> = {
  readBySelector,
  saveValue,
  inputToSelector,
  focusBySelector,
  clickBySelector,
  pressKey,
  wait,
  waitForSelector,
  popup,
  popupJson,
  openUrlInNewTab,
  openUrlInCurrentTab,
  fetchUrl
};
