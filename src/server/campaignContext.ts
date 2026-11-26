import type { CharacterDraft, CharacterContext } from "../shared/types";
import { getCampaign } from "./access";
import { contextForDraft } from "./compendium";
import type { CharacterRow } from "./db";

/**
 * Campaign variants such as Free Archetype and Automatic Bonus Progression
 * change derived statistics. Every server-side recomputation must use the
 * character's campaign context, not the bare `contextForDraft` defaults.
 */
export function contextForCampaign(
  campaignId: string | null | undefined,
  draft: CharacterDraft
): CharacterContext {
  const campaign = campaignId ? getCampaign(campaignId) : null;
  return contextForDraft(
    draft,
    Boolean(campaign?.free_archetype),
    Boolean(campaign?.automatic_bonus_progression)
  );
}

export function contextForCharacter(row: CharacterRow, draft: CharacterDraft): CharacterContext {
  return contextForCampaign(row.campaign_id, draft);
}
