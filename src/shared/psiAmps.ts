/**
 * Curated psychic psi-cantrip amps. The compendium stores the amp prose inside
 * each conscious mind's class feature, so this table keeps the table-facing
 * summary and heightened notes in one place. Amp casting spends 1 Focus Point.
 */
export interface PsiAmpInfo {
  spellId: string;
  name: string;
  mind: string;
  summary: string;
  heightened?: string;
}

export const PSI_AMPS: Record<string, PsiAmpInfo> = {
  "spell:pwzdSlJgYqN7bs2w": {
    spellId: "spell:pwzdSlJgYqN7bs2w",
    name: "Telekinetic Hand",
    mind: "The Distant Grasp",
    summary:
      "Target a Medium or smaller creature and Shove it with a spell attack against its Fortitude DC; it takes a -10-foot Speed penalty, and Sustaining lets you Shove again.",
    heightened:
      "Amp Heightened (4th): you can Disarm instead, and the hand grabs the dropped item.",
  },
  "spell:60sgbuMWN0268dB7": {
    spellId: "spell:60sgbuMWN0268dB7",
    name: "Telekinetic Projectile",
    mind: "The Distant Grasp",
    summary:
      "A successful hit pushes the target 5 feet; a critical success pushes it 10 feet in addition to doubling damage.",
    heightened: "Amp Heightened (+1): damage increases by 2d6 instead of 1d6.",
  },
  "spell:yyz029C9eqfY38PT": {
    spellId: "spell:yyz029C9eqfY38PT",
    name: "Telekinetic Rend",
    mind: "The Distant Grasp",
    summary:
      "The bursts deal 1d6 bludgeoning and 1d6 slashing damage; a critical failure also leaves the target Stunned 1.",
    heightened:
      "Amp Heightened (+2): both damage types increase by 1d6, and you add a third non-overlapping 5-foot burst.",
  },
  "spell:gpzpAAAJ1Lza2JVl": {
    spellId: "spell:gpzpAAAJ1Lza2JVl",
    name: "Detect Magic",
    mind: "The Infinite Eye",
    summary:
      "Gain a +1 status bonus to saves against magic from a detected enemy or hazard for 3 rounds.",
    heightened: "Amp Heightened (7th): the status bonus increases to +2.",
  },
  "spell:izcxFQFwf3woCnFs": {
    spellId: "spell:izcxFQFwf3woCnFs",
    name: "Guidance",
    mind: "The Infinite Eye",
    summary:
      "The target is not made temporarily immune, and you can cast it as a reaction when an ally fails and the bonus would change the result.",
    heightened: "Amp Heightened (6th): the bonus increases to +2.",
  },
  "spell:cNnHV97gPqxJ3Rrr": {
    spellId: "spell:cNnHV97gPqxJ3Rrr",
    name: "Glimpse Weakness",
    mind: "The Infinite Eye",
    summary: "The additional precision damage is 1d4+1.",
    heightened: "Amp Heightened (+2): the precision damage increases by 1d4+1.",
  },
  "spell:IxhGEKl63R4QBvkj": {
    spellId: "spell:IxhGEKl63R4QBvkj",
    name: "Frostbite",
    mind: "The Oscillating Wave",
    summary:
      "The orb deals 3d4 cold damage, and you gain temporary HP equal to half the damage dealt.",
    heightened:
      "Amp Heightened (+1): initial damage increases by 2d4 instead of 1d4, and the critical-failure weakness increases by 1.",
  },
  "spell:6DfLZBl8wKIV03Iq": {
    spellId: "spell:6DfLZBl8wKIV03Iq",
    name: "Ignition",
    mind: "The Oscillating Wave",
    summary:
      "Initial damage becomes 1d10 fire plus 1 fire splash; melee uses d12s, and you ignore your own splash.",
    heightened:
      "Amp Heightened (+1): initial damage increases by 1d10 (1d12 melee), splash by 1, and critical persistent fire by 1d4.",
  },
  "spell:dhpXpzt7TCm8TbHM": {
    spellId: "spell:dhpXpzt7TCm8TbHM",
    name: "Thermal Stasis",
    mind: "The Oscillating Wave",
    summary: "The spell's duration becomes 1 minute.",
  },
  "spell:4gBIw4IDrSfFHik4": {
    spellId: "spell:4gBIw4IDrSfFHik4",
    name: "Daze",
    mind: "The Silent Whisper",
    summary:
      "Damage becomes 1d10; a failed save gives weakness 1 to mental damage and a -1 status penalty to Will saves.",
    heightened: "Amp Heightened (+2): damage increases by 2d10, and the weakness increases by 1.",
  },
  "spell:vLzFcIaSXs7YTIqJ": {
    spellId: "spell:vLzFcIaSXs7YTIqJ",
    name: "Message",
    mind: "The Silent Whisper",
    summary: "The target can immediately spend its reaction to Step or Stride.",
    heightened: "Amp Heightened (4th): the reaction can instead Shove, Strike, or Trip.",
  },
  "spell:lpoWfblSMLcJfxsZ": {
    spellId: "spell:lpoWfblSMLcJfxsZ",
    name: "Forbidden Thought",
    mind: "The Silent Whisper",
    summary: "A failed save also leaves the target Stunned 1.",
  },
  "spell:0zU8CPejjQFnhZFI": {
    spellId: "spell:0zU8CPejjQFnhZFI",
    name: "Figment",
    mind: "The Tangible Dream",
    summary:
      "Create a flanking illusion in an unoccupied square; Sustaining moves it and extends the flanking benefit.",
  },
  "spell:TVKNbcgTee19PXZR": {
    spellId: "spell:TVKNbcgTee19PXZR",
    name: "Shield",
    mind: "The Tangible Dream",
    summary:
      "Create three shield layers; the duration becomes sustained up to 1 minute, and you can raise it again when you Sustain.",
  },
  "spell:sUr5KCpeE6AXfvPp": {
    spellId: "spell:sUr5KCpeE6AXfvPp",
    name: "Imaginary Weapon",
    mind: "The Tangible Dream",
    summary:
      "Target two creatures with separate attacks; your multiple attack penalty increases only after all the attack rolls.",
    heightened: "Amp Heightened (+1): damage increases by 2d6 instead of 1d6.",
  },
  "spell:5gophZ4AOKW4VW27": {
    spellId: "spell:5gophZ4AOKW4VW27",
    name: "Phase Bolt",
    mind: "The Unbound Step",
    summary:
      "The target is Off-Guard; the bolt ignores Hardness or piercing resistance equal to half the spell's rank.",
    heightened: "Amp Heightened (+1): damage increases by 2d4 instead of 1d4.",
  },
  "spell:sX2g6WFSQPNW9jzx": {
    spellId: "spell:sX2g6WFSQPNW9jzx",
    name: "Warp Step",
    mind: "The Unbound Step",
    summary: "Cast the spell as a single action.",
    heightened:
      "Amp Heightened (4th): you can teleport up to twice your Speed; the spell gains the teleportation trait.",
  },
  "spell:WOM9alxiTdp0HEVD": {
    spellId: "spell:WOM9alxiTdp0HEVD",
    name: "Distortion Lens",
    mind: "The Unbound Step",
    summary:
      "The duration becomes 1 minute but the lens cannot be Sustained to move; an ally can pass through it without spending extra movement, while enemies treat it as difficult terrain.",
  },
};

export function psiAmpFor(spellId: string): PsiAmpInfo | null {
  return PSI_AMPS[spellId] ?? null;
}
