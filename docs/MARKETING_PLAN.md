# vibeswipe — Marketing Plan (early stage)

*The Reddit post is one shot of a longer campaign. Here's the thinking around it.*

---

## The core insight driving all marketing

vibeswipe's growth engine is **the forcing loop itself**. Every time you send a friend a song, that's a piece of marketing — your friend sees the app, the note, the "send one back." Unlike most apps, **using it = spreading it.** So marketing's job early on isn't ads; it's:
1. Get the loop in front of people who'll *use it with friends* (not solo).
2. Make the shared artifact (the link/card) look good enough that the recipient is curious.
3. Measure whether the loop actually loops (do recipients send one back?).

This is the BeReal/Locket playbook: they barely advertised; the product was the ad (your friends *had* to be on it to play).

---

## The biggest pre-launch blocker to resolve first

**Spotify dev-mode user cap.** In Spotify's developer dashboard, an app in "development mode" can only be used by a small number (~25) of manually-added users. A public Reddit post could blow past that in minutes, and everyone after #25 hits an auth error — a disaster for a first impression.

Two paths:
- **Apply for Spotify extended/quota-extension** (takes days–weeks, may get rejected given they've tightened API access).
- **Decouple the demo from login** — use a **waitlist page** (no Spotify login) for the public post, and only let hand-added testers into the real app. This sidesteps the cap entirely for the validation test.

**Recommendation:** waitlist for the Reddit test. Don't gate your one-shot launch behind a 25-user ceiling.

---

## Channel plan (in priority order)

### 1. Reddit (primary test) — see LAUNCH_KIT.md
Cheap, high-signal, brutal honesty. Best place to learn if the idea has legs.

### 2. TikTok / IG Reels (the real growth channel if it works)
The forcing-songs bit is inherently video-native and funny. Content angles:
- "POV: your friend with the superiority complex about music finally has an app"
- Screen-record real reactions of friends getting force-fed songs.
- The "send one back" taste-duel between two friends.
Music + identity + a bit = the exact content that travels. This is where vibeswipe could actually pop, more than Reddit. Reddit validates; TikTok scales.

### 3. Group chats / your own friends (the truest test)
Before any of the above: get 5–10 of YOUR friends actually using it with you for a week. If your own friends don't keep forcing each other songs, no Reddit post saves it. This is the cheapest, highest-signal test of all — and it needs the dev-mode cap to handle ~10 people (fine).

### 4. Discord music communities
Servers around specific genres/artists. Share where it's allowed; these are dense pockets of "my taste is my identity" people.

---

## Sequencing (suggested)

- **Week 0 (this week):** get the loop working, test with your own friend group (5–10 people). Fix what's annoying.
- **Week 1:** waitlist page + Reddit posts (maker + social angles), 1–2 subs/day. Measure.
- **Week 2:** if signal is good, make 3–5 TikToks of real usage. This is the scale bet.
- **Ongoing:** only build more (notifications, corpus engine, multi-platform) once the loop is proven to loop.

---

## What to measure (write these down)

- **Reddit:** upvotes, comments, link clicks, "what's the link" asks, signups.
- **The loop metric that actually matters:** of people who receive a forced song, what % open it? What % send one back? That ratio is the whole business. If recipients don't re-engage, it's not viral, it's just sharing.
- **Retention:** do your test friends still use it on day 3? Day 7?

---

## Honest risks to keep in view

- **Spotify dependency** — the whole thing rides on their API; they've been tightening it. Multi-platform (Apple Music) is the hedge, already architected for.
- **Cold-start** — the loop needs at least 2 friends to be fun. A solo user has nothing to do. Onboarding must push "invite a friend" immediately.
- **It might just be a feature, not a company** — that's OK for now. The goal this month is "is it fun + does it spread," not "is it a business."
