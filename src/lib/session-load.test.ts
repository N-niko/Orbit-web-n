import { describe, expect, it, vi } from "vitest";
import { sessionLoader } from "./session-load";
describe("workspace session loading", () => {
 it("shares the initial request and ignores repeated sign-in notifications", async () => {
  let finish!: () => void;
  const request = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const load = sessionLoader(request);
  const initial = load("student-a");
  expect(load("student-a")).toBe(initial);
  expect(request).toHaveBeenCalledTimes(1);
  finish(); await initial;
  await load("student-a");
  expect(request).toHaveBeenCalledTimes(1);
 });
 it("reloads on account changes and after signing out, without sharing user data", async () => {
  const request = vi.fn(async (_userId: string | null) => {});
  const load = sessionLoader(request);
  for (const id of [null, null, "a", "a", "b", null, null, "a"]) await load(id);
  expect(request.mock.calls.map(([id]) => id)).toEqual([null, "a", "b", null, "a"]);
 });
});
