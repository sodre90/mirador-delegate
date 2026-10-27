import { expect, test } from "bun:test";
import host, { REPLY_LIMIT, replyMessage } from "../host.ts";
import type { CanvasActionContext, CanvasToolContext } from "../mirador/api.ts";

const delegate = host.tools.delegate!;

/** Conversation `conversationId`'s context, starting conversations c2, c3… on the profile as Mirador names it. */
function contexts(delegateTo: string | null = null) {
  const started: { profile: string; prompt: string }[] = [];
  const prompts: { conversationId: string; text: string; afterTurn?: boolean }[] = [];
  const contextOf = (conversationId: string) =>
    ({
      conversationId,
      profileSetting: (id: string) => (id === "delegate-to" ? delegateTo : null),
      prompt: async (text: string, options?: { afterTurn?: boolean }) => void prompts.push({ conversationId, text, ...options }),
      startConversation: async (start: { profile: string; prompt: string }) => {
        if (start.profile === "nope") throw new Error("There is no profile named nope; the profiles are Pi Radiance.");
        started.push(start);
        return { id: `c${started.length + 1}`, profile: "Pi Radiance" };
      },
    }) as unknown as CanvasToolContext & CanvasActionContext;
  return { contextOf, started, prompts };
}

test("starts a conversation on the profile with the task, returns at once, and passes its reply back after the caller's turn", async () => {
  const { contextOf, started, prompts } = contexts();
  const answer = await delegate.run({ profile: "pi radiance", task: "Summarise build.log" }, contextOf("c1"));

  expect(answer).toStartWith("Started conversation c2 on Pi Radiance.");
  expect(started).toHaveLength(1);
  expect(started[0]!.prompt).toStartWith("Summarise build.log\n\n---\n");
  expect(started[0]!.prompt).toContain("End with a short, plain answer");
  expect(prompts).toEqual([]);

  await host.replied!({ id: "c2", profile: "Pi Radiance" }, { text: "Two tests fail on a timeout.", ended: "finished" }, contextOf("c1"));
  expect(prompts).toEqual([
    {
      conversationId: "c1",
      text: "The task delegated to Pi Radiance finished. Treat it as leads to check, not as verified. Its agent's last message:\n\nTwo tests fail on a timeout.",
      afterTurn: true,
    },
  ]);
});

test("a profile that isn't there reaches the agent as Mirador's error", async () => {
  const { contextOf, started } = contexts();
  await expect(delegate.run({ profile: "nope", task: "Anything" }, contextOf("c1"))).rejects.toThrow("the profiles are Pi Radiance");
  expect(started).toEqual([]);
});

test("the reply says how the turn ended, and a long one is cut with a pointer to the conversation", () => {
  expect(replyMessage("Local", "c2", { text: null, ended: "failed" })).toBe("The task delegated to Local failed. Its agent said nothing in words.");
  const long = replyMessage("Local", "c2", { text: "x".repeat(REPLY_LIMIT + 10), ended: "stopped" });
  expect(long).toStartWith("The task delegated to Local stopped.");
  expect(long).toEndWith(`${"x".repeat(10)}\n\n[Cut at ${REPLY_LIMIT} characters; conversation c2 has the whole reply.]`);
});

test("the tool's guidance says when to delegate", () => {
  expect(host.guidance?.instructions).toStartWith("- delegate: ");
  expect(host.guidance?.often).toStartWith("- delegate: ");
});

test("without a profile named, it delegates to the one the conversation's profile delegates to, and says how to set one when there is none", async () => {
  const set = contexts("Claude Qwen 27b");
  await delegate.run({ task: "Summarise build.log" }, set.contextOf("c1"));
  expect(set.started.map(({ profile }) => profile)).toEqual(["Claude Qwen 27b"]);

  const unset = contexts();
  await expect(delegate.run({ task: "Summarise build.log" }, unset.contextOf("c1"))).rejects.toThrow("has none set in Delegate to");
  expect(unset.started).toEqual([]);
});

test("a profile that delegates to another tells its conversations to hand it easy tasks without asking; one that doesn't adds nothing", () => {
  expect(host.guidanceFor!((id) => (id === "delegate-to" ? "Claude Qwen 27b" : null))?.instructions).toBe(
    "- delegate: this profile delegates to Claude Qwen 27b. Hand it easy, self-contained tasks yourself, without asking first, and leave out the profile argument.",
  );
  expect(host.guidanceFor!(() => null)).toBeNull();
});
