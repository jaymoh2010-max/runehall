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
  test.setTimeout(60_000);
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

  await expect(page.locator(".pb-sheet-page")).toBeVisible();
  await expect(page.getByText("Character plan")).toBeVisible();
  await expect(page.locator(".pb-plan-level-head").filter({ hasText: "Level 1" })).toBeVisible();
  await page.getByRole("button", { name: "Show all 20 levels" }).click();
  await expect(page.locator(".pb-plan-level-head").filter({ hasText: "Level 20" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Weapons", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gear", exact: true })).toBeVisible();
  const athleticsRow = page.locator(".pb-skill-row").filter({ hasText: "Athletics" });
  await athleticsRow.getByRole("button", { name: "Roll Athletics" }).click();
  await expect(page.getByText(/Athletics:/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Gear", exact: true }).click();
  await expect(page.getByPlaceholder("Search the item database")).toBeVisible();
  await page.getByPlaceholder("Search the item database").fill("Backpack");
  const backpackRow = page.locator(".pb-item-row").filter({ hasText: "Backpack" }).first();
  await expect(backpackRow).toBeVisible({
    timeout: 15_000,
  });
  await backpackRow.getByRole("link").click();
  const itemPreview = page.getByRole("dialog", { name: "Item" });
  await expect(itemPreview).toBeVisible();
  await expect(itemPreview.locator(".compendium-detail h2")).toContainText("Backpack");
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
  await page.keyboard.press("Escape");
  await expect(itemPreview).toBeHidden();

  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByPlaceholder("Search actions").fill("Stride");
  await expect(page.locator(".pb-action-row").filter({ hasText: "Stride" }).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByLabel("Notes").fill("E2E sheet notes");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved.")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Edit build" }).click();
  await expect(page.getByLabel("Character name")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Back to sheet" }).click();
  await expect(page.locator(".pb-sheet-page")).toBeVisible({ timeout: 15_000 });
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

  await page.getByRole("tab", { name: "Domains" }).click();
  await expect(page).toHaveURL(/tab=domains/);
  await page.getByPlaceholder(/Search domains/).fill("Air");
  await page.getByRole("button", { name: /Air/ }).first().click();
  await expect(page.getByRole("heading", { name: "Air", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pushing Gust" })).toBeVisible();

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

test("player sees the core table without GM tools", async ({ page, browser }) => {
  await signIn(page, importer);
  await page.goto(campaignPath);
  await expect(page.getByText("Player's table")).toBeVisible();
  for (const tab of ["Table", "Party", "Journal", "Settings"]) {
    await expect(
      page.locator(".campaign-tabs").getByRole("button", { name: new RegExp(`^${tab}`) })
    ).toBeVisible();
  }

  await page.goto(campaignPath + "?tab=table");
  await expect(page.getByRole("heading", { name: "The First Step" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add token", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bestiary", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "My sheet", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "My sheet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pathbuilder E2E Hero" })).toBeVisible();
  await page.getByRole("button", { name: "Feats", exact: true }).click();
  const overlayFeat = page.locator(".pb-feat-row").filter({ hasText: "Toughness" });
  await expect(overlayFeat).toBeVisible();
  await overlayFeat.getByRole("link").click();
  const overlayPreview = page.getByRole("dialog", { name: "Feat" });
  await expect(overlayPreview).toBeVisible();
  await expect(overlayPreview.locator(".compendium-detail h2")).toContainText("Toughness");
  await overlayPreview.locator(".modal-foot").getByRole("button", { name: "Close" }).click();
  await expect(overlayPreview).toBeHidden();
  await expect(page.getByRole("button", { name: "Minimize sheet" })).toBeVisible();
  await page.getByRole("button", { name: "Minimize sheet" }).click();
  await expect(page.getByRole("heading", { name: "The First Step" })).toBeVisible();

  await page.goto(campaignPath + "?tab=party");
  await expect(page.getByRole("heading", { name: "Who's at the table?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sheet" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Level up" })).toHaveCount(0);

  await page.goto(campaignPath + "?tab=settings");
  await expect(page.getByLabel("Free Archetype variant")).toBeDisabled();
  await expect(page.getByLabel("Automatic Bonus Progression")).toBeDisabled();
  const forbiddenVariant = await page.request.patch(
    `/api/campaigns/${campaignPath.split("/").pop()}`,
    { data: { freeArchetype: true, automaticBonusProgression: true } }
  );
  expect(forbiddenVariant.status()).toBe(403);

  const characterList = await page.request.get(
    `/api/characters?campaignId=${campaignPath.split("/").pop()}`
  );
  const ownedCharacters = (await characterList.json()) as {
    characters: { id: string; name: string }[];
  };
  const gmHero = ownedCharacters.characters.find((entry) => entry.name === "E2E Hero");
  expect(gmHero).toBeTruthy();
  await page.goto(`/characters/${gmHero!.id}`);
  await expect(page.getByLabel("Current hit points")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit build" })).toHaveCount(0);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByText("This sheet is read-only.")).toBeVisible();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, admin);
  await adminPage.goto(campaignPath + "?tab=settings");
  await expect(adminPage.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(
    adminPage.locator(".member-list").getByText(importer.displayName).first()
  ).toBeVisible();

  await adminPage.goto(campaignPath + "?tab=table");
  await expect(adminPage.getByRole("button", { name: "Add token", exact: true })).toBeVisible();
  await expect(adminPage.getByRole("button", { name: "Bestiary", exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Status", exact: true }).click();
  const conditionList = page.locator(".pb-condition-list");
  await expect(conditionList.getByText("Dying", { exact: false })).toBeVisible();
  await expect(conditionList.getByText("Unconscious", { exact: false })).toBeVisible();

  await page.getByLabel("Condition name").fill("Frightened");
  await page.getByLabel("Condition value").fill("2");
  await page.locator(".pb-condition-form").getByRole("button", { name: "Add" }).click();
  await expect(conditionList.getByText("Frightened 2", { exact: false })).toBeVisible();

  await hpInput.fill("1");
  await hpInput.press("Enter");
  await expect(conditionList.getByText("Wounded 1", { exact: false })).toBeVisible();
  await expect(page.locator(".pb-save")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pathbuilder E2E Hero" })).toBeVisible();
  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(
    page.locator(".pb-condition-list").getByText("Wounded 1", { exact: false })
  ).toBeVisible();

  const hpBefore = await page.request.get(`/api/characters/${characterId}`);
  const hpRecord = (await hpBefore.json()) as { character: { summary: { hp: number } } };
  const expectedHp = Math.min(hpRecord.character.summary.hp, 16);
  const increaseHp = page.getByRole("button", { name: "+5", exact: true });
  for (let click = 0; click < 3; click += 1) await increaseHp.click();
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/characters/${characterId}`);
      const record = (await response.json()) as {
        character: { summary: { currentHp: number } };
      };
      return record.character.summary.currentHp;
    })
    .toBe(expectedHp);
  await expect(hpInput).toHaveValue(String(expectedHp));

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

test("players buy gear and only grant it when the GM allows", async ({ page, browser }) => {
  await signIn(page, admin);
  await page.goto(`${campaignPath}?tab=settings`);
  await page.getByLabel("Players may add gear without paying").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Campaign settings saved.")).toBeVisible({ timeout: 15_000 });

  const campaignId = campaignPath.split("/").pop();
  const list = await page.request.get(`/api/characters?campaignId=${campaignId}`);
  const characters = (await list.json()) as { characters: { id: string; name: string }[] };
  const hero = characters.characters.find((entry) => entry.name === "Pathbuilder E2E Hero");
  expect(hero).toBeTruthy();

  const playerContext = await browser.newContext();
  const playerPage = await playerContext.newPage();
  await signIn(playerPage, importer);
  await playerPage.goto(`/characters/${hero!.id}`);
  await playerPage.getByRole("button", { name: "Gear", exact: true }).click();
  await playerPage.getByPlaceholder("Search the item database").fill("Backpack");
  const row = playerPage.locator(".pb-item-row").filter({ hasText: "Backpack" }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole("button", { name: "Grant" })).toBeVisible();

  await row.getByRole("button", { name: "Buy" }).click();
  await expect(playerPage.getByText(/Bought 1× Backpack/)).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "Grant" }).click();
  await expect(playerPage.getByText(/Granted 1× Backpack/)).toBeVisible({ timeout: 15_000 });
  await expect(
    playerPage.locator(".pb-inventory-row").filter({ hasText: "Backpack" }).first()
  ).toContainText("×3");
  await playerContext.close();

  await page.reload();
  await page.getByLabel("Players may add gear without paying").uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Campaign settings saved.")).toBeVisible({ timeout: 15_000 });

  const checkContext = await browser.newContext();
  const checkPage = await checkContext.newPage();
  await signIn(checkPage, importer);
  await checkPage.goto(`/characters/${hero!.id}`);
  await checkPage.getByRole("button", { name: "Gear", exact: true }).click();
  await checkPage.getByPlaceholder("Search the item database").fill("Backpack");
  const checkRow = checkPage.locator(".pb-item-row").filter({ hasText: "Backpack" }).first();
  await expect(checkRow).toBeVisible({ timeout: 15_000 });
  await expect(checkRow.getByRole("button", { name: "Grant" })).toHaveCount(0);
  await checkContext.close();
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
  await expect(page.locator(".core-connection")).toHaveClass(/is-online/, {
    timeout: 15_000,
  });

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

  const initiativeControls = page.locator(".initiative-gm-menu");
  await initiativeControls.getByRole("button", { name: "GM", exact: true }).click();
  await page.getByRole("menuitem", { name: "Roll initiative" }).click();
  await expect(page.locator(".initiative-chip.is-active")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".action-pip")).toHaveCount(0);
  const roundBefore = Number((await page.locator(".initiative-round strong").textContent()) ?? "0");
  await initiativeControls.getByRole("button", { name: "GM", exact: true }).click();
  await page.getByRole("menuitem", { name: /End round/ }).click();
  await expect(page.locator(".initiative-round strong")).toHaveText(String(roundBefore + 1));

  await page.getByRole("button", { name: /E2E Hero, character token/ }).click();
  const quickPanel = page.locator(".core-token-panel");
  await expect(quickPanel).toBeVisible();
  await expect(quickPanel.getByLabel("Current hit points")).toBeVisible();
  await quickPanel.getByRole("button", { name: "Open sheet" }).click();
  await expect(page.getByRole("heading", { name: "E2E Hero" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Minimize sheet" })).toBeVisible();
  await page.getByRole("button", { name: "Minimize sheet" }).click();
  await expect(page.getByRole("heading", { name: "The First Step" })).toBeVisible();

  await page.getByPlaceholder(/Message the table/).fill("E2E table hello");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("E2E table hello")).toBeVisible();

  await page.getByRole("button", { name: "Dice tray" }).click();
  await page.getByPlaceholder("1d20+5").fill("1d20");
  await page.getByPlaceholder("Perception").fill("E2E roll");
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await page.getByRole("button", { name: "Table talk" }).click();
  await expect(page.locator(".chat-roll").getByText("E2E roll", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Scenes" }).click();
  const scenes = page.getByRole("dialog", { name: "Scenes" });
  await expect(scenes).toBeVisible();

  await scenes.getByRole("button", { name: "New scene" }).click();
  await expect(scenes.getByText("Map library")).toBeVisible();
  const builtinCard = scenes.getByRole("button", { name: /The Wooden Duck/ });
  await expect(builtinCard).toBeVisible();
  await builtinCard.click();
  await expect(scenes.getByLabel("Scene name")).toHaveValue("The Wooden Duck");
  await scenes.getByRole("button", { name: "Create scene" }).click();
  await expect(scenes).toBeHidden();
  await expect(page.getByRole("heading", { name: "The Wooden Duck" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Scenes" }).click();
  await expect(scenes).toBeVisible();
  await scenes.getByRole("button", { name: "Edit" }).first().click();
  const sceneEditor = page.getByRole("dialog", { name: /Edit/ });
  await expect(sceneEditor.getByText("Grid calibration")).toBeVisible();
  await expect(sceneEditor.getByLabel("Grid size in pixels")).toHaveValue("70");
  await page.keyboard.press("Escape");
  await expect(sceneEditor).toBeHidden();

  await page.locator("summary").filter({ hasText: "Soundtrack" }).click();
  await page.getByRole("button", { name: "Show soundtrack" }).click();
  await expect(page.getByRole("button", { name: "Upload audio" })).toBeVisible();
});

test("GM adds an elite monster token from the bestiary", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await page.goto(campaignPath);
  await expect(page.locator(".core-connection")).toHaveClass(/is-online/, { timeout: 15_000 });
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
  const quickPanel = page.locator(".core-token-panel");
  await expect(quickPanel).toBeVisible();
  await expect(quickPanel).toContainText("Goblin Warrior (Elite)");
  await expect(quickPanel.getByLabel("Armor class")).toBeVisible();
  await expect(quickPanel.getByRole("button", { name: "Add to initiative" })).toBeVisible();
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
  await page.getByRole("button", { name: "Spells", exact: true }).click();
  await expect(page.getByRole("link", { name: /Bless/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Heal/ }).first()).toBeVisible();
  await expect(page.locator(".pb-stat-grid").getByText("Spell DC")).toBeVisible();
  const fontRow = page.locator(".pb-slot-row").filter({ hasText: "Divine font" });
  await expect(fontRow).toContainText("/ 4");
  await expect(page.locator(".pb-slot-row").filter({ hasText: "Rank 1" }).first()).toContainText(
    "/ 2"
  );
  const preparedHeal = page
    .locator(".pb-spell-row")
    .filter({ hasText: "Prepared" })
    .filter({ hasText: "Heal" })
    .first();
  await preparedHeal.getByRole("button", { name: "Cast" }).click();
  await expect(page.getByText(/Cast Heal at rank 1/)).toBeVisible({ timeout: 15_000 });
  await expect(fontRow).toContainText("3 / 4");
  await expect(page.locator(".pb-save")).toHaveText("Saved");
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
  await page.getByRole("button", { name: "Spells", exact: true }).click();
  const ritualRow = page.locator(".pb-spell-row").filter({ hasText: "Angelic Messenger" });
  await expect(ritualRow).toBeVisible();
  await expect(ritualRow).toContainText("Rituals");
  const innateRow = page
    .locator(".pb-spell-row")
    .filter({ hasText: "Detect Magic" })
    .filter({ hasText: "Innate" });
  await expect(innateRow).toBeVisible();
  await expect(innateRow).toContainText("Innate");
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
  await page.getByRole("button", { name: "Spells", exact: true }).click();
  await expect(page.getByRole("link", { name: /Force Barrage/ })).toBeVisible();
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
