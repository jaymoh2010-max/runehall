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
  await page.getByRole("link", { name: "Open character sheet" }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "E2E Hero" })).toBeVisible();
  await expect(page.getByText("Initiative").first()).toBeVisible();

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

  await page.getByRole("button", { name: "Add token", exact: true }).click();
  const addToken = page.getByRole("dialog", { name: "Add a token" });
  await expect(addToken).toBeVisible();
  await addToken.getByRole("button", { name: "Place" }).first().click();
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
