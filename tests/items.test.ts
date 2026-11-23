import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { automationForEquipment } from "../src/shared/automation";
import { ITEM_EFFECTS, collectItemEffects, mergeEffects } from "../src/shared/effects";
import { computeCharacter, emptyCharacterDraft } from "../src/shared/rules";
import type {
  Ancestry,
  Background,
  CharacterContext,
  ClassData,
  Equipment,
} from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

function byName<T extends { name: string }>(items: T[], name: string): T {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const ancestries = read<Ancestry>("ancestries.json");
const backgrounds = read<Background>("backgrounds.json");
const classes = read<ClassData>("classes.json");
const equipment = read<Equipment>("equipment.json");

const human = byName(ancestries, "Human");
const warrior = byName(backgrounds, "Warrior");
const fighter = byName(classes, "Fighter");
const healerGloves = byName(equipment, "Healer's Gloves");
const greaterHealerGloves = byName(equipment, "Healer's Gloves (Greater)");
const demonMask = byName(equipment, "Demon Mask");
const bandsOfForce = byName(equipment, "Bands of Force");
const greaterBandsOfForce = byName(equipment, "Bands of Force (Greater)");
const thirdEye = byName(equipment, "Amulet of the Third Eye");
const beltOfStrength = byName(equipment, "Belt of Giant Strength");
const bracersOfStrength = byName(equipment, "Bracers of Strength");
const bracersOfHammers = byName(equipment, "Bracers of Hammers");
const chainMail = byName(equipment, "Chain Mail");
const armorPotency = byName(equipment, "Armor Potency (+1)");
const resilient = byName(equipment, "Resilient");

function fighterDraft(trainedSkills: string[], worn: Equipment[] = []) {
  const draft = emptyCharacterDraft("Items Fighter");
  draft.ancestryId = human.id;
  draft.backgroundId = warrior.id;
  draft.classId = fighter.id;
  draft.keyAbility = "str";
  draft.boosts.ancestry = ["str", "dex"];
  draft.boosts.background = ["str", "con"];
  draft.boosts.free = ["str", "dex", "con", "wis"];
  draft.skills.trained = trainedSkills;
  draft.equipment = worn.map((item) => ({
    itemId: item.id,
    quantity: 1,
    equipped: true,
    invested: item.traits.includes("invested"),
  }));
  return draft;
}

function context(items: Equipment[]): CharacterContext {
  return {
    ancestry: human,
    background: warrior,
    classData: fighter,
    feats: {},
    spells: {},
    equipment: Object.fromEntries(items.map((item) => [item.id, item])),
  };
}

function skillMod(derived: ReturnType<typeof computeCharacter>, id: string): number {
  const skill = derived.skills.find((entry) => entry.id === id);
  if (!skill) throw new Error(`Missing skill ${id}`);
  return skill.mod;
}

describe("curated item effects", () => {
  it("takes the highest item bonus per skill", () => {
    expect(
      mergeEffects([
        { skillItemBonus: { medicine: 1 } },
        { skillItemBonus: { medicine: 2, crafting: 1 } },
      ])
    ).toEqual({ skillItemBonus: { medicine: 2, crafting: 1 } });
  });

  it("keeps curated ids in sync with the current compendium", () => {
    expect(ITEM_EFFECTS[healerGloves.id]).toEqual({ skillItemBonus: { medicine: 1 } });
    expect(ITEM_EFFECTS[greaterHealerGloves.id]).toEqual({ skillItemBonus: { medicine: 2 } });
    expect(ITEM_EFFECTS[demonMask.id]).toEqual({ skillItemBonus: { intimidation: 1 } });
    expect(ITEM_EFFECTS[bandsOfForce.id]).toEqual({
      acItemBonus: 1,
      saveItemBonus: { fortitude: 1, reflex: 1, will: 1 },
      notes: ["Acts as armor with a maximum Dexterity modifier of +5."],
    });
    expect(ITEM_EFFECTS[thirdEye.id]).toEqual({
      perceptionItemBonus: 2,
      notes: [
        "Apex: when invested, increase your Wisdom modifier by 1 or to +4, whichever is higher.",
      ],
    });
    for (const item of [beltOfStrength, bracersOfStrength, bracersOfHammers]) {
      expect(ITEM_EFFECTS[item.id]).toMatchObject({ skillItemBonus: { athletics: 3 } });
    }
  });

  it("labels curated items as partly automated", () => {
    expect(automationForEquipment(healerGloves).level).toBe("partial");
    expect(automationForEquipment(bandsOfForce).level).toBe("partial");
  });

  it("applies an equipped skill item's bonus to the sheet", () => {
    const baseline = computeCharacter(fighterDraft(["medicine"]), context([healerGloves]));
    const withGloves = computeCharacter(
      fighterDraft(["medicine"], [healerGloves]),
      context([healerGloves])
    );
    expect(skillMod(withGloves, "medicine")).toBe(skillMod(baseline, "medicine") + 1);
  });

  it("ignores unequipped items", () => {
    const draft = fighterDraft(["medicine"]);
    draft.equipment = [{ itemId: healerGloves.id, quantity: 1, equipped: false }];
    const baseline = computeCharacter(fighterDraft(["medicine"]), context([healerGloves]));
    const unequipped = computeCharacter(draft, context([healerGloves]));
    expect(skillMod(unequipped, "medicine")).toBe(skillMod(baseline, "medicine"));
  });

  it("does not apply an invested item before it is invested", () => {
    const draft = fighterDraft(["medicine"]);
    draft.equipment = [{ itemId: healerGloves.id, quantity: 1, equipped: true, invested: false }];
    const baseline = computeCharacter(fighterDraft(["medicine"]), context([healerGloves]));
    const notInvested = computeCharacter(draft, context([healerGloves]));
    expect(skillMod(notInvested, "medicine")).toBe(skillMod(baseline, "medicine"));
    expect(
      notInvested.validation.some((validation) =>
        validation.message.includes("equipped but not invested")
      )
    ).toBe(true);
  });

  it("uses the highest item bonus rather than stacking armor, runes, and worn items", () => {
    const armorDraft = fighterDraft([]);
    armorDraft.equipment = [
      {
        itemId: chainMail.id,
        quantity: 1,
        equipped: true,
        invested: true,
        runes: [armorPotency.id, resilient.id],
      },
    ];
    const armorItems = [chainMail, armorPotency, resilient];
    const armorOnly = computeCharacter(armorDraft, context(armorItems));

    const bothDraft = fighterDraft([]);
    bothDraft.equipment = [
      ...armorDraft.equipment,
      { itemId: greaterBandsOfForce.id, quantity: 1, equipped: true, invested: true },
    ];
    const both = computeCharacter(bothDraft, context([...armorItems, greaterBandsOfForce]));

    // Chain mail with +1 potency is already a +5 item bonus to AC, so the
    // bands' +2 cannot stack on top of it.
    expect(both.ac).toBe(armorOnly.ac);
    // Resilient gives +1 to saves and the greater bands give +2; the higher
    // item bonus wins instead of adding to +3.
    expect(both.saves.fortitude).toBe(armorOnly.saves.fortitude + 1);
  });

  it("applies greater skill items at +2", () => {
    const baseline = computeCharacter(fighterDraft(["medicine"]), context([greaterHealerGloves]));
    const withGloves = computeCharacter(
      fighterDraft(["medicine"], [greaterHealerGloves]),
      context([greaterHealerGloves])
    );
    expect(skillMod(withGloves, "medicine")).toBe(skillMod(baseline, "medicine") + 2);
  });

  it("applies AC and saving-throw item bonuses", () => {
    const baseline = computeCharacter(fighterDraft([]), context([bandsOfForce]));
    const withBands = computeCharacter(fighterDraft([], [bandsOfForce]), context([bandsOfForce]));
    expect(withBands.ac).toBe(baseline.ac + 1);
    for (const save of ["fortitude", "reflex", "will"] as const) {
      expect(withBands.saves[save]).toBe(baseline.saves[save] + 1);
    }
  });

  it("applies a perception item bonus to perception and initiative", () => {
    const baseline = computeCharacter(fighterDraft([]), context([thirdEye]));
    const withAmulet = computeCharacter(fighterDraft([], [thirdEye]), context([thirdEye]));
    expect(withAmulet.perception).toBe(baseline.perception + 2);
    expect(withAmulet.initiative).toBe(baseline.initiative + 2);
  });
});
