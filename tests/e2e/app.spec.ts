import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const runId = Date.now().toString(36);
const admin = {
  username: `e2e_gm_${runId}`,
  displayName: "E2E GM",
  password: "e2e-password-123",
};
const player = {
  username: `e2e_player_${runId}`,
  displayName: "E2E Player",
  password: "e2e-password-123",
};
const importer = {
  username: `e2e_import_${runId}`,
  displayName: "E2E Importer",
  password: "e2e-password-123",
};
const campaignName = `E2E Campaign ${runId}`;

let campaignPath = "";
let inviteCode = "";
let fighterSheetPath = "";

async function register(page: Page, user: typeof admin): Promise<void> {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Join the hall" })).toBeVisible();
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Display name").fill(user.displayName);
  await page.getByLabel(/^Password/).fill(user.password);
  await page.getByLabel("Confirm password").fill(user.password);
  await page.getByRole("button", { name: /Create account/ }).click();
  await expect(page).toHaveURL(/\/campaigns$/);
}

async function signIn(page: Page, user: typeof admin): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page).toHaveURL(/\/campaigns$/);
}

async function openPartyActions(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Party actions/ }).click();
}

async function openNewCharacter(page: Page, name: string): Promise<void> {
  await page.goto("/campaigns");
  await page.getByRole("button", { name: "New character" }).click();
  const dialog = page.getByRole("dialog", { name: "Forge a new hero" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Character name").fill(name);
  await dialog.getByLabel("Campaign").selectOption({ label: campaignName });
  await dialog.getByRole("button", { name: "Start building" }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+\/edit$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 15_000 });
}

async function goToStep(page: Page, name: string): Promise<void> {
  const label = name === "Abilities" ? "Ability scores" : name === "Gear" ? "Equipment" : name;
  await page
    .locator(".builder-steps")
    .getByRole("button", { name: new RegExp(`^${label}`) })
    .click();
}

async function setBoost(page: Page, section: string, picks: string[]): Promise<void> {
  const card = page.locator(".boost-section").filter({ hasText: section });
  for (let index = 0; index < picks.length; index += 1) {
    await card.locator("select").nth(index).selectOption(picks[index]);
  }
}

async function pickSpell(page: Page, name: string): Promise<void> {
  await page.getByPlaceholder(/Search spells/).fill(name);
  await page
    .locator(".picker-item-name", {
      hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    })
    .first()
    .click();
  await page.getByRole("button", { name: `Learn ${name}` }).click();
}

async function pickFeat(page: Page, slot: string, name: string): Promise<void> {
  const card = page.locator(".feat-slot").filter({ hasText: slot });
  await card.getByRole("button", { name: "Choose" }).click();
  await page.getByPlaceholder(/Search feats/).fill(name);
  await page
    .locator(".picker-item-name", {
      hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    })
    .first()
    .click();
  await page.getByRole("button", { name: `Take ${name}` }).click();
}

async function trainClassSkills(page: Page, skills: string[]): Promise<void> {
  const card = page.locator(".skill-picker").filter({ hasText: "Class skill choices" });
  for (const skill of skills) {
    await card.locator(".skill-choice").filter({ hasText: skill }).click();
  }
}

test("first account becomes the administrator and opens Hall controls", async ({ page }) => {
  await register(page, admin);
  await expect(page.getByRole("heading", { name: "My Campaigns" })).toBeVisible();

  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Hall controls" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit retention" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
});

test("administrator updates audit retention, exports CSV, and filters the log", async ({
  page,
}) => {
  await signIn(page, admin);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Hall controls" })).toBeVisible();
  await expect(page).toHaveTitle("Admin · Runehall");

  await page.getByLabel("Keep entries for (days)").fill("30");
  await page.getByRole("button", { name: "Save retention" }).click();
  await expect(page.getByText("30-day retention")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^runehall-audit-\d{4}-\d{2}-\d{2}\.csv$/);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const csv = fs.readFileSync(downloadPath!, "utf8");
  expect(
    csv.startsWith("id,created_at,actor_id,actor_name,action,target_type,target_id,detail,ip\r\n")
  ).toBe(true);
  expect(csv).toContain(",auth.register,");
  expect(csv).toContain(",admin.audit_retention,");

  await page.getByPlaceholder("Filter action, e.g. auth.login").fill("auth.register");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page.locator(".admin-audit-action")).toHaveText(["auth.register"]);
  await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(
    page.locator(".admin-audit-action").filter({ hasText: "admin.audit_retention" })
  ).toHaveCount(1);
});

test("icon-only navigation keeps accessible names", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await signIn(page, admin);
  for (const name of ["My Campaigns", "Library", "Rules", "Admin"]) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
});

test("GM creates a campaign and builds a character through the lazy routes", async ({ page }) => {
  await signIn(page, admin);
  await page.getByRole("button", { name: "Create campaign", exact: true }).click();

  const campaignDialog = page.getByRole("dialog", { name: "Create a campaign" });
  await expect(campaignDialog).toBeVisible();
  await campaignDialog.getByLabel("Campaign name").fill(campaignName);
  await campaignDialog.getByLabel("Premise").fill("A browser test walks into a tavern.");
  await campaignDialog.getByRole("button", { name: "Open the hall" }).click();

  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);
  campaignPath = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    await page
      .locator(".campaign-tabs")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  const inviteDialog = page.getByRole("dialog", { name: "Invite players" });
  await expect(inviteDialog).toBeVisible();
  inviteCode = await inviteDialog.locator(".invite-code-input").inputValue();
  expect(inviteCode).toMatch(/^[A-Z0-9]{7}$/);
  await page.keyboard.press("Escape");
  await expect(inviteDialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "The First Step" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("link", { name: "All campaigns" }).click();
  await expect(page).toHaveURL(/\/campaigns$/);
  await page.getByRole("button", { name: "New character" }).click();

  const characterDialog = page.getByRole("dialog", { name: "Forge a new hero" });
  await expect(characterDialog).toBeVisible();
  await characterDialog.getByLabel("Character name").fill("E2E Hero");
  await characterDialog.getByLabel("Campaign").selectOption({ label: campaignName });
  await characterDialog.getByRole("button", { name: "Start building" }).click();

  await expect(page).toHaveURL(/\/characters\/[^/]+\/edit$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "E2E Hero" })).toBeVisible({
    timeout: 15_000,
  });
  const builderChecklist = page.locator(".levelup-checklist");
  await expect(builderChecklist.getByText(/required choices? remaining/)).toBeVisible();
  await builderChecklist.getByRole("button", { name: /Show details/ }).click();
  await expect(builderChecklist.getByText("Choose an ancestry.")).toBeVisible();

  await page
    .locator(".builder-steps")
    .getByRole("button", { name: /^Ancestry/ })
    .click();
  await page.locator(".ancestry-grid .selection-card").filter({ hasText: "Human" }).first().click();
  await page
    .locator(".builder-steps")
    .getByRole("button", { name: /^Heritage/ })
    .click();
  await page
    .locator(".selection-grid .selection-card")
    .filter({ hasText: "Skilled Human" })
    .click();
  await page
    .locator(".builder-steps")
    .getByRole("button", { name: /^Skills/ })
    .click();
  const heritageTraining = page
    .locator(".skill-picker")
    .filter({ hasText: "Skilled Human training" });
  await heritageTraining.getByRole("combobox").selectOption("stealth");
  await expect(page.locator(".skill-fixed").getByText("Stealth · Trained")).toBeVisible();

  await page
    .locator(".builder-steps")
    .getByRole("button", { name: /^Class/ })
    .click();
  await page.locator(".class-grid").getByRole("button", { name: /Druid/ }).click();
  await page
    .locator(".choice-options")
    .getByRole("button", { name: /Animal Order/ })
    .click();
  await expect(page.getByText("Animal Companion").first()).toBeVisible();
  await page
    .locator(".builder-steps")
    .getByRole("button", { name: /^Feats/ })
    .click();
  await expect(page.locator(".granted-feats").getByText("Animal Companion")).toBeVisible();
  await page
    .locator(".builder-steps")
    .getByRole("button", { name: /^Spells/ })
    .click();
  await expect(
    page.locator(".spell-section").filter({ hasText: "Granted spells" }).getByText("Heal Animal")
  ).toBeVisible();
  const focusCard = page
    .locator(".spell-section")
    .filter({ has: page.getByRole("heading", { name: "Focus spells" }) });
  await expect(focusCard.getByText("Heal Animal")).toBeVisible();
  await expect(focusCard.getByText("Granted", { exact: true })).toBeVisible();
  await expect(focusCard.getByRole("button", { name: "Remove Heal Animal" })).toHaveCount(0);

  await page
    .locator(".builder-steps")
    .getByRole("button", { name: /^Equipment/ })
    .click();
  await expect(page.getByText("Starting wealth", { exact: true })).toBeVisible();
  const takeCoins = page.getByRole("button", { name: /Take .* as coins/ });
  await expect(takeCoins).toBeVisible();
  await takeCoins.click();
  await expect(page.getByRole("button", { name: /Take .* as coins/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Open character sheet" }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "E2E Hero" })).toBeVisible();
  await expect(page.getByText("Initiative").first()).toBeVisible();

  const focusPip = page.locator(".point-pip.focus").first();
  await expect(focusPip).toHaveAttribute("aria-pressed", "true");
  const healAnimalRow = page.locator(".sheet-spell-row").filter({ hasText: "Heal Animal" });
  await healAnimalRow.getByRole("button", { name: "Cast Heal Animal" }).click();
  const healAnimalDialog = page.getByRole("dialog", { name: "Cast Heal Animal" });
  await expect(healAnimalDialog.getByText(/1 focus point/)).toBeVisible();
  await healAnimalDialog.getByRole("button", { name: "Cast spell" }).click();
  await expect(focusPip).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Refocus" }).click();
  await expect(focusPip).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Long rest" }).click();
  const restDialog = page.getByRole("dialog", { name: "Take a long rest" });
  await expect(restDialog).toBeVisible();
  await expect(restDialog.getByText("Hit Points")).toBeVisible();
  await restDialog.getByRole("button", { name: "Take long rest" }).click();
  await expect(restDialog).toBeHidden();
  await expect(page.getByText(/Long rest complete/)).toBeVisible();
});

test("GM controls advancement and milestone mode hides XP awards", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(campaignPath);
  await page
    .locator(".campaign-tabs")
    .getByRole("button", { name: /^Party/ })
    .click();
  await expect(page.getByRole("heading", { name: "Who's at the table?" })).toBeVisible();
  await expect(page.getByText(/The GM controls advancement/)).toBeVisible();
  await expect(page.getByText("Needs choices").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Award XP" })).toHaveCount(0);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Level up", exact: true }).first().click();
  await expect(page.getByText(/Advanced E2E Hero to level 2/)).toBeVisible({ timeout: 15_000 });

  await page
    .locator(".campaign-tabs")
    .getByRole("button", { name: /^Overview/ })
    .click();
  await expect(page.getByText("1 Abadius, 4726 AR", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "+1 day" }).click();
  await expect(page.getByText("2 Abadius, 4726 AR", { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await page
    .locator(".campaign-tabs")
    .getByRole("button", { name: /^Party/ })
    .click();
  await openPartyActions(page);
  await page.getByRole("menuitem", { name: "Grant downtime" }).click();
  const downtimeDialog = page.getByRole("dialog", { name: "Grant downtime" });
  await expect(downtimeDialog).toBeVisible();
  await downtimeDialog.getByLabel("Downtime days").fill("3");
  await downtimeDialog.getByRole("button", { name: "Grant downtime" }).click();
  await expect(page.getByText(/Granted 3 downtime days/)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".party-stats").getByText("3 d")).toBeVisible();

  await page.locator(".party-card").first().getByRole("link", { name: "Sheet" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Hero");
  await page.getByRole("combobox", { name: "Cost of living" }).selectOption("comfortable");
  await expect(page.getByText("1 sp 5 cp/day")).toBeVisible();
  await page.getByRole("button", { name: "Spend", exact: true }).click();
  await expect(
    page.getByText(/Spent 1 downtime day and 1 sp 5 cp on comfortable living/)
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".point-row").filter({ hasText: "Downtime" })).toContainText("2 days");

  await page.getByRole("button", { name: "Activities", exact: true }).click();
  const downtimeActivities = page.getByRole("dialog", { name: "Downtime activities" });
  await expect(downtimeActivities).toBeVisible();
  await downtimeActivities
    .getByRole("combobox", { name: "Downtime activity" })
    .selectOption("craft");
  await downtimeActivities.getByLabel("Project").fill("E2E downtime project");
  await downtimeActivities.getByLabel("Days required").fill("2");
  await downtimeActivities.getByRole("button", { name: "Spend a day", exact: true }).click();
  await expect(downtimeActivities.getByText("1 of 2 days")).toBeVisible({ timeout: 15_000 });
  await downtimeActivities
    .locator(".downtime-activity")
    .getByRole("button", { name: "Spend a day", exact: true })
    .click();
  await expect(page.getByText(/E2E downtime project complete after 2 days/)).toBeVisible({
    timeout: 15_000,
  });
  await downtimeActivities.locator(".modal-foot").getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".point-row").filter({ hasText: "Downtime" })).toContainText("0 days");
});

