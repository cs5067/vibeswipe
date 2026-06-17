export type EntitlementTier = "free" | "plus" | "tester";

export interface EntitlementState {
  tier: EntitlementTier;
  dailySwipeLimit: number | null;
  canUseAllProviders: boolean;
  canExportCrossProvider: boolean;
  canCreateMultiplePlaylists: boolean;
}

export const TESTER_ENTITLEMENTS: EntitlementState = {
  tier: "tester",
  dailySwipeLimit: null,
  canUseAllProviders: true,
  canExportCrossProvider: true,
  canCreateMultiplePlaylists: true,
};

export const FREE_ENTITLEMENTS: EntitlementState = {
  tier: "free",
  dailySwipeLimit: 50,
  canUseAllProviders: false,
  canExportCrossProvider: false,
  canCreateMultiplePlaylists: false,
};

export function getDefaultEntitlements(): EntitlementState {
  return process.env.NEXT_PUBLIC_TESTER_MODE === "true"
    ? TESTER_ENTITLEMENTS
    : FREE_ENTITLEMENTS;
}
