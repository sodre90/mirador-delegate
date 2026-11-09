import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { helpers, startHostWithThisPlugin, type TestHost } from "./mirador.ts";

/** Opt-in because it is not a test: MIRADOR_SCREENSHOTS=1 scripts/e2e.sh e2e/screenshots.spec.ts */
test.skip(process.env.MIRADOR_SCREENSHOTS !== "1", "set MIRADOR_SCREENSHOTS=1 to retake the plugin's screenshots");

const screenshotsDirectory = process.env.SCREENSHOTS_DIR ?? join(import.meta.dirname, "..", "screenshots");
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });

let host: TestHost;
test.beforeAll(async () => {
  ({ host } = await startHostWithThisPlugin());
});
test.afterAll(async () => {
  await host?.stop();
  await host?.cleanUp();
});

const callerName = "main-model";
const workerName = "local-model";
const request = "Why does the nightly build keep failing? The log is in ci/nightly.log.";
const task = "SAY Three tests fail in the same suite, all with a timeout in the payment mock. The first failure is at 02:14; the rest follow it.";

async function startConversationWithoutModel(page: Page) {
  const previousUrl = page.url();
  await page.getByRole("button", { name: "+ New conversation" }).click();
  await expect(page).not.toHaveURL(previousUrl);
  return page.url().match(/#\/c\/(.+)$/)![1]!;
}

/** The stand-in agent echoes the whole prompt, footer included, and the workspace sits in a temp folder; a real agent and folder don't show either. */
async function tidyForScreenshot(page: Page) {
  await page.evaluate(() => {
    const textNodes = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = textNodes.nextNode(); node; node = textNodes.nextNode()) {
      if (node.textContent?.startsWith("/var/folders") || node.textContent?.startsWith("/tmp/")) node.textContent = "~/projects/payments";
    }
    for (const element of document.querySelectorAll(".timeline .message")) {
      const html = element.innerHTML;
      const footerStart = html.search(/(<br>|\s)*---/);
      if (footerStart > 0) element.innerHTML = html.slice(0, footerStart);
    }
  });
}

async function takeScreenshot(page: Page, name: string, region?: { clip: { x: number; y: number; width: number; height: number } }) {
  mkdirSync(screenshotsDirectory, { recursive: true });
  await page.mouse.move(0, 0);
  const path = join(screenshotsDirectory, `${name}.png`);
  if (region && "clip" in region) await page.screenshot({ path, clip: region.clip });
  else await page.screenshot({ path });
}

async function clipAround(first: Locator, last: Locator, margin = 16, horizontalMargin = margin) {
  const top = (await first.boundingBox())!;
  const bottom = (await last.boundingBox())!;
  const x = Math.max(0, top.x - horizontalMargin);
  const y = Math.max(0, top.y - margin);
  return { clip: { x, y, width: Math.max(top.width, bottom.width) + 2 * horizontalMargin, height: bottom.y + bottom.height + margin - y } };
}

test("screenshots of delegate at work", async ({ page }) => {
  await helpers().signIn(page, host);
  await helpers().addWorkspace(page, host.projectDir);
  for (const name of [callerName, workerName]) {
    const profiles = await helpers().createProfile(page, name, "", "", "opencode");
    await profiles.getByRole("button", { name: "Close" }).click();
  }
  await page.getByLabel("Agent", { exact: true }).selectOption({ label: `${callerName} · opencode` });
  const conversationId = await startConversationWithoutModel(page);
  await helpers().sendMessage(page, request);
  await expect(page.locator(".chat-header:visible .badge")).toHaveText("idle", { timeout: 60_000 });

  const dialog = await helpers().openProfiles(page);
  await dialog.locator(".profile-list li", { hasText: callerName }).click();
  await helpers().openProfileTab(dialog, "Plugins");
  await dialog.getByLabel("Profile Delegate to").selectOption({ label: workerName });
  const settingRow = dialog.locator("label[data-hint]", { hasText: "Delegate to" });
  await takeScreenshot(page, "delegate-to-setting", await clipAround(settingRow, settingRow, 10, 12));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.locator(".saved")).toHaveText("Saved");
  await dialog.getByRole("button", { name: "Close" }).click();

  await helpers().callCanvasTool(host, conversationId, "delegate", { task });
  const fromDelegate = page.locator(".timeline-entry:visible", { has: page.locator(".author", { hasText: "From Delegate" }) });
  await expect(fromDelegate).toContainText("Three tests fail");
  await expect(page.locator(".chat-header:visible .badge")).toHaveText("idle", { timeout: 60_000 });
  await page.getByRole("button", { name: "Dismiss" }).click();
  await tidyForScreenshot(page);
  const entries = page.locator(".timeline-entry:visible");
  await takeScreenshot(page, "reply-in-calling-conversation", await clipAround(page.locator(".chat-header:visible"), entries.last(), 8, 0));
});
