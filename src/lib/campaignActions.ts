/**
 * Tracks the last time a budget action was taken per campaign.
 * Persisted in localStorage under the key "campaign_actions_v1".
 */

export type CampaignActionsStore = Record<string, string> // campaign -> ISO date string

const STORAGE_KEY = 'campaign_actions_v1'

export function loadActions(): CampaignActionsStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CampaignActionsStore) : {}
  } catch {
    return {}
  }
}

export function saveActions(store: CampaignActionsStore): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // storage quota or private mode — silently ignore
  }
}

export function recordAction(
  store: CampaignActionsStore,
  campaign: string,
  date: Date = new Date(),
): CampaignActionsStore {
  const next = { ...store, [campaign]: date.toISOString() }
  saveActions(next)
  return next
}

export function getDaysSinceAction(
  store: CampaignActionsStore,
  campaign: string,
  now: Date = new Date(),
): number | null {
  const iso = store[campaign]
  if (!iso) return null
  const last = new Date(iso)
  return Math.floor((now.getTime() - last.getTime()) / 86_400_000)
}

/**
 * Returns true when a Scale/Reduce recommendation should be suppressed.
 * @param cooldownDays  Minimum days between actions (14 for biweekly, 30 for monthly).
 */
export function isInCooldown(
  store: CampaignActionsStore,
  campaign: string,
  cooldownDays: number,
  now: Date = new Date(),
): boolean {
  const days = getDaysSinceAction(store, campaign, now)
  if (days === null) return false
  return days < cooldownDays
}

export function daysUntilReview(
  store: CampaignActionsStore,
  campaign: string,
  cooldownDays: number,
  now: Date = new Date(),
): number | null {
  const days = getDaysSinceAction(store, campaign, now)
  if (days === null) return null
  const remaining = cooldownDays - days
  return remaining > 0 ? remaining : null
}
