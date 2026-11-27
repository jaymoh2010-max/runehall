import type { CharacterDraft } from "./types";

/**
 * Commander tactics are actions with the `tactic` trait in the Battlecry!
 * data. The compendium does not mark expert/master/legendary tiers, so the
 * picker exposes the full list and leaves tier access to the table.
 */
export interface CommanderTactic {
  id: string;
  name: string;
}

const TACTICAL_EXPANSION = "feat:7CbjQCIEiGRp9Q2n";
const TACTICAL_EXCELLENCE = "feat:a7sCZ2ehfsLQutvO";
const EFFICIENT_PREPARATION = "feat:UvQjCHNAQVhKvTWb";
const COMMANDER_DEDICATION = "feat:e9iVLfL7KIfUG3NV";

export const COMMANDER_TACTICS: ReadonlyArray<CommanderTactic> = [
  { id: "act:Z0HyZyvCe3Y1Chaa", name: "Alley-Oop" },
  { id: "act:zt5fgBBOQpr84CGE", name: "Bloody Guillotine" },
  { id: "act:3sNSr6NEVkUZ0dIr", name: "Buckle-Cut Blitz" },
  { id: "act:Kp325Qf0qpF6RCDE", name: "Coordinating Maneuvers" },
  { id: "act:yT2A0CxSA5nJ8e7n", name: "Corpse Crenellation" },
  { id: "act:k50ynPhpPSPZ4Akg", name: "Cry Havoc!" },
  { id: "act:UJi0VYnhVSdnl9II", name: "Defensive Retreat" },
  { id: "act:q1dvlKJI2Kfegc4Y", name: "Demoralizing Charge" },
  { id: "act:c5jVVnNYlP5HB6Ob", name: "Double Team" },
  { id: "act:lI4JCQcqvrZE2U5n", name: "End It!" },
  { id: "act:GkcfzMAJVX159ua7", name: "Executioner's Volley" },
  { id: "act:2U7V8K0zSFGyZHrP", name: "For Talmandor! For Freedom!" },
  { id: "act:URxnrN8ji84AoVup", name: "Gather to Me!" },
  { id: "act:ut0jFv67YpvHBzD9", name: "Insta-Ballista" },
  { id: "act:EKEZGfOBKTNWTFDe", name: "Mirrored Wall" },
  { id: "act:bAXkEXAlnBx78S7t", name: "Mountaineering Training" },
  { id: "act:zuTNF3UEr0ZNleqR", name: "Naval Training" },
  { id: "act:BfC5pWAns8PNewW3", name: "Passage of Lines" },
  { id: "act:zLFfwNmmPTND6OMO", name: "Pincer Attack" },
  { id: "act:NVLqYqkkQaCdnWWk", name: "Piranha Assault" },
  { id: "act:6YIG6eVGTplWubGb", name: "Pop, Drop, and Lock" },
  { id: "act:5yBBgZ7OCWWJsnLo", name: "Protective Screen" },
  { id: "act:iuFPNbfhVXvbCPRO", name: "Ready, Aim, Fire!" },
  { id: "act:NjS64g60oV74XZjq", name: "Reload!" },
  { id: "act:ILwYke30PIAr2CVX", name: "Roaring Charge" },
  { id: "act:ZI7TLmmUu7fYLrP0", name: "Sanguine Revitalization" },
  { id: "act:h3NqgU6MEEF7mgzH", name: "Seek and Destroy" },
  { id: "act:EZcykqDJzQyZmJ7E", name: "Shadows in the Moonlight" },
  { id: "act:LAo3ERyiaHx3E8qg", name: "Shields Up!" },
  { id: "act:OULAoPQYFoiRhjXP", name: "Slip and Sizzle" },
  { id: "act:73W3mBLXRPfeVl3G", name: "Strike Hard!" },
  { id: "act:7HRhXh46dJVb241Y", name: "Stupefying Raid" },
  { id: "act:KtxzyElOleyy74Lg", name: "Tactical Takedown" },
  { id: "act:HUJBYqs2vTTBeZgO", name: "Take the High Ground" },
  { id: "act:Czcdh3pPzQ7y1cV7", name: "The Bigger They Are" },
  { id: "act:DGmzeAr4IfCnKN0R", name: "Valkyrie's Charge" },
  { id: "act:5stdIykWux9WHqce", name: "Wait For It..." },
];

export const COMMANDER_TACTICS_BY_ID = new Map(
  COMMANDER_TACTICS.map((tactic) => [tactic.id, tactic])
);

/** All feat ids selected by the character, including repeatable slots. */
export function commanderFeatIds(draft: CharacterDraft): string[] {
  return [
    ...Object.values(draft.feats.ancestry),
    ...Object.values(draft.feats.class),
    ...Object.values(draft.feats.skill),
    ...Object.values(draft.feats.general),
    ...Object.values(draft.feats.freeArchetype),
    ...draft.feats.extras,
    ...Object.values(draft.featChoices).flat(),
    ...(draft.backgroundFeat ? [draft.backgroundFeat] : []),
  ];
}

export interface CommanderLimitBonuses {
  folio: number;
  prepared: number;
}

/** Bonuses from feats and the Commander Dedication. */
export function commanderLimitBonuses(featIds: Iterable<string>): CommanderLimitBonuses {
  const counts = new Map<string, number>();
  for (const id of featIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const expansion = Math.min(20, counts.get(TACTICAL_EXPANSION) ?? 0);
  const excellence = Math.min(2, counts.get(TACTICAL_EXCELLENCE) ?? 0);
  const efficient = Math.min(1, counts.get(EFFICIENT_PREPARATION) ?? 0);
  const dedication = Math.min(1, counts.get(COMMANDER_DEDICATION) ?? 0);
  return {
    folio: expansion * 2 + excellence * 2 + dedication * 2,
    prepared: excellence + efficient + dedication,
  };
}

export function commanderFolioLimit(level: number, featIds: Iterable<string> = []): number {
  const base = level >= 19 ? 11 : level >= 15 ? 9 : level >= 7 ? 7 : 5;
  return base + commanderLimitBonuses(featIds).folio;
}

export function commanderPreparedLimit(level: number, featIds: Iterable<string> = []): number {
  const base = level >= 19 ? 6 : level >= 15 ? 5 : level >= 7 ? 4 : 3;
  return base + commanderLimitBonuses(featIds).prepared;
}
