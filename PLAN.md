# vibeswipe — Growth & Monetization Plan

*Drafted April 2026. Living document — revisit quarterly.*

## 1. Where we are

You already have a working Next.js 16 web app (~3k lines of app code) with Spotify OAuth, a real recommendation engine (genre graph, discovery strategies, taste-profile model), swipe cards with framer-motion, playlist export, and a Zustand session store. A React Native / Expo mobile shell exists alongside the web app. The core loop — login → swipe → export playlist — is functional.

That puts us past "idea" and into "polish and distribute." The question is no longer *can we build it*, it's *how do we make it grow and pay for itself*.

## 2. Strategic thesis

The pitch in one sentence: **vibeswipe learns your taste in 50 swipes better than Spotify learns it in 5 years, then builds the playlists you're too lazy to build yourself — across every streaming service you use.**

Three pillars hold this up:

1. **The swipe mechanic is the addiction hook.** Variable reward, low friction, pleasurable to use in short bursts.
2. **The taste model is the differentiator.** Active signal (swipes) beats passive signal (play counts) for learning preference. This is what justifies a subscription.
3. **Multi-platform is the moat.** Discz is Spotify-only. If we work with Apple Music, YouTube Music, and Tidal, we become the neutral discovery layer that outlives any single streaming service.

## 3. Product roadmap

### Phase 0 — Foundations (next 4 weeks)

Goal: the current app is ship-quality on iOS, Android, and web.

- Harden the Spotify integration: token refresh edge cases, rate-limit handling, graceful degradation when the API is slow.
- Ship the React Native mobile app to TestFlight and Play Store internal testing. Mobile is where swipe apps live — web is for SEO and sharing, not the primary surface.
- Audio preview playback on swipe cards (Spotify 30-second previews). Critical — no one swipes on a song they can't hear.
- Onboarding flow: 3 screens, connect Spotify, done. Measure time-to-first-swipe.
- Analytics: PostHog or Amplitude. Track login, first swipe, 10th swipe, playlist created, day-7 return. These are the numbers that tell us if anything works.

### Phase 1 — MVP+ (weeks 5–12)

Goal: a product people will actually tell their friends about.

- **Taste profile visualization.** After 50 swipes, show the user a "your taste" page — top genres, era distribution, energy profile, "you lean indie-pop with a 2010s tilt and a surprising country streak." This is the #1 shareable artifact. Make it beautiful, screenshot-optimized, and one-tap shareable to Instagram Stories and TikTok.
- **Mood / context modes.** "Gym," "study," "long drive," "sad hours." Each is a different swipe session that feeds a different playlist. Prevents the app from feeling repetitive.
- **Playlist curation smart defaults.** Auto-title playlists based on the mood + vibe ("Late-night indie · April 2026"). Auto-generate a cover image using the dominant colors from the album art.
- **Undo swipe / super-like.** Small polish items that dramatically increase perceived quality.
- **Daily session target.** Gentle push notification: "20 new tracks picked for you today." Drives the daily habit the current sprint-based usage pattern lacks.

### Phase 2 — Multi-platform (months 3–6)

Goal: become platform-agnostic.

- Apple Music integration via MusicKit. This is the biggest single unlock; ~100M additional addressable users and a meaningful moat against Discz.
- YouTube Music and Tidal via their respective APIs. Lower priority but cheap to add once the abstraction exists.
- Cross-platform export: "swipe on Spotify tracks, export to Apple Music." This is a killer feature for anyone in the middle of switching services — and there are a lot of them.
- "Bring your taste with you." If a user switches from Spotify to Apple Music, their vibeswipe taste profile follows. This is the feature that makes churn from us painful.

### Phase 3 — Social layer (months 6–9)

Goal: organic growth through network effects.

- **Taste compatibility.** "You and Sarah are 73% compatible — here are the 12 songs you'd both love." Not a dating feature — a friends feature. The dating angle is already taken and regulated.
- **Shared playlists.** Two users swipe on the same pool, only mutual likes make the playlist. Great for couples, roadtrips, parties.
- **Profile pages.** Public (opt-in) taste profiles, shareable as a link. This is the TikTok-bait.
- **Song drops.** Artists (or labels) can submit tracks into the discovery pool. This opens a B2B revenue line down the road.

### Phase 4 — Intelligence (months 9–12)

Goal: the algorithm becomes the product.

- Richer taste modeling: audio features from Spotify's API, tempo, valence, instrumentalness, plus swipe-time-weighted preference decay.
- Recommendation explanations: "We picked this because you liked X and Y — similar energy, different genre." Transparency builds trust.
- Weekly taste evolution reports. "You're listening to 40% more acoustic music than 3 months ago." People love seeing their own data.

## 4. Monetization

### Model: freemium subscription, hybrid with light ads on free.

Based on what's working for music apps in 2026 and RevenueCat's subscription benchmarks, the numbers that work are:

- **Free tier:** 50 swipes per day, Spotify only, 1 playlist at a time, small banner ad every ~20 swipes.
- **vibeswipe Plus — $4.99/month or $39.99/year:**
  - Unlimited swipes.
  - All streaming platforms.
  - Advanced mood / context modes.
  - Cross-platform export.
  - Taste compatibility and shared playlists.
  - No ads.
  - Playlist history (free users only keep the current active playlist).

### Pricing rationale

$4.99/mo undercuts most comparable utility subscriptions and lands below the "think twice" threshold. The annual plan ($39.99) nets ~33% off and dramatically improves LTV.