test("Party actions menu supports keyboard navigation and restores focus", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=party`);
  await expect(
    page
      .locator(".party-card")
      .first()
      .locator(".stat")
      .filter({ hasText: "HP" })
      .locator(".stat-value")
  ).toContainText("/");

  const trigger = page.getByRole("button", { name: /Party actions/ });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const menu = page.getByRole("menu", { name: "Party actions" });
  await expect(menu).toBeVisible();
  const longRest = menu.getByRole("menuitem", { name: "Long rest party" });
  await expect(longRest).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Level up party" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "Grant downtime" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(longRest).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "New character" })).toBeFocused();
});

test("GM awards XP in XP tracking mode without automatic level-up", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=settings`);
  await page
    .getByRole("combobox", { name: /^Advancement Default/ })
    .selectOption({ label: "XP tracking (GM levels up)" });
  await page
    .getByRole("combobox", { name: /^Advancement speed/ })
    .selectOption({ label: "Fast (800 XP per level)" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Campaign settings saved.")).toBeVisible();

  await page
    .locator(".campaign-tabs")
    .getByRole("button", { name: /^Party/ })
    .click();
  await page.getByRole("button", { name: "Award XP", exact: true }).click();
  const xpDialog = page.getByRole("dialog", { name: "Award XP" });
  await expect(xpDialog).toBeVisible();
  await xpDialog.getByLabel("XP amount").fill("800");
  await xpDialog.getByRole("button", { name: "Award XP", exact: true }).click();

  await expect(page.getByText(/Awarded 800 XP/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Ready to level")).toBeVisible();
  await expect(page.getByText(/Level 2/).first()).toBeVisible();
  await expect(page.locator(".xp-ledger").getByText("Recent awards")).toBeVisible();
  await expect(page.locator(".xp-ledger").getByText("800 XP")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await openPartyActions(page);
  await page.getByRole("menuitem", { name: "Catch up party" }).click();
  await expect(page.getByText("The whole party is already caught up.")).toBeVisible({
    timeout: 15_000,
  });
});

test("GM awards Hero Points and resets them for a new session", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=party`);
  await expect(page.getByRole("heading", { name: "Who's at the table?" })).toBeVisible();
  await expect(page.locator(".party-stats").getByText("1 / 3")).toBeVisible();

  await page.getByRole("button", { name: "Hero Points", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hero Points" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("E2E Hero (1 / 3)")).toBeVisible();
  await dialog.getByRole("button", { name: "Award Hero Points" }).click();
  await expect(page.getByText(/Awarded 1 Hero Point to 1 character/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".party-stats").getByText("2 / 3")).toBeVisible();

  await page.getByRole("button", { name: "Hero Points", exact: true }).click();
  page.once("dialog", (confirm) => confirm.accept());
  await dialog.getByRole("button", { name: "Start new session (reset to 1)" }).click();
  await expect(page.getByText(/New session: reset 1 character to 1 Hero Point/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".party-stats").getByText("1 / 3")).toBeVisible();
});

test("loot audit and replacement wealth top-up are available", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=loot`);
  await expect(page.getByRole("heading", { name: /Level \d+ hoard/ })).toBeVisible();
  await expect(page.getByText("Character wealth")).toBeVisible();
  await expect(page.getByText("Item mix")).toBeVisible();
  await expect(page.getByText(/permanent/).first()).toBeVisible();
  await expect(page.getByText("Open parcels")).toBeVisible();
  await expect(page.getByText("Level budget")).toBeVisible();

  await page.getByRole("button", { name: "New parcel" }).click();
  await expect(page.getByLabel("Parcel level")).toHaveValue(/\d+/);
  await page.getByLabel("Parcel level").fill("5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.locator(".treasure-level-coverage").getByText("Level 5", { exact: true })
  ).toBeVisible({ timeout: 15_000 });

  await page
    .locator(".campaign-tabs")
    .getByRole("button", { name: /^Party/ })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Top up wealth" }).first().click();
  await expect(
    page.getByText(/Granted .* to E2E Hero|already meets the level \d+ wealth benchmark/)
  ).toBeVisible({ timeout: 15_000 });
});

test("character sheet shop buys and sells common gear", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=party`);
  await page.locator(".party-card").first().getByRole("link", { name: "Sheet" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Hero");

  await page.getByRole("button", { name: "Shop", exact: true }).click();
  const shop = page.getByRole("dialog", { name: "Settlement shop" });
  await expect(shop).toBeVisible();
  await shop.getByPlaceholder("Search common items…").fill("Dagger");
  const daggerRow = shop.locator(".shop-row").filter({ hasText: "Dagger" }).first();
  await expect(daggerRow).toBeVisible();
  await daggerRow.getByRole("button", { name: "Buy", exact: true }).click();
  await expect(page.getByText(/Bought 1× Dagger/)).toBeVisible({ timeout: 15_000 });

  await shop.getByRole("button", { name: "Sell", exact: true }).click();
  const sellRow = shop.locator(".shop-row").filter({ hasText: "Dagger" }).first();
  await expect(sellRow).toBeVisible();
  await sellRow.getByRole("button", { name: "Sell", exact: true }).click();
  await expect(page.getByText(/Sold 1× Dagger/)).toBeVisible({ timeout: 15_000 });

  await shop.locator(".shop-tabs").getByRole("button", { name: "Stock", exact: true }).click();
  await shop.getByRole("combobox", { name: "Shop mode" }).selectOption("stocked");
  await shop.getByPlaceholder("Search the compendium to stock…").fill("Dagger");
  const stockSearchRow = shop.locator(".shop-row").filter({ hasText: "Dagger" }).first();
  await expect(stockSearchRow.getByRole("button", { name: "Add", exact: true })).toBeVisible();
  await stockSearchRow.getByRole("button", { name: "Add", exact: true }).click();
  await expect(shop.getByLabel("Dagger stock")).toHaveValue("1");
  await shop.getByRole("button", { name: "Save merchant stock" }).click();
  await expect(page.getByText(/Merchant stock saved: 1 item row/)).toBeVisible({
    timeout: 15_000,
  });

  await shop.locator(".shop-tabs").getByRole("button", { name: "Buy", exact: true }).click();
  await expect(shop.getByText(/1 in stock/)).toBeVisible();
  const stockRow = shop.locator(".shop-row").filter({ hasText: "Dagger" }).first();
  await stockRow.getByRole("button", { name: "Buy", exact: true }).click();
  await expect(page.getByText(/Bought 1× Dagger/)).toBeVisible({ timeout: 15_000 });

  await shop.locator(".shop-tabs").getByRole("button", { name: "Stock", exact: true }).click();
  await shop.getByLabel("Dagger stock").fill("0");
  await shop.getByRole("button", { name: "Save merchant stock" }).click();
  await expect(page.getByText(/Merchant stock saved: 1 item row/)).toBeVisible({
    timeout: 15_000,
  });
  await shop.locator(".shop-tabs").getByRole("button", { name: "Buy", exact: true }).click();
  await expect(shop.getByText(/out of stock/)).toBeVisible();
  await expect(
    shop.locator(".shop-row").filter({ hasText: "Dagger" }).first().getByRole("button", {
      name: "Out",
      exact: true,
    })
  ).toBeDisabled();

  await shop.locator(".shop-tabs").getByRole("button", { name: "Stock", exact: true }).click();
  await shop.getByRole("combobox", { name: "Shop mode" }).selectOption("open");
  await shop.getByRole("button", { name: "Save merchant stock" }).click();
  await expect(page.getByText("Shop changed to an open market.")).toBeVisible({
    timeout: 15_000,
  });

  page.once("dialog", (dialog) => dialog.accept("5"));
  await shop.getByRole("button", { name: "Restock", exact: true }).click();
  await expect(page.getByText(/Restocked .* to 5\./)).toBeVisible({ timeout: 15_000 });

  page.once("dialog", (dialog) => dialog.accept("E2E Traveling Trader"));
  await shop.getByRole("button", { name: "New merchant", exact: true }).click();
  await expect(page.getByText(/Merchant “E2E Traveling Trader” added\./)).toBeVisible({
    timeout: 15_000,
  });
  await shop.getByLabel("Active merchant").selectOption({
    label: "E2E Traveling Trader (open)",
  });
  await expect(page.getByText("Now shopping at E2E Traveling Trader.")).toBeVisible({
    timeout: 15_000,
  });
});

test("GM plans a journey and advances a travel day", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(campaignPath);
  await page.locator(".campaign-tabs").getByRole("button", { name: "Prep", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Travel/ }).click();
  await expect(page.getByRole("heading", { name: "Travel & watches" })).toBeVisible();

  await page.getByLabel("Origin", { exact: true }).fill("E2E Start");
  await page.getByLabel("Destination").fill("E2E End");
  await page.getByLabel("Distance (miles)").fill("20");
  await page.getByLabel("Party speed").fill("25");
  await page.getByRole("checkbox", { name: "E2E Hero First watch" }).check();
  await page.getByRole("combobox", { name: "E2E Hero exploration activity" }).selectOption("scout");
  await page.getByRole("button", { name: "Save journey" }).click();
  await expect(page.getByText("Journey saved.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/0 of 20 miles/)).toBeVisible();
  await expect(
    page.locator(".travel-player-grid").getByText("E2E Hero", { exact: true }).first()
  ).toBeVisible();
  await expect(
    page.locator(".travel-player-grid").getByText("Scout", { exact: true })
  ).toBeVisible();
  const travelDateBefore = await page
    .locator(".travel-page")
    .getByText(/Abadius, 4726 AR/)
    .first()
    .innerText();
  const travelDayBefore = Number(travelDateBefore.split(" ")[0]);
  expect(travelDayBefore).toBeGreaterThan(0);

  await page.getByLabel("Waypoint name").fill("E2E Broken Bridge");
  await page.getByLabel("Miles from origin").fill("10");
  await page.getByLabel("Waypoint notes").fill("A rope bridge over the gorge.");
  await page.getByRole("checkbox", { name: "Share this waypoint with players" }).check();
  await page.getByRole("button", { name: "Add waypoint" }).click();
  await expect(page.getByText("Waypoint added to the route.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("E2E Broken Bridge").first()).toBeVisible();

  await page.getByRole("button", { name: "Check for encounter" }).click();
  await expect(page.getByText(/Encounter!|No encounter:/)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".travel-check").getByText(/d20 \d+ vs \d+\+/)).toBeVisible();

  await page.getByRole("button", { name: "Advance day" }).click();
  await expect(page.getByText(/The party arrives after 1 day/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/20 of 20 miles/)).toBeVisible();
  await expect(page.getByText("Arrived", { exact: true })).toBeVisible();
  await expect(page.locator(".travel-map-card").getByText("E2E Broken Bridge")).toBeVisible();
  await expect(page.locator(".travel-map-card").getByText("Reached")).toBeVisible();
  await expect(
    page
      .locator(".travel-page")
      .getByText(`${travelDayBefore + 1} Abadius, 4726 AR`, { exact: true })
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear journey" }).click();
  await expect(page.getByText("Journey cleared.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Plan a journey" })).toBeVisible();
});

test("GM writes the session zero charter and checklist", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(campaignPath);
  await page.locator(".campaign-tabs").getByRole("button", { name: "Prep", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Session zero/ }).click();
  await expect(page.getByRole("heading", { name: "Session zero & safety" })).toBeVisible();

  await page.getByLabel("Campaign pitch", { exact: true }).fill("A city of ash and old debts.");
  await page.getByLabel("Genre", { exact: true }).fill("Dark fantasy");
  await page.getByLabel("Tone", { exact: true }).fill("Heroic with sharp edges");
  await page
    .getByLabel("Expectations", { exact: true })
    .fill("Share the spotlight and flag rules questions.");
  await page.getByLabel("House rules", { exact: true }).fill("Free archetype.");
  await page.getByLabel("Content limits", { exact: true }).fill("No graphic torture.");
  await page
    .getByLabel("Safety tools", { exact: true })
    .fill("Use the pause signal or message the GM privately.");
  await page
    .getByLabel("Allowed sources", { exact: true })
    .fill("Player Core, GM Core, Monster Core.");
  await page
    .getByLabel("Party goal", { exact: true })
    .fill("Break the Ashen Crown before it wakes.");
  await page.getByLabel("Party hooks", { exact: true }).fill("The ferryman owes the party a debt.");
  const editor = page.locator(".session-zero-editor");
  await editor
    .getByRole("checkbox", { name: "Share the campaign pitch, genre, and tone." })
    .check();
  await editor
    .getByRole("checkbox", { name: "Agree on themes, expectations, and house rules." })
    .check();
  await editor
    .getByRole("checkbox", { name: "Agree on allowed sources, supplements, and optional rules." })
    .check();
  await editor
    .getByRole("checkbox", { name: "Connect every character to the party goal and to each other." })
    .check();
  await page.getByRole("button", { name: "Save session zero" }).click();
  await expect(page.getByText("Session zero charter saved.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Preview player-facing charter" }).click();
  await expect(
    page.locator(".session-zero-charter").getByText("A city of ash and old debts.")
  ).toBeVisible();
  await expect(page.getByText("4/9 checklist")).toBeVisible();
});

test("GM schedules from Sessions and overdue sessions stay current", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=sessions`);
  await expect(page.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Schedule session" }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule a session" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title").fill("E2E Overdue Session");
  await dialog.getByLabel("Date and time").fill("2020-01-05T19:00");
  await dialog.getByLabel("Repeat").selectOption("weekly");
  await dialog.getByRole("button", { name: "Schedule session" }).click();
  await expect(page.getByText("Session scheduled.")).toBeVisible();

  const card = page.locator(".session-card").filter({ hasText: "E2E Overdue Session" });
  await expect(card.getByText("Overdue", { exact: true })).toBeVisible();
  await expect(card.getByText("Weekly", { exact: true })).toBeVisible();
  await expect(card.getByText("Check-in", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Mark played" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Calendar (.ics)" }).click();
  const calendar = await downloadPromise;
  expect(calendar.suggestedFilename()).toBe("runehall-sessions.ics");

  await card.getByRole("button", { name: "Mark played" }).click();
  await expect(page.getByText("Session marked played. Next session scheduled.")).toBeVisible();
  await expect(
    page.locator(".session-card").filter({ hasText: "E2E Overdue Session" })
  ).toHaveCount(2);

  await page
    .locator(".campaign-tabs")
    .getByRole("button", { name: /^Overview/ })
    .click();
  const nextCard = page.locator(".dashboard-next");
  await expect(nextCard.getByRole("heading", { level: 3 })).not.toHaveText("Not scheduled");
  await expect(nextCard.getByRole("button", { name: "Schedule in Sessions" })).toBeVisible();
  await expect(nextCard.locator('input[type="datetime-local"]')).toHaveCount(0);
});

test("GM downloads a self-contained campaign archive", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=settings`);
  await expect(page.getByRole("heading", { name: "Campaign archive" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export with files" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.runehall\.self-contained\.json$/);
  await expect(page.getByText("Self-contained campaign archive exported.")).toBeVisible();
});

test("GM outlines the adventure arc with chapters", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=arc`);
  await expect(page.getByRole("heading", { name: "Adventure arc" })).toBeVisible();

  await page.getByRole("button", { name: "Add chapter" }).click();
  const firstDialog = page.getByRole("dialog", { name: "New chapter" });
  await expect(firstDialog).toBeVisible();
  await firstDialog.getByLabel("Chapter title").fill("E2E The Ashen Crown");
  await firstDialog.getByLabel("Starting level").fill("1");
  await firstDialog.getByLabel("Ending level").fill("4");
  await firstDialog.getByLabel("Status").selectOption("active");
  await firstDialog.getByLabel("Chapter summary").fill("The party learns the crown is waking.");
  await firstDialog.getByRole("button", { name: "Add chapter" }).click();
  await expect(page.getByText("Chapter added.")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".arc-active-card").getByText("E2E The Ashen Crown")).toBeVisible();
  await expect(page.locator(".arc-active-card").getByText("Levels 1–4")).toBeVisible();

  await page.getByRole("button", { name: "Add chapter" }).click();
  const secondDialog = page.getByRole("dialog", { name: "New chapter" });
  await secondDialog.getByLabel("Chapter title").fill("E2E Beneath the City");
  await secondDialog.getByLabel("Starting level").fill("5");
  await secondDialog.getByLabel("Ending level").fill("8");
  await secondDialog.getByRole("button", { name: "Add chapter" }).click();
  await expect(page.getByText("Chapter added.").last()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Make active" }).click();
  await expect(page.getByText(/“E2E Beneath the City” is now the active chapter/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".arc-active-card").getByText("E2E Beneath the City")).toBeVisible();
});

