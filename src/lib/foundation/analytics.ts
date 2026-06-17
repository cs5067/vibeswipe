export type AnalyticsEvent =
  | "auth_started"
  | "auth_completed"
  | "session_started"
  | "track_swiped"
  | "playlist_created"
  | "engine_candidates_loaded"
  | "paywall_viewed";

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export interface AnalyticsSink {
  identify(userId: string, traits?: AnalyticsProperties): void;
  track(event: AnalyticsEvent, properties?: AnalyticsProperties): void;
}

class NoopAnalytics implements AnalyticsSink {
  identify(): void {}
  track(): void {}
}

export const analytics: AnalyticsSink = new NoopAnalytics();
