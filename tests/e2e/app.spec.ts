import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { currencyToCp } from "../../src/shared/inventory";
import { emptyCharacterDraft } from "../../src/shared/rules";

test.describe.configure({ mode: "serial" });

const runId = Date.now().toString(36);
const compendiumClasses = JSON.parse(
  fs.readFileSync(path.resolve("data", "compendium", "classes.json"), "utf8")
) as { id: string; name: string }[];
const compendiumSpells = JSON.parse(
  fs.readFileSync(path.resolve("data", "compendium", "spells.json"), "utf8")
) as { id: string; name: string }[];
const compendiumEquipment = JSON.parse(
  fs.readFileSync(path.resolve("data", "compendium", "equipment.json"), "utf8")
) as { id: string; name: string }[];
const compendiumDeities = JSON.parse(
  fs.readFileSync(path.resolve("data", "compendium", "deities.json"), "utf8")
) as { id: string; name: string }[];
const compendiumFeats = JSON.parse(
  fs.readFileSync(path.resolve("data", "compendium", "feats.json"), "utf8")
) as { id: string; name: string }[];
const sorcererId = compendiumClasses.find((entry) => entry.name === "Sorcerer")!.id;
const clericId = compendiumClasses.find((entry) => entry.name === "Cleric")!.id;
const fighterId = compendiumClasses.find((entry) => entry.name === "Fighter")!.id;
const psychicId = compendiumClasses.find((entry) => entry.name === "Psychic")!.id;
const fireballId = compendiumSpells.find((entry) => entry.name === "Fireball")!.id;
const shieldId = compendiumSpells.find((entry) => entry.name === "Shield")!.id;
const forceBarrageId = compendiumSpells.find((entry) => entry.name === "Force Barrage")!.id;
const wizardDedicationId = "feat:oQ6EZRFXbHWCx08C";
const basicWizardSpellcastingId = "feat:SHUfHzElHZPXJFiP";
const abadarId = compendiumDeities.find((entry) => entry.name === "Abadar")!.id;
const domainInitiateId = compendiumFeats.find((entry) => entry.name === "Domain Initiate")!.id;
const advancedDomainId = compendiumFeats.find((entry) => entry.name === "Advanced Domain")!.id;
const scroll3Id = compendiumEquipment.find(
  (entry) => entry.name === "Scroll of 3rd-rank Spell"
)!.id;
const wand3Id = compendiumEquipment.find(
  (entry) => entry.name === "Magic Wand (3rd-Rank Spell)"
)!.id;
const lightningWandId = compendiumEquipment.find(
  (entry) => entry.name === "Wand of Crackling Lightning (3rd-Rank Spell)"
)!.id;
const wideningWandId = compendiumEquipment.find(
  (entry) => entry.name === "Wand of Widening (1st-Rank Spell)"
)!.id;
const healingStaffId = compendiumEquipment.find((entry) => entry.name === "Staff of Healing")!.id;
const elementBloodlineId = "cf:RXRnJcG4XSabZ35a";
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

async function register(page: Page, user: typeof admin, bootstrapToken?: string): Promise<void> {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Join the hall" })).toBeVisible();
  if (bootstrapToken) {
    const tokenField = page.getByLabel("Bootstrap token");
    await expect(tokenField).toBeVisible();
    await tokenField.fill(bootstrapToken);
  }
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
  await openNewCharacterInCampaign(page, name, campaignName);
}