test("lazy library, compendium entry, rules, and account routes load", async ({ page }) => {
  await signIn(page, admin);
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

  await page.getByRole("tab", { name: "Spells" }).click();
  await page.getByPlaceholder(/Search spells/).fill("Fireball");
  const spellRow = page.getByRole("button", { name: /Fireball/ }).first();
  await expect(spellRow).toBeVisible();
  await spellRow.click();
  await expect(page).toHaveURL(/entry=/);
  await page.getByRole("link", { name: "Open full page" }).click();
  await expect(page).toHaveURL(/\/library\/spell\//);
  await expect(page.getByRole("heading", { name: "Fireball", level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Back to the library" }).click();
  await expect(page).toHaveURL(/tab=spells/);
  await expect(page).toHaveURL(/q=Fireball/);
  await expect(page.getByRole("tab", { name: "Spells" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByPlaceholder(/Search spells/)).toHaveValue("Fireball");
  await expect(page.getByRole("heading", { name: "Fireball", level: 2 })).toBeVisible();

  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "Rules at the table" })).toBeVisible();
  await page.getByRole("tab", { name: "Actions" }).click();
  await expect(page).toHaveURL(/tab=actions/);
  await page.getByRole("button", { name: /^Aid/ }).click();
  await expect(page.getByRole("heading", { name: "Aid", level: 2 })).toBeVisible();
  await page.getByRole("textbox", { name: "Search actions" }).fill("Stride");
  await expect(page).toHaveURL(/[?&]q=Stride/);
  await expect(page.getByRole("heading", { name: "Stride", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aid", level: 2 })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search input" }).click();
  await expect(page.getByRole("textbox", { name: "Search actions" })).toHaveValue("");
  await expect(page).not.toHaveURL(/[?&]q=/);

  await page.goto("/rules?tab=conditions&q=Blinded");
  await expect(page.getByRole("tab", { name: "Conditions" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.getByRole("textbox", { name: "Search conditions" })).toHaveValue("Blinded");
  await expect(page.getByRole("heading", { name: "Blinded", level: 2 })).toBeVisible();

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account and security" })).toBeVisible();
  await expect(page).toHaveTitle("Account · Runehall");
});

test("Library search keeps fast typing in sync with the URL", async ({ page }) => {
  await signIn(page, admin);
  await page.goto("/library?tab=spells");

  const search = page.getByPlaceholder(/Search spells/);
  await search.pressSequentially("Magic Missile", { delay: 5 });
  await expect(search).toHaveValue("Magic Missile");
  await expect(page).toHaveURL(/[?&]q=Magic/);

  await search.fill("");
  await expect(search).toHaveValue("");
  await expect(page).not.toHaveURL(/[?&]q=/);
});

test("Library clear search resets the local input and URL", async ({ page }) => {
  await signIn(page, admin);
  await page.goto("/library?tab=spells&q=NoSuchSpell");

  const search = page.getByPlaceholder(/Search spells/);
  await expect(search).toHaveValue("NoSuchSpell");
  await page.getByRole("button", { name: "Clear search input" }).click();
  await expect(search).toHaveValue("");
  await expect(page).not.toHaveURL(/[?&]q=/);
});

test("GM publishes a faction and a player-safe NPC to People", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=npcs`);
  await expect(page.getByRole("heading", { name: "NPCs & hazards", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New faction" }).click();
  const factionDialog = page.getByRole("dialog", { name: "New faction" });
  await expect(factionDialog).toBeVisible();
  await factionDialog.getByLabel("Name").fill("E2E Harbor Guild");
  await factionDialog.getByLabel("Public description").fill("Masters of the E2E docks.");
  await factionDialog.getByLabel("Goals").fill("Keep the harbor open.");
  await factionDialog.getByLabel("Reputation (-100 to 100)").fill("40");
  await factionDialog
    .getByRole("checkbox", { name: "Show this faction on the shared People tab" })
    .check();
  await factionDialog.getByLabel("GM notes").fill("E2E secret guild vault.");
  await factionDialog.getByRole("button", { name: "Create faction" }).click();
  await expect(page.getByText("Faction created.")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "New NPC" }).click();
  const npcDialog = page.getByRole("dialog", { name: "New NPC" });
  await expect(npcDialog).toBeVisible();
  await npcDialog.getByLabel("Name").fill("E2E Ferryman");
  await npcDialog.getByLabel("Role or title").fill("Harbor master");
  await npcDialog.getByLabel("Location").fill("The Salt Dock");
  await npcDialog.getByLabel("Faction").selectOption({ label: "E2E Harbor Guild" });
  await npcDialog.getByLabel("Attitude").selectOption("friendly");
  await npcDialog.getByRole("checkbox", { name: "Show this NPC on the shared People tab" }).check();
  await npcDialog.getByLabel("Public description").fill("A ferryman who knows every tide.");
  await npcDialog.getByLabel("GM secrets").fill("E2E secret doppelganger.");
  await npcDialog.getByRole("button", { name: "Create NPC" }).click();
  await expect(page.getByText("NPC created.")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "New hazard" }).click();
  const hazardDialog = page.getByRole("dialog", { name: "New hazard" });
  await expect(hazardDialog).toBeVisible();
  await hazardDialog.getByLabel("Name").fill("E2E Crushing Ceiling");
  await hazardDialog.getByLabel("Complexity").selectOption("simple");
  await hazardDialog.getByLabel("Trigger").fill("A creature enters the flooded hall.");
  await hazardDialog.getByLabel("Disable").fill("Thievery DC 20 to jam the winch.");
  await hazardDialog.getByLabel("Routine").fill("The ceiling lowers five feet each round.");
  await expect(
    hazardDialog.getByRole("checkbox", { name: /Show this hazard on the shared People tab/ })
  ).toHaveCount(0);
  await hazardDialog.getByRole("button", { name: "Create hazard" }).click();
  await expect(page.getByText("Hazard created.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("E2E Crushing Ceiling")).toBeVisible();

  await page.goto(`${campaignPath}?tab=people`);
  await expect(page.getByRole("heading", { name: "People & factions" })).toBeVisible();
  await expect(page.getByText("E2E Harbor Guild")).toBeVisible();
  await expect(page.getByText("E2E Ferryman")).toBeVisible();
  await expect(page.getByText("A ferryman who knows every tide.")).toBeVisible();
  await expect(page.getByText("E2E secret doppelganger.")).toHaveCount(0);
  await expect(page.getByText("E2E secret guild vault.")).toHaveCount(0);
  await expect(page.getByText("E2E Crushing Ceiling")).toHaveCount(0);
});

test("GM shares campaign knowledge and keeps hidden lore GM-only", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=notes`);
  await expect(page.getByRole("heading", { name: "Notes & knowledge" })).toBeVisible();

  await page.getByRole("button", { name: "Add knowledge" }).click();
  const sharedDialog = page.getByRole("dialog", { name: "New knowledge" });
  await expect(sharedDialog).toBeVisible();
  await sharedDialog.getByLabel("Title").fill("E2E Sunken Gate");
  await sharedDialog
    .getByPlaceholder("What the party has learned.")
    .fill("# The Sunken Gate\nThe gate opens at low tide.");
  await sharedDialog.getByRole("checkbox", { name: "Show this knowledge to players" }).check();
  await sharedDialog.getByRole("button", { name: "Create entry" }).click();
  await expect(page.getByText("Knowledge entry created.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("E2E Sunken Gate")).toBeVisible();
  await expect(page.locator(".notes-knowledge .tag").filter({ hasText: "Shared" })).toBeVisible();

  await page.getByRole("button", { name: "Add knowledge" }).click();
  const hiddenDialog = page.getByRole("dialog", { name: "New knowledge" });
  await hiddenDialog.getByLabel("Title").fill("E2E Hidden Traitor");
  await hiddenDialog
    .getByPlaceholder("What the party has learned.")
    .fill("The harbor master serves the Ashen Court.");
  await hiddenDialog.getByRole("button", { name: "Create entry" }).click();
  await expect(page.getByText("Knowledge entry created.").last()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("E2E Hidden Traitor")).toBeVisible();
  await expect(page.locator(".notes-knowledge .tag").filter({ hasText: "Hidden" })).toBeVisible();
});

test("player registers, joins with the invite code, and sees a player-safe table", async ({
  page,
  browser,
}) => {
  await register(page, player);
  await page.getByRole("button", { name: "Join campaign", exact: true }).click();

  const joinDialog = page.getByRole("dialog", { name: "Join a campaign" });
  await expect(joinDialog).toBeVisible();
  await joinDialog.getByLabel("Invite code or link").fill(inviteCode);
  await joinDialog.getByRole("button", { name: "Join the table" }).click();

  await expect(page).toHaveURL(
    new RegExp(`${campaignPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  );
  await expect(page.getByText("Player's table")).toBeVisible();
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
  for (const gmTab of ["Encounters", "Loot", "NPCs", "Assets", "GM Screen"]) {
    await expect(page.getByRole("button", { name: gmTab })).toHaveCount(0);
  }

  await page.goto(`${campaignPath}?tab=people`);
  await expect(page.getByRole("heading", { name: "People & factions" })).toBeVisible();
  await expect(page.getByText("E2E Harbor Guild")).toBeVisible();
  await expect(page.getByText("E2E Ferryman")).toBeVisible();
  await expect(page.getByText("A ferryman who knows every tide.")).toBeVisible();
  await expect(page.getByText("E2E secret doppelganger.")).toHaveCount(0);
  await expect(page.getByText("E2E secret guild vault.")).toHaveCount(0);

  await page.goto(`${campaignPath}?tab=notes`);
  await expect(page.getByRole("heading", { name: "Notes & knowledge" })).toBeVisible();
  await expect(page.getByText("E2E Sunken Gate")).toBeVisible();
  await expect(page.getByText("The gate opens at low tide.")).toBeVisible();
  await expect(page.getByText("E2E Hidden Traitor")).toHaveCount(0);
  await expect(page.getByText("The harbor master serves the Ashen Court.")).toHaveCount(0);

  await page.getByRole("button", { name: "New note" }).click();
  const noteDialog = page.getByRole("dialog", { name: "New private note" });
  await expect(noteDialog).toBeVisible();
  await noteDialog.getByLabel("Note title").fill("E2E private suspicion");
  await noteDialog.getByPlaceholder("What do you want to remember?").fill("The ferryman is lying.");
  await noteDialog.getByRole("button", { name: "Create note" }).click();
  await expect(page.getByText("Private note saved.")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator(".notes-private").getByText("E2E private suspicion", { exact: true })
  ).toBeVisible();

  await page.goto(`${campaignPath}?tab=arc`);
  await expect(page.getByRole("heading", { name: "Adventure arc" })).toBeVisible();
  await expect(page.locator(".arc-active-card").getByText("E2E Beneath the City")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add chapter" })).toHaveCount(0);

  await page.goto(`${campaignPath}?tab=settings`);
  await expect(page.getByLabel("Free Archetype variant")).toBeDisabled();
  await expect(page.getByLabel("Automatic Bonus Progression")).toBeDisabled();
  const forbiddenVariant = await page.request.patch(
    `/api/campaigns/${campaignPath.split("/").pop()}`,
    { data: { freeArchetype: true, automaticBonusProgression: true } }
  );
  expect(forbiddenVariant.status()).toBe(403);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, admin);
  await adminPage.goto(`${campaignPath}?tab=settings`);
  await expect(adminPage.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(
    adminPage.locator(".member-list").getByText(player.displayName).first()
  ).toBeVisible();

  // The in-world date must reach a player who is already looking at Overview.
  await page.goto(`${campaignPath}?tab=overview`);
  const playerDate = page.locator(".dashboard-calendar h3");
  await expect(playerDate).toBeVisible({ timeout: 15_000 });
  const beforeDate = (await playerDate.textContent())?.trim();
  await adminPage.goto(`${campaignPath}?tab=overview`);
  const adminDate = adminPage.locator(".dashboard-calendar h3");
  await expect(adminDate).toBeVisible({ timeout: 15_000 });
  await adminPage.getByRole("button", { name: "+1 day" }).click();
  await expect(adminDate).not.toHaveText(beforeDate ?? "", { timeout: 15_000 });
  const afterDate = (await adminDate.textContent())?.trim();
  await expect(playerDate).toHaveText(afterDate ?? "", { timeout: 15_000 });

  // A session scheduled by the GM appears for a player already on the page.
  await page.goto(`${campaignPath}?tab=sessions`);
  await expect(page.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();
  await adminPage.goto(`${campaignPath}?tab=sessions`);
  await adminPage.getByRole("button", { name: "Schedule session" }).click();
  const liveDialog = adminPage.getByRole("dialog", { name: "Schedule a session" });
  await expect(liveDialog).toBeVisible();
  await liveDialog.getByLabel("Title").fill("E2E Live Session");
  await liveDialog.getByLabel("Date and time").fill("2031-06-14T18:30");
  await liveDialog.getByRole("button", { name: "Schedule session" }).click();
  await expect(page.getByText("E2E Live Session")).toBeVisible({ timeout: 15_000 });

  await page.goto(`${campaignPath}?tab=session-zero`);
  await expect(page.getByRole("heading", { name: "Session zero & safety" })).toBeVisible();
  await expect(
    page.locator(".session-zero-charter").getByText("A city of ash and old debts.")
  ).toBeVisible();
  await page.getByLabel("Lines I do not want").fill("Spiders");
  await page.getByLabel("Veils (fade to black)").fill("Torture");
  await page.getByRole("checkbox", { name: "Hide my name from the GM's response list" }).check();
  await page.getByRole("button", { name: "Save my limits" }).click();
  await expect(page.getByText("Your safety preference was saved privately.")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("Optional note").fill("Need a pause.");
  await page.getByRole("button", { name: "Pause / X-card" }).click();
  await expect(page.getByText("The GM has been signalled. Take the pause you need.")).toBeVisible({
    timeout: 15_000,
  });

  await adminPage.goto(`${campaignPath}?tab=session-zero`);
  await expect(adminPage.getByText("Anonymous player")).toBeVisible({ timeout: 15_000 });
  await expect(adminPage.getByText("Spiders")).toBeVisible();

  await adminContext.close();
});

test("GM can read hidden lore but never a player's private notes", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=notes`);
  await expect(page.getByRole("heading", { name: "Notes & knowledge" })).toBeVisible();
  await expect(page.getByText("E2E Sunken Gate")).toBeVisible();
  await expect(page.getByText("E2E Hidden Traitor")).toBeVisible();
  await expect(page.getByText("E2E private suspicion")).toHaveCount(0);
  await expect(page.getByText("The ferryman is lying.")).toHaveCount(0);
  await expect(page.locator(".notes-private").getByText("No private notes yet")).toBeVisible();

  await page.goto(`${campaignPath}?tab=journal`);
  await expect(page.getByText(/Private notes and shared lore are in Notes & lore/)).toBeVisible();
  await page.getByRole("button", { name: "Notes & lore" }).click();
  await expect(page.getByRole("heading", { name: "Notes & knowledge" })).toBeVisible();
  await expect(
    page.getByText(/Session recaps, handouts, and quests live in Journal/)
  ).toBeVisible();
});

test("player imports a Pathbuilder character and joins after GM approval", async ({
  page,
  browser,
}) => {
  await register(page, importer);
  await page.goto(`/join/${inviteCode}`);
  await expect(page.getByRole("heading", { name: "How are you joining?" })).toBeVisible();

  await page.getByRole("button", { name: /Import from Pathbuilder/ }).click();
  await page
    .getByLabel("Pathbuilder JSON file")
    .setInputFiles("tests/e2e/fixtures/pathbuilder.json");
  const requestButton = page.getByRole("button", { name: "Request GM approval" });
  await expect(requestButton).toBeEnabled();
  await requestButton.click();
  await expect(
    page.getByRole("heading", { name: "Pathbuilder E2E Hero is waiting for approval." })
  ).toBeVisible({ timeout: 15_000 });

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, admin);
  await adminPage.goto(`${campaignPath}?tab=settings`);
  await expect(adminPage.getByRole("heading", { name: "Join requests" })).toBeVisible();
  await expect(adminPage.getByText("Pathbuilder E2E Hero")).toBeVisible();
  await expect(adminPage.getByText(/Imported by E2E Importer/)).toBeVisible();

  await adminPage.getByRole("button", { name: "Approve" }).click();
  await expect(adminPage.getByText(/Imported by E2E Importer/)).toHaveCount(0, {
    timeout: 15_000,
  });

  await adminPage.goto(`${campaignPath}?tab=party`);
  await expect(adminPage.getByRole("heading", { name: "Pathbuilder E2E Hero" })).toBeVisible({
    timeout: 15_000,
  });

  await page.reload();
  await expect(page.getByText(/You're already in/)).toBeVisible({ timeout: 15_000 });
  await adminContext.close();
});

test("sheet HP corrections and GM conditions stay live", async ({ page, browser }) => {
  await signIn(page, importer);
  await page.goto(`${campaignPath}?tab=party`);
  const heroCard = page.locator(".party-card").filter({ hasText: "Pathbuilder E2E Hero" });
  await expect(heroCard).toBeVisible();
  await heroCard.getByRole("link", { name: "Sheet" }).click();
  await expect(page.getByRole("heading", { name: "Pathbuilder E2E Hero" })).toBeVisible();
  const characterId = page.url().split("/characters/")[1]?.split(/[/?#]/)[0];
  expect(characterId).toBeTruthy();

  const hpInput = page.getByLabel("Current hit points");
  await hpInput.fill("0");
  await hpInput.press("Enter");
  const conditionList = page.locator(".conditions-list");
  await expect(conditionList.getByText("Dying", { exact: false })).toBeVisible();
  await expect(conditionList.getByText("Unconscious", { exact: false })).toBeVisible();

  await page.getByPlaceholder(/or type one/).fill("Frightened 2");
  await page.getByRole("button", { name: "Add condition" }).click();
  await expect(conditionList.getByText("Frightened 2", { exact: false })).toBeVisible();

  await hpInput.fill("1");
  await hpInput.press("Enter");
  await expect(conditionList.getByText("Wounded 1", { exact: false })).toBeVisible();
  await expect(page.locator(".save-indicator")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pathbuilder E2E Hero" })).toBeVisible();
  await expect(
    page.locator(".conditions-list").getByText("Wounded 1", { exact: false })
  ).toBeVisible();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, admin);
  const sheetResponse = await adminPage.request.get(`/api/characters/${characterId}`);
  const sheet = (await sheetResponse.json()) as { character: { data: unknown } };
  const originalData = sheet.character.data;
  const withCondition = structuredClone(originalData) as {
    play: { conditions: { name: string; value: number | null; duration: number | null }[] };
  };
  withCondition.play.conditions.push({ name: "Off-Guard", value: null, duration: null });
  const addResponse = await adminPage.request.put(`/api/characters/${characterId}`, {
    data: { data: withCondition, force: true },
  });
  expect(addResponse.ok()).toBe(true);
  await expect(conditionList.getByText("Off-Guard", { exact: false })).toBeVisible({
    timeout: 15_000,
  });

  const removeResponse = await adminPage.request.put(`/api/characters/${characterId}`, {
    data: { data: originalData, force: true },
  });
  expect(removeResponse.ok()).toBe(true);
  await expect(conditionList.getByText("Off-Guard", { exact: false })).toHaveCount(0, {
    timeout: 15_000,
  });

  await adminContext.close();
});

test("sheet recovery performs Treat Wounds and tracks immunity", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const campaignId = campaignPath.split("/").pop();
  const created = await page.request.post("/api/characters", {
    data: { name: "E2E Medic", campaignId },
  });
  expect(created.status()).toBe(201);
  const record = (await created.json()) as {
    character: { id: string; data: Record<string, unknown> };
  };
  const draft = structuredClone(record.character.data) as {
    level: number;
    skills: { trained: string[] };
    play: {
      hp: number;
      treatWoundsImmune: boolean;
      battleMedicineImmuneBy: string[];
    };
  };
  draft.skills.trained = [...new Set([...draft.skills.trained, "medicine"])];
  draft.level = 20;
  draft.play.hp = 20;
  draft.play.treatWoundsImmune = false;
  draft.play.battleMedicineImmuneBy = [];
  const saved = await page.request.put(`/api/characters/${record.character.id}`, {
    data: { data: draft, force: true },
  });
  expect(saved.ok()).toBe(true);

  await page.goto(`/characters/${record.character.id}`);
  await expect(page.getByRole("heading", { name: "E2E Medic" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Recovery" }).click();
  const dialog = page.getByRole("dialog", { name: "Recovery" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Medicine", { exact: true })).toHaveValue(/[+-]\d+ \(Trained\)/);
  await dialog.getByRole("button", { name: "Perform Treat Wounds" }).click();
  await expect(dialog.getByText(/Treat Wounds: \d+ vs DC 15/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(dialog.getByText(/immune to Treat Wounds/).first()).toBeVisible();
  await dialog.locator(".modal-foot").getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Recovery" }).click();
  await expect(dialog.getByRole("button", { name: "Perform Treat Wounds" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Clear immunity" }).click();
  await expect(dialog.getByRole("button", { name: "Perform Treat Wounds" })).toBeEnabled();
  await dialog.locator(".modal-foot").getByRole("button", { name: "Close" }).click();
});

test("sheet uses potions, invests items, and tracks daily charges", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const campaignId = campaignPath.split("/").pop();
  const created = await page.request.post("/api/characters", {
    data: { name: "E2E Items", campaignId },
  });
  expect(created.status()).toBe(201);
  const record = (await created.json()) as {
    character: { id: string; data: Record<string, unknown> };
  };
  const draft = structuredClone(record.character.data) as {
    equipment: unknown[];
    play: { hp: number };
  };
  draft.equipment = [
    { itemId: "item:e0vSAQfxhHauiAoD", quantity: 2, equipped: false },
    { itemId: "item:o1zKhvYUUc1hE2AE", quantity: 1, equipped: true, invested: false },
  ];
  draft.play.hp = 5;
  const saved = await page.request.put(`/api/characters/${record.character.id}`, {
    data: { data: draft, force: true },
  });
  expect(saved.ok()).toBe(true);

  await page.goto(`/characters/${record.character.id}`);
  await expect(page.getByRole("heading", { name: "E2E Items" })).toBeVisible({
    timeout: 15_000,
  });
  const potionRow = page.locator(".sheet-equipment-row").filter({ hasText: "Healing Potion" });
  await expect(potionRow).toContainText("×2");
  await potionRow.getByRole("button", { name: "Use" }).click();
  await expect(potionRow).toContainText("×1");

  const glovesRow = page.locator(".sheet-equipment-row").filter({ hasText: "Healer's Gloves" });
  const investedSwitch = glovesRow.getByRole("switch", { name: "Invested" });
  await investedSwitch.click();
  await expect(investedSwitch).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/Invested 1 \/ 10/)).toBeVisible();
  await expect(glovesRow).toContainText("1 / 1 uses");
  await glovesRow.getByRole("button", { name: "Activate" }).click();
  await expect(glovesRow).toContainText("0 / 1 uses");
  await expect(glovesRow.getByRole("button", { name: "Activate" })).toBeDisabled();
});

test("Pathbuilder JSON import creates a character from the dashboard", async ({ page }) => {
  await signIn(page, admin);
  await page.getByRole("button", { name: "Import Pathbuilder" }).click();

  const dialog = page.getByRole("dialog", { name: "Import from Pathbuilder" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Pathbuilder JSON file")
    .setInputFiles("tests/e2e/fixtures/pathbuilder.json");
  await expect(dialog.getByRole("button", { name: "Import character" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Import character" }).click();

  await expect(dialog.getByText("Imported Pathbuilder E2E Hero.")).toBeVisible();
  await dialog.getByRole("button", { name: "Open builder" }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+\/edit$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Pathbuilder E2E Hero" })).toBeVisible({
    timeout: 15_000,
  });
});

test("GM places a token, chats, rolls, and opens the scenes manager", async ({ page, browser }) => {
  await signIn(page, admin);
  await page.goto(campaignPath);
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The First Step" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".vtt-connection")).toHaveClass(/is-online/, { timeout: 15_000 });

  await page.getByRole("button", { name: "Add token", exact: true }).click();
  const addToken = page.getByRole("dialog", { name: "Add a token" });
  await expect(addToken).toBeVisible();
  await addToken
    .locator(".token-add-row")
    .filter({ has: page.locator("strong", { hasText: /^E2E Hero$/ }) })
    .getByRole("button", { name: "Place" })
    .click();
  await expect(page.getByRole("button", { name: /E2E Hero, character token/ })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Roll initiative" }).click();
  await expect(page.getByText("0 / 25 ft.", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Reset movement" })).toBeVisible();
  const activeChip = page.locator(".initiative-chip.is-active");
  await expect(activeChip.locator(".action-pip")).toHaveCount(3);
  await activeChip.locator(".action-pip").first().click();
  await expect(activeChip.locator(".action-pip.is-used")).toHaveCount(1);
  await activeChip.locator(".initiative-reaction").click();
  await expect(activeChip.locator(".initiative-reaction.is-used")).toHaveCount(1);

  await page.getByRole("button", { name: /E2E Hero, character token/ }).click();
  await page.getByRole("button", { name: "Edit token" }).click();
  const tokenEditor = page.getByRole("dialog", { name: /Edit “E2E Hero”/ });
  await expect(tokenEditor.getByLabel(/Vision radius/)).toHaveValue("60");
  await expect(tokenEditor.getByLabel(/Senses/)).toHaveValue("normal");
  await expect(tokenEditor.getByLabel(/Light radius/)).toHaveValue("0");
  await expect(tokenEditor.getByLabel(/Light color/)).toHaveValue("#ffd27d");
  await page.keyboard.press("Escape");
  await expect(tokenEditor).toBeHidden();

  await page.getByRole("button", { name: "Walls", exact: true }).click();
  const sceneSurface = page.locator(".scene-surface");
  const surfaceBox = await sceneSurface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  if (surfaceBox) {
    await page.mouse.move(
      surfaceBox.x + surfaceBox.width * 0.1,
      surfaceBox.y + surfaceBox.height * 0.85
    );
    await page.mouse.down();
    await page.mouse.move(
      surfaceBox.x + surfaceBox.width * 0.3,
      surfaceBox.y + surfaceBox.height * 0.85,
      { steps: 4 }
    );
    await page.mouse.up();
  }
  await expect(page.locator(".wall-layer .wall-line")).toHaveCount(1);
  await page.getByRole("button", { name: "Hide new walls from players" }).click();
  if (surfaceBox) {
    await page.mouse.move(
      surfaceBox.x + surfaceBox.width * 0.1,
      surfaceBox.y + surfaceBox.height * 0.9
    );
    await page.mouse.down();
    await page.mouse.move(
      surfaceBox.x + surfaceBox.width * 0.3,
      surfaceBox.y + surfaceBox.height * 0.9,
      { steps: 4 }
    );
    await page.mouse.up();
  }
  await expect(page.locator(".wall-layer .wall-line")).toHaveCount(2);
  await expect(page.locator(".wall-layer .wall-line.is-hidden")).toHaveCount(1);
  await page.getByRole("button", { name: "Hide new walls from players" }).click();
  await page.getByRole("button", { name: "Walls", exact: true }).click();

  await page.getByLabel("Area template").selectOption("burst");
  await page.getByRole("button", { name: "Hide new templates from players" }).click();
  if (surfaceBox) {
    await page.mouse.move(
      surfaceBox.x + surfaceBox.width * 0.55,
      surfaceBox.y + surfaceBox.height * 0.55
    );
    await page.mouse.down();
    await page.mouse.move(
      surfaceBox.x + surfaceBox.width * 0.57,
      surfaceBox.y + surfaceBox.height * 0.55,
      { steps: 2 }
    );
    await page.mouse.up();
  }
  const hiddenTemplate = page.locator(".template-layer circle").first();
  await expect(hiddenTemplate).toBeVisible();
  await expect(hiddenTemplate).toHaveAttribute("stroke-dasharray", /.+/);
  await page.getByRole("button", { name: "Hide new templates from players" }).click();
  await page.getByLabel("Area template").selectOption("");

  await page.getByRole("button", { name: "Props", exact: true }).click();
  const propPalette = page.locator(".vtt-prop-palette");
  await expect(propPalette).toBeVisible();
  await propPalette.getByRole("button", { name: /Crate/ }).click();
  const propSurfaceBox = await sceneSurface.boundingBox();
  expect(propSurfaceBox).not.toBeNull();
  if (propSurfaceBox) {
    await page.mouse.click(
      propSurfaceBox.x + propSurfaceBox.width * 0.7,
      propSurfaceBox.y + propSurfaceBox.height * 0.3
    );
  }
  await expect(page.locator(".scene-prop")).toHaveCount(1);
  await expect(page.locator(".scene-prop img").first()).toHaveJSProperty("naturalWidth", 200);
  const collisionToggle = propPalette.getByRole("switch", { name: /Prop collision/ });
  await expect(collisionToggle).toBeVisible();
  await collisionToggle.click();
  await expect(page.getByText("Prop collision enabled.")).toBeVisible();

  const tokenButton = page.getByRole("button", { name: /E2E Hero, character token/ });
  const tokenBox = await tokenButton.boundingBox();
  const crateBox = await page.locator(".scene-prop").boundingBox();
  expect(tokenBox).not.toBeNull();
  expect(crateBox).not.toBeNull();
  if (tokenBox && crateBox) {
    await page.mouse.move(tokenBox.x + tokenBox.width / 2, tokenBox.y + tokenBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(crateBox.x + crateBox.width / 2, crateBox.y + crateBox.height / 2, {
      steps: 8,
    });
    await expect(page.locator(".path-layer polyline")).toBeVisible();
    await page.mouse.up();
  }
  await expect(page.locator(".path-layer")).toHaveCount(0);
  const movedBox = await tokenButton.boundingBox();
  if (movedBox && crateBox) {
    const overlaps =
      movedBox.x < crateBox.x + crateBox.width &&
      movedBox.x + movedBox.width > crateBox.x &&
      movedBox.y < crateBox.y + crateBox.height &&
      movedBox.y + movedBox.height > crateBox.y;
    expect(overlaps).toBe(false);
  }

  await collisionToggle.click();
  await expect(page.getByText("Prop collision disabled.")).toBeVisible();
  await page.getByRole("button", { name: "Props", exact: true }).click();

  const wav = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x80, 0x3e, 0x00, 0x00,
    0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
  ]);
  await page.getByRole("button", { name: "Show soundtrack" }).click();
  await page.getByLabel("Upload soundtrack").setInputFiles({
    name: "E2E Theme.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });
  await expect(page.getByText("E2E Theme", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByTitle("Play E2E Theme").click();
  await expect(page.getByText(/E2E Theme · playing/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Music library" }).click();
  const libraryDialog = page.getByRole("dialog", { name: "Music library" });
  await expect(libraryDialog).toBeVisible();
  await libraryDialog.getByRole("button", { name: "Battle", exact: true }).click();
  const battleRow = libraryDialog
    .locator(".audio-library-row")
    .filter({ hasText: "Battle Theme A" });
  await battleRow.getByRole("button", { name: "Add", exact: true }).click();
  await expect(battleRow.getByRole("button", { name: "Added", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await libraryDialog.locator(".modal-foot").getByRole("button", { name: "Close" }).click();
  await expect(libraryDialog).toBeHidden();
  await expect(page.getByText("Battle Theme A", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("Remove Battle Theme A").click();
  await expect(page.getByText("Battle Theme A", { exact: true })).toHaveCount(0);

  const playerContext = await browser.newContext();
  const playerPage = await playerContext.newPage();
  await signIn(playerPage, player);
  await playerPage.goto(campaignPath);
  await expect(playerPage.getByText(/E2E Theme · playing/)).toBeVisible({ timeout: 15_000 });
  await playerPage.getByRole("button", { name: "Join audio" }).click();
  await expect(playerPage.getByRole("button", { name: "Leave audio" })).toBeVisible();
  await playerPage.getByRole("button", { name: "Leave audio" }).click();
  await expect(playerPage.getByRole("button", { name: "Join audio" })).toBeVisible();
  await playerContext.close();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("Remove E2E Theme").click();
  await expect(page.getByText("E2E Theme", { exact: true })).toHaveCount(0);

  await page.getByPlaceholder(/Message the table/).fill("E2E table hello");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("E2E table hello")).toBeVisible();

  await page.getByRole("button", { name: "Dice tray" }).click();
  await page.getByPlaceholder("1d20+5").fill("1d20");
  await page.getByPlaceholder("Perception").fill("E2E roll");
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await page.getByRole("button", { name: "Table talk" }).click();
  await expect(page.locator(".chat-roll").getByText("E2E roll", { exact: true })).toBeVisible();
  await expect(page.locator(".chat-roll").getByText("1d20", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Scenes" }).click();
  const scenes = page.getByRole("dialog", { name: "Scenes" });
  await expect(scenes).toBeVisible();

  await scenes.getByRole("button", { name: "New scene" }).click();
  await expect(scenes.getByText("Map library")).toBeVisible();
  const builtinCard = scenes.getByRole("button", { name: /The Gilded Tankard/ });
  await expect(builtinCard).toBeVisible();
  await expect(builtinCard.locator("img")).toHaveJSProperty("naturalWidth", 1536);
  const villageCard = scenes.getByRole("button", { name: /Willowbrook Crossroads/ });
  await expect(villageCard).toBeVisible();
  await expect(villageCard.locator("img")).toHaveJSProperty("naturalWidth", 1536);
  await builtinCard.click();
  await expect(scenes.getByLabel("Scene name")).toHaveValue("The Gilded Tankard");
  await scenes.getByRole("button", { name: "Create scene" }).click();
  await expect(scenes).toBeHidden();
  await expect(page.getByRole("heading", { name: "The Gilded Tankard" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Scenes" }).click();
  await expect(scenes).toBeVisible();
  await scenes.getByRole("button", { name: "Edit" }).first().click();
  const sceneEditor = page.getByRole("dialog", { name: /Edit/ });
  await expect(sceneEditor.getByText("Grid calibration")).toBeVisible();
  await expect(sceneEditor.getByText("Line-of-sight fog")).toBeVisible();
  await expect(sceneEditor.getByText("Wall collision")).toBeVisible();
  await expect(sceneEditor.getByText("Ambient light")).toBeVisible();
  await expect(sceneEditor.getByText("Vision scope")).toBeVisible();
  await expect(sceneEditor.getByText("Prop collision")).toBeVisible();
  await expect(sceneEditor.getByLabel("Squares in calibration drag")).toHaveValue("4");
  await expect(sceneEditor.getByLabel("Scale map percent")).toHaveValue("100");

  const gridSizeInput = sceneEditor.getByLabel("Grid size in pixels");
  await expect(gridSizeInput).toHaveValue("70");
  const calibrationBox = await sceneEditor.locator(".grid-calibration-canvas").boundingBox();
  expect(calibrationBox).not.toBeNull();
  if (calibrationBox) {
    await page.mouse.move(
      calibrationBox.x + calibrationBox.width * 0.2,
      calibrationBox.y + calibrationBox.height * 0.5
    );
    await page.mouse.down();
    await page.mouse.move(
      calibrationBox.x + calibrationBox.width * 0.8,
      calibrationBox.y + calibrationBox.height * 0.5,
      { steps: 6 }
    );
    await page.mouse.up();
  }
  await expect(gridSizeInput).not.toHaveValue("70");

  await page.keyboard.press("Escape");
  await expect(sceneEditor).toBeHidden();

  await page.getByRole("button", { name: "Scenes" }).click();
  await expect(scenes).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(scenes).toBeHidden();
});

test("GM applies an elite template and rolls monster attacks", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await page.goto(campaignPath);
  await expect(page.locator(".vtt-connection")).toHaveClass(/is-online/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Bestiary", exact: true }).click();
  await expect(page.getByPlaceholder(/Search creatures/)).toBeVisible();
  await page.getByPlaceholder(/Search creatures/).fill("Goblin Warrior");
  await page.locator('select:has(option[value="elite"])').selectOption("elite");
  const row = page.locator(".vtt-bestiary-row").filter({ hasText: "Goblin Warrior (Elite)" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("L0");
  await row.getByRole("button", { name: "Add" }).click();

  const monsterToken = page.locator('.scene-token[aria-label*="Goblin Warrior (Elite)"]');
  await expect(monsterToken).toBeVisible({ timeout: 15_000 });
  await monsterToken.click();
  const statblock = page.locator(".monster-statblock");
  await expect(statblock).toBeVisible({ timeout: 15_000 });
  await expect(statblock).toContainText("Dogslicer");
  const attackRow = statblock.locator(".monster-action-row").filter({ hasText: "Dogslicer" });
  await attackRow.getByRole("button", { name: "Attack" }).click();
  await expect(page.getByText(/Goblin Warrior \(Elite\): Dogslicer attack/).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("GM configures fast healing, regeneration, and persistent damage on a token", async ({
  page,
}) => {
  await signIn(page, admin);
  await page.goto(campaignPath);
  await expect(page.locator(".vtt-connection")).toHaveClass(/is-online/, { timeout: 15_000 });

  await page.getByRole("button", { name: "Add token", exact: true }).click();
  const addToken = page.getByRole("dialog", { name: "Add a token" });
  await addToken.getByRole("button", { name: /Custom/ }).click();
  await addToken.getByLabel("Token name").fill("Effect Dummy");
  await addToken.getByLabel("Hit points").fill("20");
  await addToken.getByLabel("Armor class").fill("15");
  await addToken.getByRole("button", { name: "Place token" }).click();
  await expect(addToken).toBeHidden();

  const tokenButton = page.getByRole("button", {
    name: /Effect Dummy, 20 of 20 hit points/,
  });
  await expect(tokenButton).toBeVisible({ timeout: 15_000 });
  await tokenButton.click({ force: true });
  await page.getByRole("button", { name: "Edit token" }).click();
  const editor = page.getByRole("dialog", { name: /Edit “Effect Dummy”/ });
  await editor.getByLabel("Fast healing", { exact: true }).fill("5");
  await editor.getByLabel("Regeneration", { exact: true }).fill("10");
  await editor.getByLabel("Token persistent damage formula").fill("1d6");
  await editor.getByLabel("Token persistent damage type").fill("fire");
  await editor.getByRole("button", { name: "Add persistent damage" }).click();
  await expect(editor.getByText(/1d6 fire/)).toBeVisible();
  await editor.getByRole("button", { name: "Save token" }).click();
  await expect(editor).toBeHidden();

  await tokenButton.click({ force: true });
  await page.getByRole("button", { name: "Edit token" }).click();
  await expect(editor.getByLabel("Fast healing", { exact: true })).toHaveValue("5");
  await expect(editor.getByLabel("Regeneration", { exact: true })).toHaveValue("10");
  await expect(editor.getByText(/1d6 fire/)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await editor.getByRole("button", { name: "Delete" }).click();
  await expect(editor).toBeHidden();
});

test("GM turns a handout into a completed quest and awards its XP", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(campaignPath);
  await page
    .locator(".campaign-tabs")
    .getByRole("button", { name: /^Journal/ })
    .click();
  await page.getByRole("button", { name: "New entry" }).click();
  const journalDialog = page.getByRole("dialog");
  await expect(journalDialog).toBeVisible();
  await journalDialog.getByRole("button", { name: /Handout/ }).click();
  await journalDialog.getByLabel("Title").fill("E2E Quest");
  await journalDialog.getByLabel(/Caption or description/).fill("Recover the silver key.");
  await journalDialog.getByLabel("Quest status").selectOption("completed");
  await journalDialog.getByLabel("Quest XP").fill("40");
  await journalDialog.getByRole("button", { name: "Save handout" }).click();
  await expect(page.getByRole("heading", { name: "E2E Quest" })).toBeVisible();
  await expect(page.getByText("40 XP when completed.")).toBeVisible();
  await page.getByRole("button", { name: "Award XP" }).click();
  await expect(page.getByText(/Awarded 40 quest XP/)).toBeVisible();
  await expect(page.getByText("Rewarded")).toBeVisible();
});

test("builder completes a level-1 Fighter and reaches the sheet", async ({ page }) => {
  await signIn(page, admin);
  await openNewCharacter(page, "E2E Fighter");

  await goToStep(page, "Ancestry");
  await page.locator(".ancestry-grid .selection-card").filter({ hasText: "Human" }).first().click();
  await goToStep(page, "Heritage");
  await page
    .locator(".selection-grid .selection-card")
    .filter({ hasText: "Skilled Human" })
    .click();
  await goToStep(page, "Background");
  await page
    .locator(".selection-grid .selection-card")
    .filter({ hasText: "Warrior" })
    .first()
    .click();
  await goToStep(page, "Class");
  await page
    .locator(".class-grid")
    .getByRole("button", { name: /Fighter/ })
    .click();

  await goToStep(page, "Abilities");
  await setBoost(page, "Ancestry boosts", ["str", "con"]);
  await setBoost(page, "Background boosts", ["str", "con"]);
  await setBoost(page, "Class boost", ["str"]);
  for (const [index, ability] of ["str", "dex", "con", "wis"].entries()) {
    await page.getByLabel(`Free boost ${index + 1}`).selectOption(ability);
  }
  await expect(page.locator(".ability-score").first()).toHaveText("18");

  await goToStep(page, "Skills");
  await page
    .locator(".skill-picker")
    .filter({ hasText: "Skilled Human training" })
    .getByRole("combobox")
    .selectOption("stealth");
  await trainClassSkills(page, ["Athletics", "Acrobatics", "Medicine"]);

  await goToStep(page, "Feats");
  await pickFeat(page, "Ancestry feat", "Haughty Obstinacy");
  await pickFeat(page, "Class feat", "Exacting Strike");
  await expect(page.locator(".feat-slot").filter({ hasText: "Ancestry feat" })).toContainText(
    "Haughty Obstinacy"
  );

  await goToStep(page, "Spells");
  await expect(page.getByText("No spellbook required.")).toBeVisible();
  await goToStep(page, "Gear");
  await page.getByRole("button", { name: /Take .* as coins/ }).click();
  await goToStep(page, "Review");
  await expect(page.getByRole("heading", { name: "Your hero is ready" })).toBeVisible();

  await page.getByRole("link", { name: "Open character sheet" }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/, { timeout: 15_000 });
  fighterSheetPath = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: "E2E Fighter" })).toBeVisible();
  await expect(page.getByText("Fighter").first()).toBeVisible();
});

test("builder warns before replacing a class with dependent choices", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${fighterSheetPath}/edit`);
  await page.waitForLoadState("networkidle");
  await goToStep(page, "Class");

  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });
  await page
    .locator(".class-grid")
    .getByRole("button", { name: /Ranger/ })
    .click();
  expect(dialogMessage).toContain("Change to Ranger?");
  expect(dialogMessage).toContain("class feats");

  await expect(page.locator(".class-grid .selection-card.is-selected")).toContainText("Fighter");
});

test("builder completes a level-1 Cleric with split divine-font preparation", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await openNewCharacter(page, "E2E Cleric");

  await goToStep(page, "Ancestry");
  await page.locator(".ancestry-grid .selection-card").filter({ hasText: "Human" }).first().click();
  await goToStep(page, "Heritage");
  await page
    .locator(".selection-grid .selection-card")
    .filter({ hasText: "Skilled Human" })
    .click();
  await goToStep(page, "Background");
  await page
    .locator(".selection-grid .selection-card")
    .filter({ hasText: "Acolyte" })
    .first()
    .click();
  await goToStep(page, "Class");
  await page
    .locator(".class-grid")
    .getByRole("button", { name: /Cleric/ })
    .click();
  await page.getByRole("button", { name: "Choose deity" }).click();
  await page.getByPlaceholder(/Search deities/).fill("Abadar");
  await page
    .locator(".picker-item-name", { hasText: /^Abadar$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Follow Abadar" }).click();
  await page
    .locator(".choice-options")
    .getByRole("button", { name: /Warpriest/ })
    .click();

  await goToStep(page, "Abilities");
  await setBoost(page, "Ancestry boosts", ["wis", "con"]);
  await setBoost(page, "Background boosts", ["wis", "con"]);
  for (const [index, ability] of ["wis", "dex", "con", "cha"].entries()) {
    await page.getByLabel(`Free boost ${index + 1}`).selectOption(ability);
  }

  await goToStep(page, "Skills");
  await page
    .locator(".skill-picker")
    .filter({ hasText: "Skilled Human training" })
    .getByRole("combobox")
    .selectOption("stealth");
  await trainClassSkills(page, ["Athletics", "Medicine"]);

  await goToStep(page, "Feats");
  await pickFeat(page, "Ancestry feat", "Haughty Obstinacy");

  await goToStep(page, "Spells");
  for (const cantrip of ["Guidance", "Light", "Stabilize", "Detect Magic", "Forbidding Ward"]) {
    await page.getByRole("button", { name: "Add cantrip" }).click();
    await pickSpell(page, cantrip);
  }
  await expect(page.getByRole("button", { name: "Add cantrip" })).toBeDisabled();

  const rankOne = page
    .locator(".spell-section")
    .filter({ has: page.getByRole("heading", { name: "Rank 1 spellbook" }) });
  await rankOne.getByRole("button", { name: "Add rank 1 spell to spellbook" }).click();
  await pickSpell(page, "Bless");
  await rankOne.getByRole("button", { name: "Add rank 1 spell to spellbook" }).click();
  await pickSpell(page, "Heal");

  const blessRow = rankOne.getByRole("group", { name: "Bless spellbook row" });
  await blessRow.getByRole("button", { name: "Prepare Bless at rank 1" }).click();
  await blessRow.getByRole("button", { name: "Prepare Bless at rank 1" }).click();
  await expect(blessRow.getByRole("button", { name: "Prepare Bless at rank 1" })).toBeDisabled();

  const healRow = rankOne.getByRole("group", { name: "Heal spellbook row" });
  for (let index = 0; index < 4; index += 1) {
    await healRow.getByRole("button", { name: "Prepare Heal at rank 1" }).click();
  }
  const preparedRankOne = page.getByTestId("prepared-rank-1");
  await expect(preparedRankOne.getByTestId("prepared-1-heal")).toContainText("Font");
  await expect(preparedRankOne.getByTestId("prepared-1-heal")).toContainText("4");
  await expect(page.getByTestId("rank-summary-1")).toContainText(
    "2 / 2 ordinary · 4 / 4 font (6 total)"
  );
  await expect(rankOne.getByText(/prepared \(includes font\)/)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Divine font" })).toHaveValue("heal");

  await goToStep(page, "Gear");
  await page.getByRole("button", { name: /Take .* as coins/ }).click();
  await goToStep(page, "Review");
  await expect(page.getByRole("heading", { name: "Your hero is ready" })).toBeVisible();

  await page.getByRole("link", { name: "Open character sheet" }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "E2E Cleric" })).toBeVisible();
  const slots = page.locator(".sheet-slots");
  await expect(slots.locator(".slot-row-font")).toContainText("4 / 4");
  await expect(slots.locator(".slot-row-font")).toContainText("Heal font");
  await expect(
    page.locator(".sheet-spell-row").filter({ hasText: "Bless" }).getByText("Prepared ×2")
  ).toBeVisible();
  await expect(
    page.locator(".sheet-spell-row").filter({ hasText: "Heal" }).getByText("Prepared ×4")
  ).toBeVisible();

  const ordinaryRankOne = slots
    .locator(".sheet-slot-row:not(.slot-row-font)")
    .filter({ hasText: "Rank 1" });
  await expect(ordinaryRankOne).toContainText("2 / 2");
  const sheetHealRow = page.locator(".sheet-spell-row").filter({ hasText: "Heal" });
  await sheetHealRow.getByRole("button", { name: "Cast Heal" }).click();
  const healDialog = page.getByRole("dialog", { name: "Cast Heal" });
  await expect(healDialog.getByText(/1 divine font slot/)).toBeVisible();
  await healDialog.getByRole("button", { name: "Cast spell" }).click();
  await expect(slots.locator(".slot-row-font")).toContainText("3 / 4");
  await expect(ordinaryRankOne).toContainText("2 / 2");
  await expect(page.locator(".save-indicator")).toHaveText("Saved");

  await page.reload();
  await expect(page.getByRole("heading", { name: "E2E Cleric" })).toBeVisible();
  await expect(page.locator(".sheet-slots .slot-row-font")).toContainText("3 / 4");

  await page.getByRole("button", { name: "Counteract", exact: true }).click();
  const spellChecks = page.getByRole("dialog", { name: "Spell checks" });
  await expect(spellChecks).toBeVisible();
  await spellChecks.getByLabel("Effect DC").fill("15");
  await spellChecks.getByRole("button", { name: "Roll counteract" }).click();
  await expect(spellChecks.getByText(/Counteract rank/)).toBeVisible();
  await spellChecks.locator(".modal-foot").getByRole("button", { name: "Close" }).click();

  const sheetBlessRow = page.locator(".sheet-spell-row").filter({ hasText: "Bless" });
  await sheetBlessRow.getByRole("button", { name: "Cast Bless" }).click();
  const blessDialog = page.getByRole("dialog", { name: "Cast Bless" });
  await expect(blessDialog.getByText(/1 rank 1 slot/)).toBeVisible();
  await blessDialog.getByRole("button", { name: "Cast spell" }).click();
  await expect(
    page.locator(".sheet-slots .sheet-slot-row:not(.slot-row-font)").filter({ hasText: "Rank 1" })
  ).toContainText("1 / 2");

  await page.getByRole("button", { name: "Long rest" }).click();
  const castRestDialog = page.getByRole("dialog", { name: "Take a long rest" });
  await expect(castRestDialog).toBeVisible();
  await castRestDialog.getByRole("button", { name: "Take long rest" }).click();
  await expect(page.locator(".sheet-slots .slot-row-font")).toContainText("4 / 4");
  await expect(
    page.locator(".sheet-slots .sheet-slot-row:not(.slot-row-font)").filter({ hasText: "Rank 1" })
  ).toContainText("2 / 2");
  const dailyPrep = page.getByRole("dialog", { name: "Daily preparations" });
  await expect(dailyPrep).toBeVisible({ timeout: 15_000 });
  await dailyPrep.getByRole("button", { name: "Cancel" }).click();
  await expect(dailyPrep).toHaveCount(0);
});

test("sheet tracks rituals and innate spells", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const campaignId = campaignPath.split("/").pop();
  const list = await page.request.get(`/api/characters?campaignId=${campaignId}`);
  expect(list.ok()).toBe(true);
  const characters = (await list.json()) as {
    characters: { id: string; name: string }[];
  };
  const cleric = characters.characters.find((entry) => entry.name === "E2E Cleric");
  expect(cleric).toBeTruthy();
  const full = await page.request.get(`/api/characters/${cleric!.id}`);
  expect(full.ok()).toBe(true);
  const record = (await full.json()) as { character: { data: Record<string, unknown> } };
  const draft = structuredClone(record.character.data) as {
    spells: { rituals: string[]; innate: string[]; innateUsed: Record<string, number> };
  };
  draft.spells.rituals = ["spell:joEruBVz31Uxczzq"];
  draft.spells.innate = ["spell:gpzpAAAJ1Lza2JVl"];
  draft.spells.innateUsed = {};
  const saved = await page.request.put(`/api/characters/${cleric!.id}`, {
    data: { data: draft, force: true },
  });
  expect(saved.ok()).toBe(true);

  await page.goto(`/characters/${cleric!.id}`);
  await expect(page.getByRole("heading", { name: "E2E Cleric" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Rituals", { exact: true })).toBeVisible();
  await expect(page.getByText("Innate spells", { exact: true })).toBeVisible();
  const ritualRow = page.locator(".sheet-spell-row").filter({ hasText: "Angelic Messenger" });
  await ritualRow.getByRole("button", { name: "Cast ritual" }).click();
  const ritualDialog = page.getByRole("dialog", { name: "Cast Angelic Messenger" });
  await expect(ritualDialog).toBeVisible();
  await ritualDialog.getByLabel("Ritual DC").fill("15");
  await ritualDialog.getByRole("button", { name: "Roll ritual check" }).click();
  await expect(ritualDialog.getByText(/vs DC 15/)).toBeVisible({ timeout: 15_000 });
  await ritualDialog.locator(".modal-foot").getByRole("button", { name: "Close" }).click();

  const innateGroup = page.locator(".spell-group").filter({ hasText: "Innate spells" });
  const innateRow = innateGroup.locator(".sheet-spell-row").filter({ hasText: "Detect Magic" });
  await expect(innateRow).toContainText(/innate.*at will/);
});

test("builder completes a level-1 Wizard using granted curriculum spells", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await openNewCharacter(page, "E2E Wizard");

  await goToStep(page, "Ancestry");
  await page.locator(".ancestry-grid .selection-card").filter({ hasText: "Human" }).first().click();
  await goToStep(page, "Heritage");
  await page
    .locator(".selection-grid .selection-card")
    .filter({ hasText: "Skilled Human" })
    .click();
  await goToStep(page, "Background");
  await page
    .locator(".selection-grid .selection-card")
    .filter({ hasText: "Acolyte" })
    .first()
    .click();
  await goToStep(page, "Class");
  await page
    .locator(".class-grid")
    .getByRole("button", { name: /Wizard/ })
    .click();

  const schoolGroup = page.locator(".choice-group").filter({
    has: page.getByRole("heading", { name: "Select an arcane school." }),
  });
  // Core campaigns only list core schools.
  await expect(schoolGroup.getByRole("button", { name: /Red Mantis Magic School/ })).toHaveCount(0);
  await schoolGroup.getByRole("button", { name: /School of Battle Magic/ }).click();
  const thesisGroup = page.locator(".choice-group").filter({
    has: page.getByRole("heading", { name: "Select an arcane thesis." }),
  });
  await thesisGroup.getByRole("button", { name: /Spell Blending/ }).click();

  await goToStep(page, "Abilities");
  await setBoost(page, "Ancestry boosts", ["int", "con"]);
  await setBoost(page, "Background boosts", ["int", "con"]);
  for (const [index, ability] of ["int", "dex", "con", "wis"].entries()) {
    await page.getByLabel(`Free boost ${index + 1}`).selectOption(ability);
  }

  await goToStep(page, "Skills");
  await page
    .locator(".skill-picker")
    .filter({ hasText: "Skilled Human training" })
    .getByRole("combobox")
    .selectOption("stealth");
  await trainClassSkills(page, [
    "Athletics",
    "Acrobatics",
    "Medicine",
    "Nature",
    "Diplomacy",
    "Society",
  ]);

  await goToStep(page, "Feats");
  await pickFeat(page, "Ancestry feat", "Haughty Obstinacy");

  await goToStep(page, "Spells");
  const cantripsCard = page
    .locator(".spell-section")
    .filter({ has: page.getByRole("heading", { name: "Cantrips", exact: true }) });
  await expect(cantripsCard.getByText("Shield", { exact: true })).toBeVisible();
  await expect(cantripsCard.getByText("Telekinetic Projectile", { exact: true })).toBeVisible();

  const rankOne = page
    .locator(".spell-section")
    .filter({ has: page.getByRole("heading", { name: "Rank 1 spellbook" }) });
  await expect(rankOne.getByText("Force Barrage", { exact: true })).toBeVisible();
  await expect(rankOne.getByText("Mystic Armor", { exact: true })).toBeVisible();
  await expect(rankOne.getByText("Breathe Fire", { exact: true })).toBeVisible();

  // A granted curriculum spell cannot be added again from the picker.
  await rankOne.getByRole("button", { name: "Add rank 1 spell to spellbook" }).click();
  await page.getByPlaceholder(/Search spells/).fill("Force Barrage");
  await expect(page.locator(".picker-item-name", { hasText: /^Force Barrage$/ })).toHaveCount(0);
  await expect(page.getByText(/hidden because already granted or selected/)).toBeVisible();
  await page.keyboard.press("Escape");

  const builderBarrageRow = rankOne.getByRole("group", { name: "Force Barrage spellbook row" });
  await builderBarrageRow.getByRole("button", { name: "Prepare Force Barrage at rank 1" }).click();
  await expect(page.getByTestId("rank-summary-1")).toContainText("1 / 3 prepared");
  await expect(page.getByTestId("rank-summary-1")).toContainText("1 curriculum slot");

  await goToStep(page, "Gear");
  await page.getByRole("button", { name: /Take .* as coins/ }).click();
  await goToStep(page, "Review");
  await expect(page.getByRole("heading", { name: "Your hero is ready" })).toBeVisible();

  await page.getByRole("link", { name: "Open character sheet" }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "E2E Wizard" })).toBeVisible();
  await expect(
    page.locator(".sheet-spell-row").filter({ hasText: "Force Barrage" }).getByText("Prepared")
  ).toBeVisible();
  await expect(
    page.locator(".sheet-spells").getByText("Force Bolt", { exact: true })
  ).toBeVisible();

  const wizardRankOne = page.locator(".sheet-slots .sheet-slot-row").filter({ hasText: "Rank 1" });
  await expect(wizardRankOne).toContainText("3 / 3");
  const barrageRow = page.locator(".sheet-spell-row").filter({ hasText: "Force Barrage" });
  await barrageRow.getByRole("button", { name: "Cast Force Barrage" }).click();
  const barrageDialog = page.getByRole("dialog", { name: "Cast Force Barrage" });
  await expect(barrageDialog.getByText(/1 rank 1 slot/)).toBeVisible();
  await expect(
    barrageDialog.getByRole("button", { name: "Use 1 action for Force Barrage" })
  ).toHaveAttribute("aria-pressed", "true");
  await barrageDialog.getByRole("button", { name: "Use 2 actions for Force Barrage" }).click();
  await expect(barrageDialog.getByText("2d4+2 force", { exact: true })).toBeVisible();
  await barrageDialog.getByRole("button", { name: "Cast spell" }).click();
  await expect(wizardRankOne).toContainText("2 / 3");
  await expect(page.locator(".save-indicator")).toHaveText("Saved");

  await page.reload();
  await expect(page.getByRole("heading", { name: "E2E Wizard" })).toBeVisible();
  await expect(
    page.locator(".sheet-slots .sheet-slot-row").filter({ hasText: "Rank 1" })
  ).toContainText("2 / 3");

  const focusPip = page.locator(".point-pip.focus").first();
  await expect(focusPip).toHaveAttribute("aria-pressed", "true");
  const boltRow = page.locator(".sheet-spell-row").filter({ hasText: "Force Bolt" });
  await boltRow.getByRole("button", { name: "Cast Force Bolt" }).click();
  const boltDialog = page.getByRole("dialog", { name: "Cast Force Bolt" });
  await expect(boltDialog.getByText(/1 focus point/)).toBeVisible();
  await boltDialog.getByRole("button", { name: "Cast spell" }).click();
  await expect(focusPip).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Refocus" }).click();
  await expect(focusPip).toHaveAttribute("aria-pressed", "true");

  const projectileRow = page
    .locator(".sheet-spell-row")
    .filter({ hasText: "Telekinetic Projectile" });
  await projectileRow.getByRole("button", { name: "Cast Telekinetic Projectile" }).click();
  const projectileDialog = page.getByRole("dialog", { name: "Cast Telekinetic Projectile" });
  await expect(projectileDialog.getByText(/no slot/)).toBeVisible();
  await projectileDialog.getByRole("button", { name: "Cast spell" }).click();
  await expect(
    page.locator(".sheet-slots .sheet-slot-row").filter({ hasText: "Rank 1" })
  ).toContainText("2 / 3");
});

test("builder grants a Cloistered Cleric domain focus spell", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await openNewCharacter(page, "E2E Domain Cleric");

  await goToStep(page, "Class");
  await page
    .locator(".class-grid")
    .getByRole("button", { name: /Cleric/ })
    .click();
  await page.getByRole("button", { name: "Choose deity" }).click();
  await page.getByPlaceholder(/Search deities/).fill("Abadar");
  await page
    .locator(".picker-item-name", { hasText: /^Abadar$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Follow Abadar" }).click();
  await page
    .locator(".choice-options")
    .getByRole("button", { name: /Cloistered Cleric/ })
    .click();

  const domainGroup = page
    .locator(".choice-group")
    .filter({ hasText: "Domain Initiate: choose a domain." });
  await expect(domainGroup).toBeVisible();
  await expect(domainGroup.getByRole("button", { name: /Cities Domain/ })).toBeVisible();
  await expect(domainGroup.getByRole("button", { name: /Fire Domain/ })).toHaveCount(0);
  await domainGroup.getByRole("button", { name: /Cities Domain/ }).click();

  await goToStep(page, "Spells");
  await expect(
    page
      .locator(".spell-section")
      .filter({ hasText: "Granted spells" })
      .getByText("Face in the Crowd")
  ).toBeVisible();
  const focusCard = page
    .locator(".spell-section")
    .filter({ has: page.getByRole("heading", { name: "Focus spells" }) });
  await expect(focusCard.getByText("Face in the Crowd")).toBeVisible();
  await expect(focusCard.getByText("Granted", { exact: true })).toBeVisible();
});

test("builder filters Champion devotion spells by deity font", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await openNewCharacter(page, "E2E Champion");

  await goToStep(page, "Class");
  await page
    .locator(".class-grid")
    .getByRole("button", { name: /Champion/ })
    .click();
  await page
    .locator(".choice-options")
    .getByRole("button", { name: /^Justice/ })
    .click();
  await page.getByRole("button", { name: "Choose deity" }).click();
  await page.getByPlaceholder(/Search deities/).fill("Iomedae");
  await page
    .locator(".picker-item-name", { hasText: /^Iomedae$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Follow Iomedae" }).click();

  const devotionGroup = page
    .locator(".choice-group")
    .filter({ hasText: "Choose your devotion spell." });
  await expect(devotionGroup).toBeVisible();
  await expect(devotionGroup.getByRole("button", { name: /Lay on Hands/ })).toBeVisible();
  await expect(devotionGroup.getByRole("button", { name: /Touch of the Void/ })).toHaveCount(0);
  await devotionGroup.getByRole("button", { name: /Lay on Hands/ }).click();

  await goToStep(page, "Spells");
  const focusCard = page
    .locator(".spell-section")
    .filter({ has: page.getByRole("heading", { name: "Focus spells" }) });
  await expect(focusCard.getByText("Lay on Hands")).toBeVisible();
  await expect(focusCard.getByText("Granted", { exact: true })).toBeVisible();
});

test("builder grants the chosen Elemental Sorcerer element", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await openNewCharacter(page, "E2E Elemental Sorcerer");

  await goToStep(page, "Class");
  await page
    .locator(".class-grid")
    .getByRole("button", { name: /Sorcerer/ })
    .click();
  await page
    .locator(".choice-options")
    .getByRole("button", { name: /Bloodline: Elemental/ })
    .click();

  const elementGroup = page
    .locator(".choice-group")
    .filter({ hasText: "Elemental bloodline: choose an element." });
  await expect(elementGroup).toBeVisible();
  await elementGroup
    .locator(".choice-option")
    .filter({ has: page.locator(".choice-option-head strong", { hasText: /^Fire$/ }) })
    .click();

  await goToStep(page, "Spells");
  const granted = page.locator(".spell-section").filter({ hasText: "Granted spells" });
  await expect(granted.getByText("Ignition")).toBeVisible();
  await expect(granted.getByText("Breathe Fire")).toBeVisible();
  const cantrips = page
    .locator(".spell-section")
    .filter({ has: page.getByRole("heading", { name: "Cantrips", exact: true }) });
  await expect(cantrips.getByText("Ignition")).toBeVisible();
  const rankOne = page
    .locator(".spell-section")
    .filter({ has: page.getByRole("heading", { name: "Rank 1 repertoire" }) });
  await expect(rankOne.getByText("Breathe Fire")).toBeVisible();
});

test("level-5 prepared upcasting moves Heal into the rank-3 font pool", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await openNewCharacter(page, "E2E Prepared 5");

  await goToStep(page, "Ancestry");
  await page.locator(".ancestry-grid .selection-card").filter({ hasText: "Human" }).first().click();
  await goToStep(page, "Heritage");
  await page
    .locator(".selection-grid .selection-card")
    .filter({ hasText: "Skilled Human" })
    .click();
  await goToStep(page, "Background");
  await page
    .locator(".selection-grid .selection-card")
    .filter({ hasText: "Acolyte" })
    .first()
    .click();
  await goToStep(page, "Class");
  await page
    .locator(".class-grid")
    .getByRole("button", { name: /Cleric/ })
    .click();
  await page.getByRole("button", { name: "Choose deity" }).click();
  await page.getByPlaceholder(/Search deities/).fill("Abadar");
  await page
    .locator(".picker-item-name", { hasText: /^Abadar$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Follow Abadar" }).click();
  const classSave = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" && response.url().includes("/api/characters/")
  );
  await page
    .locator(".choice-options")
    .getByRole("button", { name: /Warpriest/ })
    .click();
  await classSave;

  const characterId = page.url().split("/characters/")[1]?.split("/")[0];
  expect(characterId).toBeTruthy();
  const response = await page.request.get(`/api/characters/${characterId}`);
  const payload = (await response.json()) as {
    character: { revision: number; data: Record<string, unknown> };
  };
  const data = structuredClone(payload.character.data) as {
    level: number;
    spells: Record<string, unknown>;
  };
  const heal = "spell:rfZpqmj0AIIdkVIs";
  const bless = "spell:XSujb7EsSwKl19Uu";
  const heroism = "spell:KqvqNAfGIE5a9wSv";
  const guidance = "spell:izcxFQFwf3woCnFs";
  data.level = 5;
  data.spells.known = [bless, heal, heroism];
  data.spells.cantrips = [guidance];
  data.spells.preparedByRank = {
    "1": [bless, bless, heal],
    "3": [heal, heal, heal, heal, heal, heroism, heroism],
  };
  data.spells.prepared = [bless, bless, heal, heal, heal, heal, heal, heal, heroism, heroism];
  const save = await page.request.put(`/api/characters/${characterId}`, {
    data: { data, expectedRevision: payload.character.revision },
  });
  expect(save.ok()).toBe(true);

  await page.goto(`/characters/${characterId}/edit`);
  await goToStep(page, "Spells");
  const preparedRankThree = page.getByTestId("prepared-rank-3");
  await expect(preparedRankThree.getByTestId("prepared-3-heal")).toContainText("Font");
  await expect(preparedRankThree.getByTestId("prepared-3-heal")).toContainText("5");
  await expect(page.getByTestId("rank-summary-3")).toContainText(
    "2 / 2 ordinary · 5 / 5 font (7 total)"
  );

  await page.getByRole("link", { name: "Open character sheet" }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/, { timeout: 15_000 });
  const healRow = page.getByTestId("sheet-spell-heal");
  await expect(healRow.getByTestId("sheet-prepared-heal")).toContainText("Prepared ×6");
  const healRanks = healRow.getByTestId("sheet-prepared-ranks-heal");
  await expect(healRanks).toContainText("rank 3 font ×5");
  await expect(healRanks).toContainText("rank 1 ordinary ×1");
  await healRow.getByRole("button", { name: "Cast Heal" }).click();
  const healDialog = page.getByRole("dialog", { name: "Cast Heal" });
  await expect(healDialog.getByLabel("Cast at rank")).toHaveValue("3:font");
  await expect(healDialog.getByLabel("Cast at rank").locator("option")).toHaveText([
    "Rank 3 · Divine font · 5 left",
    "Rank 1 · Rank 1 slot · 1 left",
  ]);
  await expect(healDialog.getByTestId("cast-prepared-summary")).toContainText("rank 3 font ×5");
  await expect(healDialog.getByRole("button", { name: "Use 2 actions for Heal" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(healDialog.getByText("3d8+24 HP", { exact: true })).toBeVisible();
  await healDialog.getByRole("button", { name: "Use 1 action for Heal" }).click();
  await expect(healDialog.getByText("3d8 HP", { exact: true })).toBeVisible();
  await healDialog.getByRole("button", { name: "Use 2 actions for Heal" }).click();
  await healDialog.getByRole("button", { name: "Cast spell" }).click();
  await expect(page.locator(".sheet-slots .slot-row-font")).toContainText("4 / 5");

  await healRow.getByRole("button", { name: "Cast Heal" }).click();
  const secondDialog = page.getByRole("dialog", { name: "Cast Heal" });
  await secondDialog.getByLabel("Cast at rank").selectOption("1:slot");
  await secondDialog.getByRole("button", { name: "Cast spell" }).click();
  const rankOneRow = page
    .locator(".sheet-slots .sheet-slot-row:not(.slot-row-font)")
    .filter({ hasText: "Rank 1" });
  await expect(rankOneRow).toContainText("2 / 3");

  await page.getByRole("button", { name: "Long rest" }).click();
  const restDialog = page.getByRole("dialog", { name: "Take a long rest" });
  await restDialog.getByRole("button", { name: "Take long rest" }).click();
  const prepDialog = page.getByRole("dialog", { name: "Daily preparations" });
  await expect(prepDialog).toBeVisible({ timeout: 15_000 });
  await expect(prepDialog.getByText("Preparations pending")).toBeVisible();
  await expect(prepDialog.getByLabel("Spell to prepare at rank 1")).toBeVisible();

  await prepDialog.getByRole("button", { name: "Decrease prepared Bless at rank 1" }).click();
  await prepDialog.getByLabel("Spell to prepare at rank 1").selectOption({ label: "Heal" });
  await prepDialog.getByRole("button", { name: "Prepare selected spell at rank 1" }).click();
  await prepDialog.getByRole("button", { name: "Apply daily preparations" }).click();
  await expect(prepDialog).toHaveCount(0);
  await expect(page.getByText("Daily preparations complete.")).toBeVisible({ timeout: 15_000 });
  await expect(healRow.getByTestId("sheet-prepared-heal")).toContainText("Prepared ×7");
  await expect(healRow.getByTestId("sheet-prepared-ranks-heal")).toContainText(
    "rank 1 ordinary ×2"
  );
});

test("level-9 Wizard upcasts Fireball into a rank-5 prepared slot", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const campaignId = campaignPath.split("/").filter(Boolean).pop();
  expect(campaignId).toBeTruthy();
  const created = await page.request.post("/api/characters", {
    data: { name: "E2E Wizard 9", campaignId },
  });
  expect(created.status()).toBe(201);
  const { character } = (await created.json()) as { character: { id: string } };
  const fireball = "spell:sxQZ6yqTn0czJxVd";
  const light = "spell:WBmvzNDfpwka3qT4";
  const data = {
    name: "E2E Wizard 9",
    ancestryId: "anc:IiG7DgeLWYrSNXuX",
    heritageId: "her:zVf0Hlp5xG0Q7kmc",
    backgroundId: "bg:CAjQrHZZbALE7Qjy",
    classId: "cls:RwjIZzIxzPpUglnK",
    keyAbility: "int",
    level: 9,
    spells: {
      tradition: "arcane",
      cantrips: [light],
      known: [fireball],
      prepared: [],
      preparedByRank: {},
      focus: [],
      divineFontUsed: 0,
      slotsUsed: {},
      preparedUsed: {},
      fontUsed: {},
    },
  };
  const save = await page.request.put(`/api/characters/${character.id}`, { data: { data } });
  expect(save.ok()).toBe(true);

  await page.goto(`/characters/${character.id}/edit`);
  await expect(page.getByRole("heading", { name: "E2E Wizard 9" })).toBeVisible({
    timeout: 15_000,
  });
  await goToStep(page, "Spells");

  const fireballRow = page.getByRole("group", { name: "Fireball spellbook row" });
  const rankSelect = fireballRow.getByRole("combobox", { name: "Preparation rank for Fireball" });
  await expect(rankSelect.locator("option")).toHaveText(["Rank 3 (base)", "Rank 4", "Rank 5"]);
  await rankSelect.selectOption("5");
  await fireballRow.getByRole("button", { name: "Prepare Fireball at rank 5" }).click();
  await expect(page.getByTestId("rank-summary-5")).toContainText("1 / 3 prepared");
  const preparedRankFive = page.getByTestId("prepared-rank-5");
  await expect(preparedRankFive.getByTestId("prepared-5-fireball")).toContainText("base rank 3");

  await page.getByRole("link", { name: "Open character sheet" }).click();
  await expect(page.getByRole("heading", { name: "E2E Wizard 9" })).toBeVisible({
    timeout: 15_000,
  });
  const fireballSheetRow = page.getByTestId("sheet-spell-fireball");
  await expect(fireballSheetRow.getByTestId("sheet-prepared-fireball")).toContainText("Prepared");
  await expect(fireballSheetRow.getByTestId("sheet-prepared-ranks-fireball")).toContainText(
    "rank 5 ordinary ×1"
  );

  await fireballSheetRow.getByRole("button", { name: "Cast Fireball" }).click();
  const dialog = page.getByRole("dialog", { name: "Cast Fireball" });
  await expect(dialog.getByText("Rank 5 · Rank 5 slot · 1 left")).toBeVisible();
  await expect(dialog.getByText(/1 rank 5 slot/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cast spell" }).click();
  await expect(
    page.locator(".sheet-slots .sheet-slot-row").filter({ hasText: "Rank 5" })
  ).toContainText("2 / 3");
});

test("sheet tracks afflictions with stages and stage saves", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const created = await page.request.post("/api/characters", {
    data: { name: "E2E Affliction" },
  });
  expect(created.status()).toBe(201);
  const { character } = (await created.json()) as { character: { id: string } };

  await page.goto(`/characters/${character.id}`);
  await expect(page.getByRole("heading", { name: "E2E Affliction" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Add affliction" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add affliction" });
  await addDialog.getByLabel("Name").fill("Giant Spider Venom");
  await addDialog.getByLabel("Affliction type").selectOption("poison");
  await addDialog.getByLabel("DC").fill("18");
  await addDialog.getByLabel("Current stage").fill("1");
  await addDialog.getByLabel("Maximum stage").fill("3");
  await addDialog.getByLabel("Affliction onset").fill("1 round");
  await addDialog.getByLabel("Affliction stage interval").fill("1 round");
  await addDialog
    .getByLabel("Stage effects / notes")
    .fill("Stage 1: clumsy 1. Stage 2: clumsy 2 and drained 1.");
  await addDialog.getByRole("button", { name: "Save affliction" }).click();

  const row = page.locator(".affliction-row").filter({ hasText: "Giant Spider Venom" });
  await expect(row).toContainText("Stage 1 / 3");
  await expect(row).toContainText("DC 18");
  await expect(row).toContainText("Fortitude");
  await expect(row).toContainText("onset 1 round");
  await expect(row).toContainText("onset in 1 round");
  await expect(row).toContainText("next save in 1 round");

  await row.getByRole("button", { name: "Increase stage of Giant Spider Venom" }).click();
  await expect(row).toContainText("Stage 2 / 3");
  await row.getByRole("button", { name: "Reduce stage of Giant Spider Venom" }).click();
  await expect(row).toContainText("Stage 1 / 3");

  // An uncampaigned sheet rolls locally, so a fixed d20 exercises the
  // stage-save callback without depending on the server's randomness.
  await page.evaluate(() => {
    Math.random = () => 0.5;
  });
  await row.getByRole("button", { name: "Roll stage save for Giant Spider Venom" }).click();
  await expect(row).toContainText("Stage 2 / 3");
  await expect(row).not.toContainText("onset in 1 round");
  await expect(row).toContainText("next save in 1 round");

  await row.getByRole("button", { name: "Reset timers for Giant Spider Venom" }).click();
  await expect(row).toContainText("onset in 1 round");

  await row.getByRole("button", { name: "Edit Giant Spider Venom" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit affliction" });
  await editDialog.getByLabel("DC").fill("20");
  await editDialog.getByRole("button", { name: "Save affliction" }).click();
  await expect(row).toContainText("DC 20");

  await row.getByRole("button", { name: "End Giant Spider Venom" }).click();
  await expect(page.locator(".affliction-row")).toHaveCount(0);
});

test("sheet rolls dying recovery and persistent damage end-of-turn checks", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const created = await page.request.post("/api/characters", {
    data: { name: "E2E Dying" },
  });
  expect(created.status()).toBe(201);
  const { character } = (await created.json()) as { character: { id: string } };
  const saved = await page.request.put(`/api/characters/${character.id}`, {
    data: {
      data: {
        name: "E2E Dying",
        level: 1,
        classId: "cls:8zn3cD6GSmoo1LW4",
        keyAbility: "str",
      },
    },
  });
  expect(saved.ok()).toBe(true);

  await page.goto(`/characters/${character.id}`);
  await expect(page.getByRole("heading", { name: "E2E Dying" })).toBeVisible({
    timeout: 15_000,
  });

  const hpInput = page.getByLabel("Current hit points");
  await hpInput.fill("0");
  await hpInput.blur();
  const dyingPanel = page.locator(".dying-recovery");
  await expect(dyingPanel).toContainText("Dying 1");
  await expect(dyingPanel).toContainText("Recovery check DC 11");

  await page.getByRole("button", { name: "Use Heroic Recovery" }).click();
  await expect(dyingPanel).toHaveCount(0);
  await expect(page.locator(".conditions-list").getByText("Unconscious")).toBeVisible();
  await expect(page.locator(".conditions-list").getByText("Wounded 1")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Set hero points to 1" })).toHaveAttribute(
    "aria-pressed",
    "false"
  );

  await hpInput.fill("10");
  await hpInput.blur();
  await hpInput.fill("0");
  await hpInput.blur();
  await expect(dyingPanel).toContainText("Dying 1");

  await page.evaluate(() => {
    Math.random = () => 0.5;
  });
  await page.getByRole("button", { name: "Roll dying recovery check" }).click();
  await expect(page.locator(".dying-recovery")).toHaveCount(0);
  await expect(page.locator(".conditions-list").getByText("Wounded 1")).toBeVisible();

  await hpInput.fill("10");
  await hpInput.blur();
  await page.getByLabel("Persistent damage formula").fill("1d6");
  await page.getByLabel("Persistent damage type").fill("fire");
  await page.getByRole("button", { name: "Add persistent" }).click();
  const persistentRow = page.locator(".persistent-damage-row").filter({ hasText: "1d6 fire" });
  await expect(persistentRow).toBeVisible();
  await expect(persistentRow).toContainText("DC 15");

  await page.evaluate(() => {
    Math.random = () => 0.999;
  });
  await page.getByRole("button", { name: "End turn for all persistent damage" }).click();
  await expect(page.locator(".persistent-damage-row")).toHaveCount(0);
  await expect(hpInput).toHaveValue("4");

  await page.getByLabel("Fast healing", { exact: true }).fill("5");
  await page.getByLabel("Regeneration", { exact: true }).fill("10");
  await page.getByLabel("Regeneration suppressed by").fill("fire, acid");
  await page.getByLabel("Quick damage type").fill("fire");
  await page.getByRole("button", { name: "Decrease hit points by 1" }).click();
  await expect(page.locator(".conditions-list").getByText("Regeneration Suppressed")).toBeVisible();
  await expect(page.locator(".save-indicator")).toContainText("Saved", { timeout: 15_000 });

  await page.reload();
  await expect(page.getByRole("heading", { name: "E2E Dying" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel("Fast healing", { exact: true })).toHaveValue("5");
  await expect(page.getByLabel("Regeneration", { exact: true })).toHaveValue("10");
  await expect(page.getByLabel("Regeneration suppressed by")).toHaveValue("fire, acid");
  await expect(page.locator(".conditions-list").getByText("Regeneration Suppressed")).toBeVisible();

  await page.getByRole("switch", { name: "Regeneration suppressed" }).click();
  await expect(page.locator(".conditions-list").getByText("Regeneration Suppressed")).toHaveCount(
    0
  );
});

test("player requests a level-up and the GM approves it", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await signIn(page, importer);
  await page.goto(`${campaignPath}?tab=party`);
  const heroCard = page.locator(".party-card").filter({ hasText: "Pathbuilder E2E Hero" });
  await expect(heroCard).toContainText("Level 1", { timeout: 15_000 });

  await heroCard.getByRole("button", { name: "Request level up" }).click();
  await expect(page.getByText(/Level-up request sent for Pathbuilder E2E Hero/)).toBeVisible({
    timeout: 15_000,
  });
  const playerRequests = page.locator(".request-card");
  await expect(playerRequests.getByText("Level up Pathbuilder E2E Hero to level 2")).toBeVisible();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, admin);
  await adminPage.goto(`${campaignPath}?tab=party`);
  const adminRequests = adminPage.locator(".request-card");
  await expect(adminRequests.getByText("Level up Pathbuilder E2E Hero to level 2")).toBeVisible({
    timeout: 15_000,
  });
  await adminRequests.getByRole("button", { name: "Review" }).click();

  const review = adminPage.getByRole("dialog", { name: "Review request" });
  await expect(review).toBeVisible();
  await expect(review).toContainText("Pathbuilder E2E Hero advances from level 1 to level 2.");
  await review.getByLabel("GM note (optional)").fill("Approved for the milestone.");
  await review.getByRole("button", { name: "Approve" }).click();
  await expect(
    adminPage.getByText("Approved: Level up Pathbuilder E2E Hero to level 2.")
  ).toBeVisible({ timeout: 15_000 });

  await expect(heroCard).toContainText("Level 2", { timeout: 15_000 });
  await expect(playerRequests.getByText("Approved").first()).toBeVisible();
  await expect(playerRequests.getByText(/Approved by E2E GM/)).toBeVisible();

  await adminContext.close();
});

test("player requests downtime and proposes a journal entry for GM approval", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await signIn(page, importer);
  await page.goto(`${campaignPath}?tab=party`);
  const heroCard = page.locator(".party-card").filter({ hasText: "Pathbuilder E2E Hero" });
  await expect(heroCard).toContainText("Level 2", { timeout: 15_000 });

  await heroCard.getByRole("button", { name: "Request downtime" }).click();
  const downtimeDialog = page.getByRole("dialog", { name: "Request downtime" });
  await expect(downtimeDialog).toBeVisible();
  await downtimeDialog.getByLabel("Downtime days").fill("3");
  await downtimeDialog
    .getByLabel("What do you want to do? (optional)")
    .fill("Craft a striking rune.");
  await downtimeDialog.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Downtime request sent to the GM.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".request-card").getByText("Grant 3 downtime days")).toBeVisible();

  await page.goto(`${campaignPath}?tab=journal`);
  await page.getByRole("button", { name: "Propose entry" }).click();
  const journalDialog = page.getByRole("dialog", { name: "Propose a journal entry" });
  await expect(journalDialog).toBeVisible();
  await journalDialog.getByLabel("Title").fill("E2E Player Recap");
  await journalDialog.getByLabel("Entry").fill("We held the Sunken Gate until dawn.");
  await journalDialog.getByRole("button", { name: "Send to GM" }).click();
  await expect(page.getByText("Journal entry sent to the GM for approval.")).toBeVisible({
    timeout: 15_000,
  });

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, admin);
  await adminPage.goto(`${campaignPath}?tab=party`);
  const adminRequests = adminPage.locator(".request-card");
  const downtimeRow = adminRequests
    .locator(".request-row")
    .filter({ hasText: "Grant 3 downtime days" });
  await expect(downtimeRow).toBeVisible({ timeout: 15_000 });
  await downtimeRow.getByRole("button", { name: "Review" }).click();
  const review = adminPage.getByRole("dialog", { name: "Review request" });
  await expect(review).toContainText("3 downtime days for Pathbuilder E2E Hero.");
  await review.getByRole("button", { name: "Approve" }).click();
  await expect(adminPage.getByText("Approved: Grant 3 downtime days.")).toBeVisible({
    timeout: 15_000,
  });

  const journalRow = adminRequests.locator(".request-row").filter({ hasText: "E2E Player Recap" });
  await expect(journalRow).toBeVisible();
  await journalRow.getByRole("button", { name: "Review" }).click();
  await expect(review).toContainText("We held the Sunken Gate until dawn.");
  await review.getByLabel("GM note (optional)").fill("Canon now.");
  await review.getByRole("button", { name: "Approve" }).click();
  await expect(adminPage.getByText("Approved: E2E Player Recap.")).toBeVisible({
    timeout: 15_000,
  });

  await expect(page.getByText("E2E Player Recap")).toBeVisible({ timeout: 15_000 });
  await page.goto(`${campaignPath}?tab=party`);
  await expect(heroCard.locator(".party-stats").getByText("3 d")).toBeVisible({
    timeout: 15_000,
  });

  await adminContext.close();
});

test("account lists active sessions and can sign out other devices", async ({ page, browser }) => {
  await signIn(page, admin);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Active sessions" })).toBeVisible();
  await expect(page.locator(".account-session").filter({ hasText: "This device" })).toBeVisible();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await signIn(secondPage, admin);
  await page.reload();
  await expect(page.locator(".account-session").filter({ hasText: "This device" })).toBeVisible();
  await expect(page.locator(".account-session")).not.toHaveCount(1);

  await page.getByRole("button", { name: "Sign out other devices" }).click();
  await expect(page.getByText(/Signed out \d+ other device/)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".account-session")).toHaveCount(1);
  const me = await secondPage.request.get("/api/auth/me");
  expect(await me.json()).toEqual({ user: null });

  await secondContext.close();
});

test("administrator suspends an account and revokes its sessions", async ({ page }) => {
  await signIn(page, admin);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  const importerRow = page.locator(".admin-user-row").filter({ hasText: "E2E Importer" });
  await expect(importerRow).toBeVisible({ timeout: 15_000 });

  page.once("dialog", (dialog) => dialog.accept("E2E moderation check"));
  await importerRow.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("E2E Importer suspended.")).toBeVisible({ timeout: 15_000 });
  await expect(importerRow.getByText("Suspended", { exact: true })).toBeVisible();
  await expect(importerRow.getByText("Reason: E2E moderation check")).toBeVisible();

  const blocked = await page.request.post("/api/auth/login", {
    data: { username: importer.username, password: importer.password },
  });
  expect(blocked.status()).toBe(403);

  page.once("dialog", (dialog) => dialog.accept());
  await importerRow.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("E2E Importer can sign in again.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(importerRow.getByText("Suspended", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Reason: E2E moderation check")).toHaveCount(0);
});

test("GM creates victory-point clocks and players see shared progress", async ({
  page,
  browser,
}) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=clocks`);
  await expect(page.getByRole("heading", { name: "Clocks & progress tracks" })).toBeVisible();

  await page.getByRole("button", { name: "Add clock" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add clock" });
  await dialog.getByLabel("Clock name").fill("E2E Ritual Clock");
  await dialog
    .getByLabel("Description (optional)")
    .fill("Light the four braziers before the eclipse.");
  await dialog.locator("select").selectOption("6");
  await dialog.getByRole("button", { name: "Create clock" }).click();

  const card = page.locator(".clock-card").filter({ hasText: "E2E Ritual Clock" });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: "Add one segment to E2E Ritual Clock" }).click();
  await card.getByRole("button", { name: "Add one segment to E2E Ritual Clock" }).click();
  await expect(card.getByRole("img", { name: /2 of 6 segments filled/ })).toBeVisible();
  await expect(card.getByText("2 / 6 filled")).toBeVisible();

  await page.getByRole("button", { name: "Add clock" }).click();
  const hiddenDialog = page.getByRole("dialog", { name: "Add clock" });
  await hiddenDialog.getByLabel("Clock name").fill("E2E Hidden Clock");
  await hiddenDialog.getByLabel("Show this clock to players").uncheck();
  await hiddenDialog.getByRole("button", { name: "Create clock" }).click();
  await expect(page.locator(".clock-card").filter({ hasText: "E2E Hidden Clock" })).toBeVisible({
    timeout: 15_000,
  });

  const playerContext = await browser.newContext();
  const playerPage = await playerContext.newPage();
  await signIn(playerPage, importer);
  await playerPage.goto(`${campaignPath}?tab=clocks`);
  await expect(playerPage.getByRole("heading", { name: "Clocks & progress tracks" })).toBeVisible();
  await expect(
    playerPage.locator(".clock-card").filter({ hasText: "E2E Ritual Clock" })
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    playerPage.locator(".clock-card").filter({ hasText: "E2E Hidden Clock" })
  ).toHaveCount(0);
  await expect(playerPage.getByRole("button", { name: "Add clock" })).toHaveCount(0);

  await playerContext.close();
});

test("GM enables Free Archetype and a character fills an extra archetype slot", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=settings`);
  await page.getByLabel("Free Archetype variant").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Campaign settings saved.")).toBeVisible({ timeout: 15_000 });

  const campaignId = campaignPath.split("/").pop();
  const detailsResponse = await page.request.get(`/api/campaigns/${campaignId}`);
  expect(detailsResponse.ok()).toBe(true);
  const details = (await detailsResponse.json()) as {
    characters: { id: string; name: string }[];
  };
  const hero = details.characters.find((character) => character.name === "E2E Hero");
  expect(hero).toBeTruthy();

  await page.goto(`/characters/${hero!.id}/edit`);
  await expect(page.getByRole("heading", { name: "E2E Hero" })).toBeVisible({ timeout: 15_000 });
  await goToStep(page, "Feats");
  const slot = page.locator(".feat-slot").filter({ hasText: "Free archetype feat" }).first();
  await expect(slot).toBeVisible();
  await slot.getByRole("button", { name: "Choose" }).click();
  await expect(page.getByRole("heading", { name: "Choose a free archetype feat" })).toBeVisible();
  await page.getByPlaceholder(/Search feats/).fill("Archer Dedication");
  await page
    .locator(".picker-item-name", { hasText: /^Archer Dedication$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Take Archer Dedication" }).click();
  await expect(slot).toContainText("Archer Dedication");
});

test("GM enables Automatic Bonus Progression and a character chooses its skill", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=settings`);
  await page.getByLabel("Automatic Bonus Progression").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Campaign settings saved.")).toBeVisible({ timeout: 15_000 });

  const campaignId = campaignPath.split("/").pop();
  const detailsResponse = await page.request.get(`/api/campaigns/${campaignId}`);
  const details = (await detailsResponse.json()) as {
    characters: { id: string; name: string }[];
  };
  const hero = details.characters.find((character) => character.name === "E2E Hero");
  expect(hero).toBeTruthy();

  await page.goto(`/characters/${hero!.id}/edit`);
  await expect(page.getByRole("heading", { name: "E2E Hero" })).toBeVisible({ timeout: 15_000 });
  await goToStep(page, "Feats");
  await expect(page.getByText("Automatic skill potency")).toBeVisible();
  await page.getByLabel("Skill potency").selectOption("athletics");
  await expect(page.getByLabel("Skill potency")).toHaveValue("athletics");
});
