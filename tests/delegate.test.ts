import { expect, test } from "bun:test";
import host, { REPLY_LIMIT, replyMessage } from "../host.ts";
import type { CanvasToolContext, FirstReply } from "../mirador/api.ts";

const delegate = host.tools.delegate!;

/** Conversation `conversationId`'s tool context, with one storage for all, starting conversations c2, c3… */
function contexts() {
  const stored = new Map<string, unknown>();
  const started: { profile: string; prompt: string }[] = [];
  const prompts: { conversationId: string; text: string; afterTurn?: boolean }[] = [];
  const finishers: ((reply: FirstReply) => void)[] = [];
  const contextOf = (conversationId: string) =>
    ({
      conversationId,
      storage: { get: (key: string) => stored.get(key), set: (key: string, value: unknown) => void stored.set(key, value) },
      prompt: async (text: string, options?: { afterTurn?: boolean }) => void prompts.push({ conversationId, text, ...options }),
      startConversation: async (start: { profile: string; prompt: string }) => {
        if (start.profile === "nope") throw new Error("There is no profile named nope; the profiles are Pi Radiance.");
        started.push(start);
        return { id: `c${started.length + 1}`, firstReply: new Promise<FirstReply>((resolve) => finishers.push(resolve)) };
      },
    }) as unknown as CanvasToolContext;
  return { contextOf, started, prompts, finish: (index: number, reply: FirstReply) => finishers[index]!(reply) };
}

test("starts a conversation on the profile with the task, returns at once, and passes its reply back after the caller's turn", async () => {
  const { contextOf, started, prompts, finish } = contexts();
  const answer = await delegate.run({ profile: "Pi Radiance", task: "Summarise build.log" }, contextOf("c1"));

  expect(answer).toStartWith("Started conversation c2 on Pi Radiance.");
  expect(started).toHaveLength(1);
  expect(started[0]!.prompt).toStartWith("Summarise build.log\n\n---\n");
  expect(started[0]!.prompt).toContain("End with a short, plain answer");
  expect(prompts).toEqual([]);

  finish(0, { text: "Two tests fail on a timeout.", ended: "finished" });
  await Bun.sleep(0);
  expect(prompts).toEqual([
    {
      conversationId: "c1",
      text: "The task delegated to Pi Radiance (conversation c2) finished. Treat it as leads to check, not as verified. Its agent's last message:\n\nTwo tests fail on a timeout.",
      afterTurn: true,
    },
  ]);
});

test("a conversation it started can't delegate again", async () => {
  const { contextOf } = contexts();
  await delegate.run({ profile: "Pi Radiance", task: "Summarise build.log" }, contextOf("c1"));
  await expect(delegate.run({ profile: "Pi Radiance", task: "Again" }, contextOf("c2"))).rejects.toThrow("can't delegate again");
});

test("a profile that isn't there reaches the agent as Mirador's error, and nothing is remembered", async () => {
  const { contextOf, started } = contexts();
  await expect(delegate.run({ profile: "nope", task: "Anything" }, contextOf("c1"))).rejects.toThrow("the profiles are Pi Radiance");
  expect(started).toEqual([]);
});

test("the reply says how the turn ended, and a long one is cut with a pointer to the conversation", () => {
  expect(replyMessage("Local", "c2", { text: null, ended: "failed" })).toBe("The task delegated to Local (conversation c2) failed. Its agent said nothing in words.");
  const long = replyMessage("Local", "c2", { text: "x".repeat(REPLY_LIMIT + 10), ended: "stopped" });
  expect(long).toStartWith("The task delegated to Local (conversation c2) stopped.");
  expect(long).toEndWith(`${"x".repeat(10)}\n\n[Cut at ${REPLY_LIMIT} characters; conversation c2 has the whole reply.]`);
});

test("the tool's guidance says when to delegate", () => {
  expect(host.guidance?.instructions).toStartWith("- delegate: ");
  expect(host.guidance?.often).toStartWith("- delegate: ");
});
