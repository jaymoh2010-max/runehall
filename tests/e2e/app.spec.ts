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
  await expect(builderChecklist.getByText("Choose an ancestry.")).toBeVisible();
  await expect(builderChecklist.getByText(/required choices? remaining/)).toBeVisible();

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
  await page.getByRole("button", { name: "Grant downtime" }).click();
  const downtimeDialog = page.getByRole("dialog", { name: "Grant downtime" });
  await expect(downtimeDialog).toBeVisible();
  await downtimeDialog.getByLabel("Downtime days").fill("3");
  await downtimeDialog.getByRole("button", { name: "Grant downtime" }).click();
  await expect(page.getByText(/Granted 3 downtime days/)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".party-stats").getByText("3 d")).toBeVisible();
});

test("GM awards XP in XP tracking mode without automatic level-up", async ({ page }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=settings`);
  await page.getByLabel("Advancement").selectOption({ label: "XP tracking (GM levels up)" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Campaign settings saved.")).toBeVisible();

  await page
    .locator(".campaign-tabs")
    .getByRole("button", { name: /^Party/ })
    .click();
  await page.getByRole("button", { name: "Award XP", exact: true }).click();
  const xpDialog = page.getByRole("dialog", { name: "Award XP" });
  await expect(xpDialog).toBeVisible();
  await xpDialog.getByLabel("XP amount").fill("1000");
  await xpDialog.getByRole("button", { name: "Award XP", exact: true }).click();

  await expect(page.getByText(/Awarded 1000 XP/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Ready to level")).toBeVisible();
  await expect(page.getByText(/Level 2/).first()).toBeVisible();
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
  await dialog.getByRole("button", { name: "Schedule session" }).click();
  await expect(page.getByText("Session scheduled.")).toBeVisible();

  const card = page.locator(".session-card").filter({ hasText: "E2E Overdue Session" });
  await expect(card.getByText("Overdue", { exact: true })).toBeVisible();
  await expect(card.getByText("Check-in", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Mark played" })).toBeVisible();

  await page
    .locator(".campaign-tabs")
    .getByRole("button", { name: /^Overview/ })
    .click();
  const nextCard = page.locator(".dashboard-next");
  await expect(nextCard.getByRole("heading", { level: 3 })).not.toHaveText("Not scheduled");
  await expect(nextCard.getByRole("button", { name: "Schedule in Sessions" })).toBeVisible();
  await expect(nextCard.locator('input[type="datetime-local"]')).toHaveCount(0);
});

test("lazy library, compendium entry, rules, and account routes load", async ({ page }) => {
  await signIn(page, admin);
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

  await page.getByRole("button", { name: "Spells" }).click();
  await page.getByPlaceholder(/Search spells/).fill("Fireball");
  const spellRow = page.getByRole("button", { name: /Fireball/ }).first();
  await expect(spellRow).toBeVisible();
  await spellRow.click();
  await page.getByRole("link", { name: "Open full page" }).click();
  await expect(page).toHaveURL(/\/library\/spell\//);
  await expect(page.getByRole("heading", { name: "Fireball", level: 1 })).toBeVisible();

  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "Rules at the table" })).toBeVisible();

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account and security" })).toBeVisible();
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

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, admin);
  await adminPage.goto(`${campaignPath}?tab=settings`);
  await expect(adminPage.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(adminPage.getByText(player.displayName)).toBeVisible();

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

  await adminContext.close();
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
  await page.getByRole("button", { name: "Walls", exact: true }).click();

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
  await expect(page.getByRole("heading", { name: "E2E Fighter" })).toBeVisible();
  await expect(page.getByText("Fighter").first()).toBeVisible();
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
  await addDialog.getByLabel("Onset").fill("1 round");
  await addDialog.getByLabel("Stage interval").fill("1 round");
  await addDialog
    .getByLabel("Stage effects / notes")
    .fill("Stage 1: clumsy 1. Stage 2: clumsy 2 and drained 1.");
  await addDialog.getByRole("button", { name: "Save affliction" }).click();

  const row = page.locator(".affliction-row").filter({ hasText: "Giant Spider Venom" });
  await expect(row).toContainText("Stage 1 / 3");
  await expect(row).toContainText("DC 18");
  await expect(row).toContainText("Fortitude");
  await expect(row).toContainText("onset 1 round");

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

  await row.getByRole("button", { name: "Edit Giant Spider Venom" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit affliction" });
  await editDialog.getByLabel("DC").fill("20");
  await editDialog.getByRole("button", { name: "Save affliction" }).click();
  await expect(row).toContainText("DC 20");

  await row.getByRole("button", { name: "End Giant Spider Venom" }).click();
  await expect(page.locator(".affliction-row")).toHaveCount(0);
});
