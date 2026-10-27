import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { helpers, startHostWithThisPlugin, type TestHost } from "./mirador.ts";

let host: TestHost;
let promptsFile: string;
const delegatorName = "delegator";
const workerName = "worker";
const task = "SAY Found 3 callers.";

/** Everything the agent was given, in order; a prompt of several lines is written as it stands. */
const agentSaw = () => readFileSync(promptsFile, "utf8");

test.beforeAll(async () => {
  ({ host, promptsFile } = await startHostWithThisPlugin());
});
test.afterAll(async () => {
  await host?.stop();
  await host?.cleanUp();
});

/** The stub agent offers no model to pick, so this is `startConversation` without that wait. */
async function startConversationWithoutModel(page: Page) {
  const previousUrl = page.url();
  await page.getByRole("button", { name: "+ New conversation" }).click();
  await expect(page).not.toHaveURL(previousUrl);
  return page.url().match(/#\/c\/(.+)$/)![1]!;
}

async function sendAndWait(page: Page, text: string) {
  await helpers().sendMessage(page, text);
  await expect(page.locator(".chat-header:visible .badge")).toHaveText("idle", { timeout: 60_000 });
}

test("the delegate tool hands a task to a conversation on another profile, whose reply comes back as the caller's next message, and its refusals say why", async ({ page }) => {
  await helpers().signIn(page, host);
  await helpers().addWorkspace(page, host.projectDir);
  const profiles = await helpers().createProfile(page, delegatorName, "", "", "opencode");
  await profiles.getByRole("button", { name: "Close" }).click();
  const other = await helpers().createProfile(page, workerName, "", "", "opencode");
  await other.getByRole("button", { name: "Close" }).click();
  await page.getByLabel("Agent", { exact: true }).selectOption({ label: `${delegatorName} · opencode` });
  const conversationId = await startConversationWithoutModel(page);
  await sendAndWait(page, "Start");

  const delegate = (conversation: string, profile: string) => helpers().callCanvasTool(host, conversation, "delegate", { profile, task });
  let delegatedId = "";

  await test.step("the tool returns at once and the new conversation shows folded under the caller in the sidebar", async () => {
    const started = await delegate(conversationId, workerName);
    expect(started).toMatch(/^Started conversation [0-9a-f-]+ on worker\./);
    delegatedId = started.match(/^Started conversation ([0-9a-f-]+) on/)![1]!;
    await expect(page.locator(`.sidebar li[data-reorder-id="${conversationId}"]`).getByRole("button", { name: "1 delegated" })).toBeVisible();
  });

  await test.step("the new conversation's first reply reaches the caller's agent, with the footer the plugin added to the task", async () => {
    await expect.poll(agentSaw).toContain("The task delegated to");
    const delivered = agentSaw().slice(agentSaw().indexOf("The task delegated to"));
    expect(delivered).toContain("finished");
    expect(delivered).toContain("Found 3 callers.");
    expect(delivered).toContain("End with a short, plain answer");
  });

  await test.step("a profile name that isn't there comes back as an error naming the profiles there are", async () => {
    const error = await delegate(conversationId, "nope");
    expect(error).toMatch(/^There is no profile named nope; the profiles are .*\.$/);
    expect(error).toContain(delegatorName);
    expect(error).toContain(workerName);
  });

  await test.step("the delegated conversation can't delegate again, as Mirador keeps to one level", async () => {
    const refused = await delegate(delegatedId, workerName);
    expect(refused).toContain("can't start another");
  });

  await test.step("with Delegate to set on the caller's profile, delegate needs no profile, and without it says where to set one", async () => {
    const unset = await helpers().callCanvasTool(host, conversationId, "delegate", { task });
    expect(unset).toContain("has none set in Delegate to");

    const dialog = await helpers().openProfiles(page);
    await dialog.locator(".profile-list li", { hasText: delegatorName }).click();
    await dialog.getByLabel("Profile Delegate to").selectOption({ label: workerName });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.locator(".saved")).toHaveText("Saved");
    await dialog.getByRole("button", { name: "Close" }).click();

    expect(await helpers().callCanvasTool(host, conversationId, "delegate", { task })).toMatch(/^Started conversation [0-9a-f-]+ on worker\./);
  });
});