async function openNewCharacterInCampaign(
  page: Page,
  name: string,
  campaign: string
): Promise<void> {
  await page.goto("/campaigns");
  await page.getByRole("button", { name: "New character" }).click();
  const dialog = page.getByRole("dialog", { name: "Forge a new hero" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Character name").fill(name);
  await dialog.getByLabel("Campaign").selectOption({ label: campaign });
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
  await register(page, admin, "e2e-bootstrap-token");
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

test("sheet keeps local edits when another save wins the revision race", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await page.routeWebSocket(/socket\.io/, (socket) => socket.close());

  const campaignId = campaignPath.split("/").pop();
  const list = await page.request.get(`/api/characters?campaignId=${campaignId}`);
  const characters = (await list.json()) as {
    characters: { id: string; name: string }[];
  };
  const hero = characters.characters.find((entry) => entry.name === "E2E Hero");
  expect(hero).toBeTruthy();

  await page.goto(`/characters/${hero!.id}`);
  await expect(page.locator(".pb-sheet-page")).toBeVisible({ timeout: 15_000 });

  const before = await page.request.get(`/api/characters/${hero!.id}`);
  const record = (await before.json()).character as {
    revision: number;
    data: { details: { notes: string } };
  };
  const serverData = {
    ...record.data,
    details: { ...record.data.details, notes: "Server note" },
  };
  const serverSave = await page.request.put(`/api/characters/${hero!.id}`, {
    data: { data: serverData, expectedRevision: record.revision },
  });
  expect(serverSave.ok()).toBe(true);

  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByLabel("Notes").fill("Local note");
  await page.getByRole("button", { name: "Save details" }).click();

  const conflictDialog = page.getByRole("dialog", { name: "This sheet changed elsewhere" });
  await expect(conflictDialog).toBeVisible({ timeout: 15_000 });
  await conflictDialog.getByRole("button", { name: "Keep my changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible({ timeout: 15_000 });

  const after = await page.request.get(`/api/characters/${hero!.id}`);
  const saved = (await after.json()).character as { data: { details: { notes: string } } };
  expect(saved.data.details.notes).toBe("Local note");
});

test("sheet item browser filters by category, subtype, and level", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const campaignId = campaignPath.split("/").pop();
  const list = await page.request.get(`/api/characters?campaignId=${campaignId}`);
  const characters = (await list.json()) as {
    characters: { id: string; name: string }[];
  };
  const hero = characters.characters.find((entry) => entry.name === "E2E Hero");
  expect(hero).toBeTruthy();

  await page.goto(`/characters/${hero!.id}`);
  await page.getByRole("button", { name: "Gear", exact: true }).click();
  const categories = page.getByRole("group", { name: "Item categories" });
  await categories.getByRole("button", { name: "Weapons", exact: true }).click();
  const subcategories = page.getByRole("group", { name: "Item subcategories" });
  await subcategories.getByRole("button", { name: "Martial", exact: true }).click();
  await page.getByPlaceholder("Search the item database").fill("Longsword");
  const longsword = page.locator(".pb-item-row").filter({ hasText: "Longsword" }).first();
  await expect(longsword).toBeVisible({ timeout: 15_000 });
  await expect(longsword.locator(".pb-item-name span")).toContainText("Martial weapon");

  await page.getByLabel("Item level").selectOption("16+");
  await expect(page.locator(".pb-item-row").filter({ hasText: "Longsword" })).toHaveCount(0, {
    timeout: 15_000,
  });

  await page.getByLabel("Item level").selectOption("all");
  await categories.getByRole("button", { name: "Runes", exact: true }).click();
  await page.getByPlaceholder("Search the item database").fill("Striking");
  const rune = page.locator(".pb-item-row").filter({ hasText: "Striking" }).first();
  await expect(rune).toBeVisible({ timeout: 15_000 });
  await expect(rune.locator(".pb-item-name span")).toContainText("Rune");

  await page.getByRole("button", { name: "Reset item filters" }).click();
  await expect(page.getByPlaceholder("Search the item database")).toHaveValue("");
  await expect(categories.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
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

  await page.getByRole("tab", { name: "Classes" }).click();
  await page.getByPlaceholder(/Search classes/).fill("Wizard");
  await page
    .getByRole("button", { name: /Wizard/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Wizard", level: 2 })).toBeVisible();

  await page.getByRole("tab", { name: "Conditions" }).click();
  await page.getByPlaceholder(/Search conditions/).fill("Frightened");
  await page
    .getByRole("button", { name: /Frightened/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Frightened", level: 2 })).toBeVisible();

  await page.getByRole("tab", { name: "Hazards" }).click();
  await page.getByPlaceholder(/Search hazards/).fill("Hidden Pit");
  await page
    .getByRole("button", { name: /Hidden Pit/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Hidden Pit", level: 2 })).toBeVisible();

  await page.getByRole("tab", { name: "Vehicles" }).click();
  await page.getByPlaceholder(/Search vehicles/).fill("Airship");
  await page
    .getByRole("button", { name: /Airship/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Airship", level: 2 })).toBeVisible();
  await expect(page.getByText("210", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Familiars" }).click();
  await page.getByPlaceholder(/Search familiars/).fill("Absorb Familiar");
  await page
    .getByRole("button", { name: /Absorb Familiar/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Absorb Familiar", level: 2 })).toBeVisible();

  await page.getByRole("tab", { name: "Boons & Curses" }).click();
  await page.getByPlaceholder(/Search boons/).fill("Achaekek - Major Boon");
  await page
    .getByRole("button", { name: /Achaekek - Major Boon/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Achaekek - Major Boon", level: 2 })
  ).toBeVisible();

  await page.getByRole("tab", { name: "Traits" }).click();
  await page.getByPlaceholder(/Search traits/).fill("Aberration");
  await page
    .getByRole("button", { name: /Aberration/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Aberration", level: 2 })).toBeVisible();

  await page.getByRole("tab", { name: "Afflictions" }).click();
  await page.getByPlaceholder(/Search afflictions/).fill("Bog Rot");
  await page
    .getByRole("button", { name: /Bog Rot/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Bog Rot", level: 2 })).toBeVisible();
  await expect(page.getByText("DC 13 Fortitude")).toBeVisible();

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
  await expect(
    playerPage.locator(".pb-inventory-group").filter({ hasText: "Containers" })
  ).toBeVisible();
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

test("GM awards gold to the party and an item to one hero", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const campaignId = campaignPath.split("/").pop();
  const listResponse = await page.request.get(`/api/characters?campaignId=${campaignId}`);
  const list = (await listResponse.json()) as {
    characters: {
      id: string;
      name: string;
      data: {
        currency: { gp: number; sp: number; cp: number };
        equipment: { itemId: string; quantity: number }[];
      };
    }[];
  };
  const characters = list.characters;
  const beforeCp = new Map(
    characters.map((character) => [character.id, currencyToCp(character.data.currency)])
  );
  const playerHero = characters.find((character) => character.name === "Pathbuilder E2E Hero");
  expect(playerHero).toBeTruthy();
  const backpackResponse = await page.request.get(`/api/compendium/equipment?q=Backpack&limit=10`);
  const backpackItems = (await backpackResponse.json()) as {
    items: { id: string; name: string }[];
  };
  const backpack = backpackItems.items.find((item) => item.name === "Backpack");
  expect(backpack).toBeTruthy();
  const beforeBackpacks =
    playerHero!.data.equipment.find((entry) => entry.itemId === backpack!.id)?.quantity ?? 0;

  await page.goto(`${campaignPath}?tab=party`);
  await page.getByRole("button", { name: "Award treasure" }).click();
  const awardDialog = page.getByRole("dialog", { name: "Award treasure" });
  await expect(awardDialog).toBeVisible();
  await awardDialog.getByLabel("Gold pieces").fill("10");
  await expect(awardDialog.getByText(/split across \d+ characters/)).toBeVisible();
  await awardDialog.getByRole("button", { name: "Award", exact: true }).click();
  await expect(awardDialog).toBeHidden({ timeout: 15_000 });

  const afterGoldResponse = await page.request.get(`/api/characters?campaignId=${campaignId}`);
  const afterGold = (await afterGoldResponse.json()) as {
    characters: { id: string; data: { currency: { gp: number; sp: number; cp: number } } }[];
  };
  let gainedCp = 0;
  for (const character of afterGold.characters) {
    const gained = currencyToCp(character.data.currency) - (beforeCp.get(character.id) ?? 0);
    expect(gained).toBeGreaterThanOrEqual(0);
    gainedCp += gained;
  }
  expect(gainedCp).toBe(1000);

  await page.getByRole("button", { name: "Award treasure" }).click();
  await expect(awardDialog).toBeVisible();
  await awardDialog.getByRole("button", { name: "Item", exact: true }).click();
  await awardDialog.getByLabel("Recipient").selectOption(playerHero!.id);
  await awardDialog.getByPlaceholder("Search items to award").fill("Backpack");
  await awardDialog.locator(".award-item-row").filter({ hasText: "Backpack" }).first().click();
  await awardDialog.getByRole("button", { name: "Award", exact: true }).click();
  await expect(awardDialog).toBeHidden({ timeout: 15_000 });

  const afterItemResponse = await page.request.get(`/api/characters/${playerHero!.id}`);
  const afterItem = (await afterItemResponse.json()) as {
    character: { data: { equipment: { itemId: string; quantity: number }[] } };
  };
  const afterBackpacks =
    afterItem.character.data.equipment.find((entry) => entry.itemId === backpack!.id)?.quantity ??
    0;
  expect(afterBackpacks).toBe(beforeBackpacks + 1);

  const plateResponse = await page.request.get(`/api/compendium/equipment?q=Full%20Plate&limit=5`);
  const plateItems = (await plateResponse.json()) as {
    items: { id: string; name: string }[];
  };
  const fullPlate = plateItems.items.find((item) => item.name === "Full Plate");
  expect(fullPlate).toBeTruthy();
  const purchase = await page.request.post(`/api/characters/${playerHero!.id}/items`, {
    data: { itemId: fullPlate!.id, quantity: 1, mode: "buy" },
  });
  expect(purchase.status()).toBe(400);
  expect(await purchase.text()).toContain("Not enough coins");
});

test("players add and remove custom inventory items", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, importer);
  const campaignId = campaignPath.split("/").pop();
  const listResponse = await page.request.get(`/api/characters?campaignId=${campaignId}`);
  const list = (await listResponse.json()) as {
    characters: { id: string; name: string }[];
  };
  const hero = list.characters.find((character) => character.name === "Pathbuilder E2E Hero");
  expect(hero).toBeTruthy();

  await page.goto(`/characters/${hero!.id}`);
  await page.getByRole("button", { name: "Gear", exact: true }).click();
  await page.getByRole("button", { name: "Add custom item" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add custom item" });
  await expect(addDialog).toBeVisible();
  await addDialog.getByLabel("Item name").fill("Family compass");
  await addDialog.getByLabel("Description").fill("A brass compass with a scratched lid.");
  await addDialog.getByRole("button", { name: "Add item" }).click();
  await expect(addDialog).toBeHidden({ timeout: 15_000 });

  const customGroup = page.locator(".pb-inventory-group").filter({ hasText: "Custom" });
  await expect(customGroup).toContainText("Family compass");
  await customGroup.getByRole("button", { name: /Family compass/ }).click();
  const viewDialog = page.getByRole("dialog", { name: "Family compass" });
  await expect(viewDialog).toContainText("A brass compass with a scratched lid.");
  await viewDialog.locator(".modal-foot").getByRole("button", { name: "Close" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Gear", exact: true }).click();
  await expect(page.locator(".pb-inventory-group").filter({ hasText: "Custom" })).toContainText(
    "Family compass"
  );
  await page
    .locator(".pb-inventory-group")
    .filter({ hasText: "Custom" })
    .getByRole("button", { name: /Family compass/ })
    .click();
  const reopened = page.getByRole("dialog", { name: "Family compass" });
  await reopened.getByRole("button", { name: "Remove from inventory" }).click();
  await expect(reopened).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(".pb-inventory-group").filter({ hasText: "Custom" })).toHaveCount(0);

  await page.getByPlaceholder("Search the item database").fill("Full Plate");
  const plateRow = page.locator(".pb-item-row").filter({ hasText: "Full Plate" }).first();
  await expect(plateRow).toBeVisible({ timeout: 15_000 });
  await expect(plateRow.getByRole("button", { name: "Buy" })).toBeDisabled();
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
  const campaignId = campaignPath.split("/").pop();
  const list = await page.request.get(`/api/characters?campaignId=${campaignId}`);
  expect(list.ok()).toBe(true);
  const characters = (await list.json()) as { characters: { id: string; name: string }[] };
  const hero = characters.characters.find((entry) => entry.name === "E2E Hero");
  expect(hero).toBeTruthy();
  const full = await page.request.get(`/api/characters/${hero!.id}`);
  expect(full.ok()).toBe(true);
  const record = (await full.json()) as {
    character: { data: { play: Record<string, unknown> } };
  };
  const sustained = {
    id: "sustain_e2e",
    spellId: "spell:test-sustain",
    name: "Flaming Sphere",
    rank: 2,
    duration: "sustained up to 1 minute",
  };
  const updated = await page.request.put(`/api/characters/${hero!.id}`, {
    data: {
      data: {
        ...record.character.data,
        play: { ...record.character.data.play, sustainedSpells: [sustained] },
      },
      force: true,
    },
  });
  expect(updated.ok()).toBe(true);

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
  const sustainReminder = page.getByTestId("table-sustain-reminder");
  await expect(sustainReminder).toContainText("Flaming Sphere");
  await sustainReminder.getByRole("button", { name: "Sustain", exact: true }).click();
  await expect(sustainReminder).toContainText("Sustained this turn");
  await sustainReminder.getByRole("button", { name: "End sustained Flaming Sphere" }).click();
  await expect(sustainReminder).toBeHidden({ timeout: 15_000 });
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

  const table = page.locator(".vtt");
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect(table).toHaveClass(/is-fullscreen/);
  await expect(page.locator("body")).toHaveClass(/table-fullscreen-active/);
  await expect(page.getByRole("button", { name: "Exit full screen", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Scenes" }).click();
  await expect(scenes).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(scenes).toBeHidden();
  await expect(table).toHaveClass(/is-fullscreen/);
  await page.keyboard.press("f");
  await expect(table).not.toHaveClass(/is-fullscreen/);
  await expect(page.locator("body")).not.toHaveClass(/table-fullscreen-active/);
  await expect(page.getByRole("button", { name: "Full screen", exact: true })).toBeVisible();

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

test("drawing tools add and erase shared map annotations", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await page.goto(campaignPath);
  await expect(page.locator(".scene-viewport")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".core-connection")).toHaveClass(/is-online/, {
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Draw on the map (D)" }).click();
  const viewport = page.locator(".scene-viewport");
  const box = await viewport.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width * 0.45;
  const startY = box!.y + box!.height * 0.52;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 40, startY + 16, { steps: 8 });
  await page.mouse.up();

  const stroke = page.locator(".scene-drawing-svg polyline");
  await expect(stroke).toHaveCount(1, { timeout: 10_000 });

  await page.getByRole("button", { name: "Erase drawings (E)" }).click();
  await page.mouse.click(startX + 20, startY + 8);
  await expect(stroke).toHaveCount(0, { timeout: 10_000 });
  await page.getByRole("button", { name: "Select and pan" }).click();
});

test("area templates place on the map and stay listed until cleared", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  await page.goto(campaignPath);
  await expect(page.locator(".scene-viewport")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".core-connection")).toHaveClass(/is-online/, {
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Area", exact: true }).click();
  const bar = page.locator(".aoe-placement-bar");
  await expect(bar).toBeVisible();
  await bar.getByLabel("Area shape").selectOption("cone");
  await bar.getByLabel("Area size in feet").selectOption("30");

  const viewport = page.locator(".scene-viewport");
  const box = await viewport.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width * 0.38;
  const startY = box!.y + box!.height * 0.52;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY + 40, { steps: 8 });
  await page.mouse.up();

  const areaLabel = page.locator(".template-layer text").filter({ hasText: "Cone 30 ft." });
  await expect(areaLabel).toBeVisible({ timeout: 10_000 });
  const panel = page.locator(".aoe-active-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Cone 30 ft.")).toBeVisible();
  await expect(panel.getByText("until cleared")).toBeVisible();

  await panel.getByRole("button", { name: "Clear area Cone 30 ft." }).click();
  await expect(panel).toBeHidden({ timeout: 10_000 });
  await expect(areaLabel).toBeHidden();
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
  await page
    .locator(".skill-picker")
    .filter({ hasText: "Fighter training" })
    .getByRole("combobox")
    .selectOption("athletics");
  await trainClassSkills(page, ["Acrobatics", "Medicine", "Survival"]);

  await goToStep(page, "Feats");
  await pickFeat(page, "Ancestry feat", "Haughty Obstinacy");
  await pickFeat(page, "Class feat", "Exacting Strike");
  await expect(page.locator(".feat-slot").filter({ hasText: "Ancestry feat" })).toContainText(
    "Haughty Obstinacy"
  );

  await goToStep(page, "Spells");
  await expect(page.getByText("No spellcasting preparation required.")).toBeVisible();
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
  await expect(page.getByRole("button", { name: /Laws of Mortality/ })).toHaveCount(0);
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
    .filter({ has: page.getByRole("heading", { name: "Rank 1 spell list" }) });
  await rankOne.getByRole("button", { name: "Add rank 1 spell to spell list" }).click();
  await pickSpell(page, "Bless");
  await rankOne.getByRole("button", { name: "Add rank 1 spell to spell list" }).click();
  await pickSpell(page, "Heal");

  const blessRow = rankOne.getByRole("group", { name: "Bless spell list row" });
  await blessRow.getByRole("button", { name: "Prepare Bless at rank 1" }).click();
  await blessRow.getByRole("button", { name: "Prepare Bless at rank 1" }).click();
  await expect(blessRow.getByRole("button", { name: "Prepare Bless at rank 1" })).toBeDisabled();

  const healRow = rankOne.getByRole("group", { name: "Heal spell list row" });
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

test("builder grants advanced domain spells for clerics", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const campaignId = campaignPath.split("/").pop();
  const created = await page.request.post("/api/characters", {
    data: { name: "E2E Domain Cleric", campaignId },
  });
  expect(created.ok()).toBe(true);
  const character = (await created.json()) as { character: { id: string } };
  const draft = emptyCharacterDraft("E2E Domain Cleric");
  draft.level = 8;
  draft.classId = clericId;
  draft.keyAbility = "wis";
  draft.deityId = abadarId;
  draft.feats.class["2"] = domainInitiateId;
  draft.feats.class["8"] = advancedDomainId;
  draft.grantChoices["grant:cleric-domain"] = ["domain:cities"];
  const saved = await page.request.put(`/api/characters/${character.character.id}`, {
    data: { data: draft, force: true },
  });
  expect(saved.ok()).toBe(true);

  await page.goto(`/characters/${character.character.id}/edit`);
  await expect(page.getByRole("heading", { name: "E2E Domain Cleric" })).toBeVisible({
    timeout: 15_000,
  });
  await goToStep(page, "Class");
  const advancedDomain = page
    .locator(".choice-group")
    .filter({ hasText: "Advanced Domain: choose an advanced domain spell." });
  await expect(advancedDomain).toBeVisible();
  await advancedDomain.getByRole("button", { name: /Cities Advanced Domain/ }).click();

  await page.goto(`/characters/${character.character.id}`);
  await expect(page.getByRole("heading", { name: "E2E Domain Cleric" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Spells", exact: true }).click();
  await expect(page.getByText("Pulse of Civilization").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".pb-save")).toHaveText("Saved");
});

test("builder splits animist prepared and apparition spellcasting", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, admin);
  const expandedCampaign = `E2E Expanded ${runId}`;
  const created = await page.request.post("/api/campaigns", {
    data: { name: expandedCampaign, ruleset: "expanded" },
  });
  expect(created.ok()).toBe(true);
  await openNewCharacterInCampaign(page, "E2E Animist", expandedCampaign);

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
    .getByRole("button", { name: /Animist/ })
    .click();
  await page
    .locator(".choice-options")
    .getByRole("button", { name: /Liturgist/ })
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
  for (const cantrip of ["Guidance", "Light"]) {
    await page.getByRole("button", { name: "Add cantrip" }).click();
    await pickSpell(page, cantrip);
  }
  await expect(page.getByRole("button", { name: "Add cantrip" })).toBeDisabled();

  const rankOne = page
    .locator(".spell-section")
    .filter({ has: page.getByRole("heading", { name: "Rank 1 prepared list" }) });
  await rankOne.getByRole("button", { name: "Add rank 1 spell to prepared list" }).click();
  await pickSpell(page, "Bless");
  await rankOne.getByRole("button", { name: "Add rank 1 spell to prepared list" }).click();
  await pickSpell(page, "Heal");
  const blessRow = rankOne.getByRole("group", { name: "Bless prepared list row" });
  await blessRow.getByRole("button", { name: "Prepare Bless at rank 1" }).click();
  await expect(blessRow.getByRole("button", { name: "Prepare Bless at rank 1" })).toBeDisabled();

  const apparitionSelect = page.getByLabel("Apparition to attune");
  await apparitionSelect.selectOption({ label: "Witness to Ancient Battles" });
  await expect(page.getByText("1 / 2 attuned")).toBeVisible({ timeout: 15_000 });
  await apparitionSelect.selectOption({ label: "Steward of Stone and Fire" });
  await expect(page.getByText("2 / 2 attuned")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Embodiment of Battle/).first()).toBeVisible();

  await goToStep(page, "Gear");
  await page.getByRole("button", { name: /Take .* as coins/ }).click();
  await goToStep(page, "Review");
  await expect(page.getByRole("heading", { name: "Your hero is ready" })).toBeVisible();

  await page.getByRole("link", { name: "Open character sheet" }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "E2E Animist" })).toBeVisible();
  await page.getByRole("button", { name: "Spells", exact: true }).click();
  await expect(page.getByTestId("attuned-apparitions")).toContainText("Witness to Ancient Battles");
  await expect(page.getByTestId("attuned-apparitions")).toContainText("Steward of Stone and Fire");
  await expect(page.getByRole("link", { name: /Shield/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Sure Strike/ }).first()).toBeVisible();

  const preparedSlot = page.locator(".pb-slot-row").filter({ hasText: "Rank 1" }).first();
  const apparitionSlot = page.locator(".pb-slot-row").filter({ hasText: "Apparition rank 1" });
  await expect(preparedSlot).toContainText("1 / 1");
  await expect(apparitionSlot).toContainText("1 / 1");

  const sureStrike = page
    .locator(".pb-spell-row")
    .filter({ hasText: "Apparition" })
    .filter({ hasText: "Sure Strike" })
    .first();
  await sureStrike.getByRole("button", { name: "Cast" }).click();
  await expect(page.getByText(/Cast Sure Strike at rank 1/)).toBeVisible({ timeout: 15_000 });
  await expect(apparitionSlot).toContainText("0 / 1");
  await expect(preparedSlot).toContainText("1 / 1");
  await expect(page.locator(".pb-save")).toHaveText("Saved");
});

test("builder learns a spontaneous spell at more than one rank", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const campaignId = campaignPath.split("/").pop();
  const created = await page.request.post("/api/characters", {
    data: { name: "E2E Ranked Sorcerer", campaignId },
  });
  expect(created.ok()).toBe(true);
  const character = (await created.json()) as { character: { id: string } };
  const draft = emptyCharacterDraft("E2E Ranked Sorcerer");
  draft.level = 11;
  draft.classId = sorcererId;
  draft.keyAbility = "cha";
  draft.spells.tradition = "primal";
  draft.classChoices["cf:2goYo6VNbwC6aKF1:sorcerer-bloodline"] = [elementBloodlineId];
  draft.spells.known = [fireballId];
  draft.spells.knownRanks = { [fireballId]: [3, 5] };
  draft.equipment.push({
    itemId: scroll3Id,
    quantity: 1,
    equipped: false,
    invested: false,
    runes: [],
  });
  draft.equipment.push({
    itemId: wand3Id,
    quantity: 1,
    equipped: true,
    invested: false,
    runes: [],
  });
  draft.equipment.push({
    itemId: lightningWandId,
    quantity: 1,
    equipped: true,
    invested: false,
    runes: [],
  });
  draft.equipment.push({
    itemId: wideningWandId,
    quantity: 1,
    equipped: true,
    invested: false,
    runes: [],
  });
  draft.equipment.push({
    itemId: healingStaffId,
    quantity: 1,
    equipped: true,
    invested: false,
    runes: [],
  });
  const saved = await page.request.put(`/api/characters/${character.character.id}`, {
    data: { data: draft, force: true },
  });
  expect(saved.ok()).toBe(true);

  await page.goto(`/characters/${character.character.id}/edit`);
  await expect(page.getByRole("heading", { name: "E2E Ranked Sorcerer" })).toBeVisible({
    timeout: 15_000,
  });
  await goToStep(page, "Spells");

  const rankThree = page
    .locator(".spell-section")
    .filter({ has: page.getByRole("heading", { name: "Rank 3 repertoire" }) });
  const rankFive = page
    .locator(".spell-section")
    .filter({ has: page.getByRole("heading", { name: "Rank 5 repertoire" }) });
  await expect(rankThree.getByText("Fireball")).toBeVisible();
  await expect(rankFive.getByText("Fireball")).toBeVisible();

  await rankFive.getByRole("button", { name: "Add rank 5 spell to repertoire" }).click();
  await pickSpell(page, "Fear");
  await expect(rankFive.getByText("Fear")).toBeVisible();
  await expect(rankFive.getByText("base rank 1")).toBeVisible();

  await page.goto(`/characters/${character.character.id}`);
  await expect(page.getByRole("heading", { name: "E2E Ranked Sorcerer" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Spells", exact: true }).click();
  const fireball = page.locator(".pb-spell-row").filter({ hasText: "Fireball" }).first();
  const rankChoices = fireball.locator("select");
  await expect(rankChoices.locator('option[value="3:slot"]')).toHaveCount(1);
  await expect(rankChoices.locator('option[value="5:slot"]')).toHaveCount(1);
  await expect(rankChoices.locator('option[value="4:slot:3"]')).toHaveCount(1);
  await expect(rankChoices.locator('option[value="6:slot:3"]')).toHaveCount(1);
  await expect(rankChoices.locator('option[value="6:slot:5"]')).toHaveCount(1);
  await rankChoices.selectOption("4:slot:3");
  await fireball.getByRole("button", { name: "Cast" }).click();
  await expect(page.getByText(/Cast Fireball at rank 3 using a rank 4 slot/)).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Gear", exact: true }).click();
  const scrollRow = page
    .locator(".pb-inventory-row")
    .filter({ hasText: "Scroll of 3rd-rank Spell" });
  await expect(scrollRow).toBeVisible();
  await scrollRow.getByRole("button", { name: /Cast spell from/ }).click();
  await page.getByPlaceholder(/Search spells/).fill("Fireball");
  await page
    .locator(".picker-item-name", { hasText: /^Fireball$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Cast from scroll" }).click();
  await expect(page.getByText(/Cast Fireball from a scroll at rank 3/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(scrollRow).toBeHidden({ timeout: 15_000 });
  const wandRow = page
    .locator(".pb-inventory-row")
    .filter({ hasText: "Magic Wand (3rd-Rank Spell)" });
  await expect(wandRow).toBeVisible();
  await wandRow.getByRole("button", { name: /Cast spell from/ }).click();
  await page.getByPlaceholder(/Search spells/).fill("Fireball");
  await page
    .locator(".picker-item-name", { hasText: /^Fireball$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Cast from wand" }).click();
  await expect(page.getByText(/Cast Fireball from a magic wand at rank 3/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(wandRow.getByRole("button", { name: /used today/i })).toBeDisabled();
  const fixedWandRow = page
    .locator(".pb-inventory-row")
    .filter({ hasText: "Wand of Crackling Lightning (3rd-Rank Spell)" });
  await expect(fixedWandRow).toBeVisible();
  await fixedWandRow.getByRole("button", { name: /Cast Lightning Bolt from/ }).click();
  await expect(page.getByText(/Cast Lightning Bolt from a magic wand at rank 3/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(fixedWandRow.getByRole("button", { name: /used today/i })).toBeDisabled();
  const flexibleWandRow = page
    .locator(".pb-inventory-row")
    .filter({ hasText: "Wand of Widening (1st-Rank Spell)" });
  await expect(flexibleWandRow).toBeVisible();
  await flexibleWandRow.getByRole("button", { name: /Cast spell from/ }).click();
  await page.getByPlaceholder(/Search spells/).fill("Grease");
  await page
    .locator(".picker-item-name", { hasText: /^Grease$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Cast from wand" }).click();
  await expect(
    page.getByText(/Cast Grease from Wand of Widening \(1st-Rank Spell\) at rank 1/)
  ).toBeVisible({ timeout: 15_000 });
  await expect(flexibleWandRow.getByRole("button", { name: /used today/i })).toBeDisabled();
  const staffRow = page.locator(".pb-inventory-row").filter({ hasText: "Staff of Healing" });
  await expect(staffRow).toBeVisible();
  await staffRow.getByRole("button", { name: "Charge Staff of Healing" }).click();
  await page.getByRole("button", { name: "Expend rank 1" }).click();
  await expect(page.getByText(/Charged Staff of Healing with 1 charge/)).toBeVisible({
    timeout: 15_000,
  });
  await staffRow.getByRole("button", { name: "Cast spell from Staff of Healing" }).click();
  await page.getByRole("button", { name: /^Heal · 1 charge$/ }).click();
  await expect(page.getByText(/Cast Heal from Staff of Healing using 1 charge/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(staffRow).toContainText("0 / 1 charges");
  await staffRow.getByRole("button", { name: "Cast spell from Staff of Healing" }).click();
  await page.getByRole("button", { name: "Slot", exact: true }).click();
  await expect(
    page.getByText(/Cast Heal from Staff of Healing using a rank 1 spell slot/)
  ).toBeVisible({ timeout: 15_000 });
  await expect(staffRow).toContainText("0 / 1 charges");
  await expect(page.locator(".pb-save")).toHaveText("Saved");

  await page.reload();
  await expect(page.getByRole("heading", { name: "E2E Ranked Sorcerer" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Gear", exact: true }).click();
  const savedWandRow = page
    .locator(".pb-inventory-row")
    .filter({ hasText: "Magic Wand (3rd-Rank Spell)" });
  await expect(savedWandRow.getByRole("button", { name: /used today/i })).toBeDisabled();
});

test("casting an area spell prompts map placement and lists the effect", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, admin);
  await page.goto(campaignPath);
  await expect(page.locator(".scene-viewport")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".core-connection")).toHaveClass(/is-online/, {
    timeout: 15_000,
  });

  const picker = page.getByLabel("Character for My sheet");
  if (await picker.count()) {
    await picker.selectOption({ label: "E2E Ranked Sorcerer" });
  }
  await page.getByRole("button", { name: "My sheet" }).click();
  const sheet = page.locator(".pb-sheet-overlay");
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByText("E2E Ranked Sorcerer").first()).toBeVisible({
    timeout: 15_000,
  });
  await sheet.getByRole("button", { name: "Spells", exact: true }).click();
  const fireball = sheet.locator(".pb-spell-row").filter({ hasText: "Fireball" }).first();
  await expect(fireball).toBeVisible({ timeout: 15_000 });
  await fireball.getByRole("button", { name: "Cast", exact: true }).click();

  const bar = page.locator(".aoe-placement-bar");
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await expect(bar).toContainText("Fireball");
  await expect(bar).toContainText("20 ft.");
  await expect(sheet).toBeHidden();

  const viewport = page.locator(".scene-viewport");
  const box = await viewport.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width * 0.46;
  const startY = box!.y + box!.height * 0.48;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY + 20, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator(".template-layer text").filter({ hasText: "Fireball" })).toBeVisible({
    timeout: 10_000,
  });
  const panel = page.locator(".aoe-active-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Fireball");
  await expect(panel).toContainText("until cleared");
  await expect(panel.getByText(/Reflex DC|damage/)).toBeVisible();

  await panel.getByRole("button", { name: "Clear area Fireball" }).click();
  await expect(panel).toBeHidden({ timeout: 10_000 });
});

test("sheet casts psychic psi cantrip amps with focus", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const expandedCampaign = `E2E Psychic ${runId}`;
  const createdCampaign = await page.request.post("/api/campaigns", {
    data: { name: expandedCampaign, ruleset: "expanded" },
  });
  expect(createdCampaign.ok()).toBe(true);
  const campaignId = (await createdCampaign.json()) as { campaign: { id: string } };
  const created = await page.request.post("/api/characters", {
    data: { name: "E2E Psychic", campaignId: campaignId.campaign.id },
  });
  expect(created.ok()).toBe(true);
  const character = (await created.json()) as { character: { id: string } };
  const draft = emptyCharacterDraft("E2E Psychic");
  draft.level = 1;
  draft.classId = psychicId;
  draft.keyAbility = "int";
  draft.play.focusPoints = 2;
  draft.classChoices["cf:0fv6NVMZZ0peGL9e:psychic-conscious-mind"] = ["cf:1rlBo3LcwIuPDCvz"];
  draft.classChoices["cf:79ZetrRF6S01P4Vf:psychic-subconscious-mind"] = ["cf:Qrhw4SILfT8YNQgB"];
  const saved = await page.request.put(`/api/characters/${character.character.id}`, {
    data: { data: draft, force: true },
  });
  expect(saved.ok()).toBe(true);

  await page.goto(`/characters/${character.character.id}/edit`);
  await expect(page.getByRole("heading", { name: "E2E Psychic" })).toBeVisible({
    timeout: 15_000,
  });
  await goToStep(page, "Spells");
  await expect(page.getByRole("heading", { name: "Psi amps" })).toBeVisible();
  await expect(
    page.locator(".spell-section").filter({ has: page.getByRole("heading", { name: "Psi amps" }) })
  ).toContainText("Telekinetic Projectile");

  await page.goto(`/characters/${character.character.id}`);
  await expect(page.getByRole("heading", { name: "E2E Psychic" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Spells", exact: true }).click();
  const projectile = page
    .locator(".pb-spell-row")
    .filter({ hasText: "Telekinetic Projectile" })
    .first();
  await expect(projectile.getByText(/Amp \(1 Focus\):/)).toBeVisible();
  const focusRow = page.locator(".pb-slot-row").filter({ hasText: "Focus" });
  await expect(focusRow).toContainText("2 / 2");
  const rankChoice = projectile.locator("select");
  await expect(rankChoice.locator("option")).toHaveText([
    "Rank 1 · cantrip",
    "Rank 1 · Amp (1 Focus)",
  ]);
  await rankChoice.selectOption("1:amp");
  await projectile.getByRole("button", { name: "Cast" }).click();
  await expect(page.getByText(/Cast Telekinetic Projectile at rank 1 · amped/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(focusRow).toContainText("1 / 2");
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
  draft.spells.rituals = ["spell:joEruBVz31Uxczzq", "spell:kqhPt9344UkcGVYO"];
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
  await ritualRow.getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("heading", { name: "Angelic Messenger" })).toBeVisible();
  await expect(page.getByText("Religion (expert; you must be an angel)").first()).toBeVisible();
  await page.getByLabel(/Primary check/).selectOption("religion");
  await page.keyboard.press("Escape");
  await expect(page.locator(".pb-save")).toHaveText("Saved");
  await ritualRow.getByRole("button", { name: "Details" }).click();
  await expect(page.getByLabel(/Primary check/)).toHaveValue("religion");
  await page.keyboard.press("Escape");

  const resurrectRow = page.locator(".pb-spell-row").filter({ hasText: "Resurrect" });
  await expect(resurrectRow).toBeVisible();
  await resurrectRow.getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("heading", { name: "Resurrect" })).toBeVisible();
  await expect(page.getByText("Religion (expert)").first()).toBeVisible();
  const secondary = page
    .locator("p")
    .filter({ hasText: /Secondary casters/ })
    .first();
  await expect(secondary).toContainText("2");
  await expect(secondary).toContainText("Medicine, Society");
  await page.keyboard.press("Escape");
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

  await expect(page.getByTestId("spellbook-budget")).toContainText(
    /Free picks: 0 \/ 10 cantrips, 0 \/ 5 ranked spells/
  );

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
  await page.getByRole("button", { name: "Learn spell" }).click();
  await page.getByPlaceholder(/Search spells/).fill("Grease");
  await page
    .locator(".picker-item-name", { hasText: /^Grease$/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Learn for 1 gp · DC 15/ }).click();
  await expect(page.getByText(/Learned Grease for 1 gp/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /Grease/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "Long rest" }).click();
  const restDialog = page.getByRole("dialog", { name: "Take a long rest" });
  await expect(restDialog).toBeVisible();
  await restDialog.getByRole("button", { name: "Take long rest" }).click();

  const prepDialog = page.getByRole("dialog", { name: "Daily preparations" });
  await expect(prepDialog).toBeVisible({ timeout: 15_000 });
  await prepDialog.getByLabel("Cantrip to prepare").selectOption({ label: "Shield · curriculum" });
  await prepDialog.getByRole("button", { name: "Prepare selected cantrip" }).click();
  await prepDialog.getByRole("button", { name: "Apply daily preparations" }).click();
  await expect(prepDialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("prep-pending-banner")).toHaveCount(0);

  const preparedCantrip = page
    .locator(".pb-spell-row")
    .filter({ hasText: "Prepared cantrips" })
    .filter({ hasText: "Shield" });
  await expect(preparedCantrip).toBeVisible();
  await preparedCantrip.getByRole("button", { name: "Cast" }).click();
  await expect(page.getByText(/Cast Shield at rank 1/)).toBeVisible({ timeout: 15_000 });
});

test("sheet casts a dedication cantrip from a multiclass archetype", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, admin);
  const campaignId = campaignPath.split("/").pop();
  const created = await page.request.post("/api/characters", {
    data: { name: "E2E Dedicated Fighter", campaignId },
  });
  expect(created.ok()).toBe(true);
  const character = (await created.json()) as { character: { id: string } };
  const draft = emptyCharacterDraft("E2E Dedicated Fighter");
  draft.level = 4;
  draft.classId = fighterId;
  draft.keyAbility = "str";
  draft.feats.class["2"] = wizardDedicationId;
  draft.feats.class["4"] = basicWizardSpellcastingId;
  draft.spells.multiclassCantrips = [shieldId];
  draft.spells.multiclassSpells = [forceBarrageId];
  const saved = await page.request.put(`/api/characters/${character.character.id}`, {
    data: { data: draft, force: true },
  });
  expect(saved.ok()).toBe(true);

  await page.goto(`/characters/${character.character.id}`);
  await expect(page.getByRole("heading", { name: "E2E Dedicated Fighter" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Spells", exact: true }).click();
  const row = page
    .locator(".pb-spell-row")
    .filter({ hasText: "Shield" })
    .filter({ hasText: "Multiclass" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Cast" }).click();
  await expect(page.getByText(/Cast Shield/)).toBeVisible({ timeout: 15_000 });
  const rankedRow = page
    .locator(".pb-spell-row")
    .filter({ hasText: "Force Barrage" })
    .filter({ hasText: "Multiclass" });
  await expect(rankedRow).toBeVisible();
  await rankedRow.getByRole("button", { name: "Cast" }).click();
  await expect(page.getByText(/Cast Force Barrage/)).toBeVisible({ timeout: 15_000 });
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
  await expect(page.getByRole("button", { name: /Laws of Mortality/ })).toHaveCount(0);
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