Target conversion: 3–5% free → paid (RevenueCat median for utility/lifestyle apps is ~4%). At 100K MAU and 4% conversion, that's 4,000 paying users × $4.99 = **~$20K MRR**. At 500K MAU, ~$100K MRR — this is the realistic "real business" target for year 2.

### Secondary revenue (later)

- **Affiliate revenue** from Spotify / Apple Music referrals — we drive signups, they pay per conversion. Small but free money.
- **Label / artist promoted slots** (clearly marked). Artists pay to enter the discovery pool. Only explore this post-100K MAU so the pool quality stays high.
- **API / white-label** the taste engine to other music apps. Distant but real.

## 5. Marketing & distribution

The research is blunt: marketing this via paid acquisition will bleed money. CAC for a $5/mo subscription is brutal. We need **organic or nothing** until we have retention data that justifies paid spend.

### Launch strategy

- **Product Hunt launch.** Discz launched there; it's the right venue. Aim for a Tuesday–Thursday slot, line up 20+ friends for initial upvotes. Target: top 5 of the day.
- **Hacker News "Show HN"** post. Audience loves "I rebuilt X but smarter." Angle: "I got fed up with Spotify's recommendations so I built a swipe-based discovery app with a real taste model."
- **Reddit:** r/Music (15M), r/TrueMusic, r/SpotifyPlaylists, r/AppleMusic, r/indieheads, r/hiphopheads, r/popheads. Not spam — genuinely useful posts. "I built this because I was tired of Discover Weekly sucking. Would love feedback."
- **App Store Optimization.** Keyword target: "music discovery," "playlist maker," "tinder for music." Screenshots that show the swipe + the taste profile reveal.

### Content & virality engine (this is where the bulk of growth comes from)

The taste-profile reveal is the single most shareable asset. Make it feel like a Spotify Wrapped moment, shrunk to ~30 seconds of swiping.

- **TikTok strategy.** Own account posting daily: "I let vibeswipe learn my taste in 50 swipes — here's what it said about me." User-generated content encouraged via share buttons that auto-tag. Tiny creator partnerships ($50–200 per post) with music-TikTok accounts in the 10K–100K follower range — much better ROI than big creators.
- **Instagram Stories reshares.** "Share your taste card" button that posts directly with a branded frame. Every share is a free install ad.
- **SEO content.** Blog posts that rank: "best Spotify alternatives for music discovery," "how to find new music in 2026," "why your Discover Weekly got worse." These are high-intent queries with mediocre existing content.
- **Partnerships.** Reach out to music bloggers and newsletters (Pitchfork-adjacent indies, Water & Music, The Ringer's music coverage). Offer them early access and ask for coverage, not payment.

### Retention loops

- Weekly "your taste evolved" email — low-effort, high re-engagement.
- Push: "15 new songs matching your vibe are waiting" — not daily, frequency-capped to avoid burnout.
- Referral mechanic: "Invite a friend, get one month free." Simple, works.

## 6. Tech & ops priorities

- **Cost control.** Vercel/Fly.io hosting, PlanetScale or Neon for Postgres, Cloudflare R2 for any asset storage. Target < $200/mo infra at 10K MAU, < $2K/mo at 100K MAU.
- **Don't overbuild the algorithm early.** The current engine is fine. Iterate based on which swipes predict which likes — log everything, analyze later.
- **Abstract the streaming provider layer now.** Even if we don't ship Apple Music for months, wrap every Spotify call in an interface so the multi-platform phase isn't a rewrite.
- **Mobile is the priority surface.** Swipe apps die on web. The React Native app needs the polish budget.
- **Privacy & legal.** Clear data policy, no selling user listening data, GDPR/CCPA-compliant from day one. Apple and Spotify both enforce this aggressively on audits.

## 7. Risks & how we counter them

- **Spotify ships this natively.** Mitigate by going multi-platform fast. If we're Apple Music + YouTube Music + Tidal within 6 months, Spotify doing it just helps us by validating the concept to users.
- **Spotify / Apple API changes.** They've both restricted third-party access before (see: Spotify audio features endpoint deprecation in 2024). Monitor, keep fallbacks, don't build critical features on undocumented endpoints.
- **Low retention (music discovery is bursty).** Counter with mood modes, social features, and the weekly taste evolution email — all designed to create return visits.
- **Discz or a new entrant outspends us.** They can't, really — $500K seed doesn't buy much marketing. Our advantage is speed and multi-platform. Move faster.
- **Founder burnout on a side project.** This plan is 12+ months of work. Be honest about what's a side project and what's full-time. Hit 1K MAU before considering either.

## 8. Success metrics & checkpoints

- **Month 3 target:** 5K total installs, 1K MAU, 50% day-7 retention, 100 paying subscribers.
- **Month 6:** 50K installs, 10K MAU, 400 paying ($2K MRR), Apple Music shipped.
- **Month 12:** 500K installs, 100K MAU, 4,000 paying ($20K MRR), at least two platforms beyond Spotify live.
- **Month 18:** If we've cleared $50K MRR, this is a real business — consider raising or hiring. If we're stuck at <$10K MRR, reassess honestly.

## 9. Immediate next actions (this week)

1. Harden Spotify token refresh + add audio previews on swipe cards.
2. Instrument analytics (PostHog). Specifically: time-to-first-swipe, swipes-per-session, day-7 return.
3. Build the taste-profile reveal screen with share-to-story export.
4. Submit React Native app to TestFlight for internal testing.
5. Write the Product Hunt + Show HN drafts.

Nothing here is locked in. This is a map, not a contract.
