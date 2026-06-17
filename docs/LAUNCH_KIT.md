# vibeswipe — Launch Kit

*Everything for the Reddit launch. Read top to bottom tomorrow.*

---

## ⚠️ The gate: do this BEFORE posting anything

The post is downstream of a working demo. In order, tomorrow morning:

1. **Run the app** — `npm run dev` in your terminal, open http://localhost:3000, connect Spotify.
2. **Walk the loop** — set a username on /friends, swipe, hit "Make a friend listen", grab the share link, open it on your phone.
3. **Confirm the make-or-break thing: does audio preview play?**
   - If YES → the demo works, record it.
   - If NO (preview button missing / only "Open in Spotify") → we wire the **Deezer preview fallback** FIRST. ~1 hour of work. Do not post a silent demo.
4. **Record the demo video** (see DEMO_SCRIPT below).
5. **Then** post.

Why this matters: 90% of the post's success is the video. A janky or silent demo = dead post, and you only get one first impression in each subreddit.

---

## The positioning (locked from our calls)

- **NOT** "Tinder for music discovery" → Spotify shipped that natively; saying it promotes *their* feature.
- **YES** the social/forcing angle: *"make your friends listen to your taste."* BeReal/Locket for music.
- The one-liner a normal person repeats to a friend:
  > **"it's the app where you force your friends to listen to your music taste"**
- Never name Spotify's Discover feature in the post. Don't educate people about the competitor.

---

## DEMO VIDEO SCRIPT (30–45 sec, phone screen recording)

Vertical, phone. Keep it FAST — no intro, no logo lingering.

1. (0–5s) Already mid-swipe on the deck. Swipe one left, one right. Motion first — hook the eye.
2. (5–12s) Tap **"Make a friend listen"** → the sheet slides up. Type a funny note: *"you're not allowed to skip this"*.
3. (12–18s) Pick a friend / hit get-link. Show the native share sheet popping (proof it's real).
4. (18–28s) **Cut to a second phone** (or the link opening): the recipient sees "Abid says you HAVE to hear this", the art, hits **play**, music plays. THIS is the payoff shot — make it clear sound is playing.
5. (28–35s) Quick flash of the inbox with the rec sitting there. End on the app name.

No voiceover needed. Add one text caption at the start: *"i have the best music taste and now my friends can't escape it"*. Background: whatever song is playing.

Tools: QuickTime (Mac screen record) or your phone's built-in recorder. Trim in any basic editor.

---

## REDDIT POSTS (title + body variants)

Pick the variant per subreddit. **Titles are 90% of Reddit.** Lead with a feeling or a bit, never a pitch.

### Variant A — the "bit" angle (best for general/casual subs)
**Title:** I built an app so I can force my friends to listen to my music (they hate it, I love it)
**Body:**
> I'm the guy in every group chat going "no but you HAVE to hear this one." So I built the thing: you swipe through songs, and when you find one, you send it straight to a friend with a note. It lands in their inbox and I can see when they actually listen (no more "yeah I'll check it out" lies).
>
> It's kind of like BeReal/Locket but for music taste. Still early and a bit rough. Not selling anything — just want to know if this is fun for anyone besides me, or if I've built a weapon only I want.
>
> Happy to drop the link if people wanna try it — would love brutal feedback.

### Variant B — the "maker" angle (best for r/SideProject, r/webdev, indie subs)
**Title:** I got tired of my song recs dying in "I'll listen later" — so I built an app that tells me when friends actually play them
**Body:**
> Built a little music app over the last few weeks. Core idea: swipe to find songs, send them to friends in-app with a note, and you get notified when they actually listen. Built it provider-agnostic so it's not locked to one streaming service.
>
> Tech: Next.js + Supabase, recommendation layer based on playlist co-occurrence. Solo project, early, want real feedback before I take it further.
>
> Link in comments. Roast it.

### Variant C — the "taste flex" angle (best for music-nerd subs)
**Title:** made a thing where you build a "you have to hear this" list and force-feed it to your friends
**Body:**
> The premise is dumb and I love it: swipe through music, and the songs you're proud of get sent directly to friends — with receipts when they actually listen. It's for people who treat their music taste as a personality trait (me).
>
> Early and scrappy. Not a business pitch, genuinely just want to see if other people find this as fun as I do. Will share the link if anyone's curious.

**Rule for all:** put the actual link in a **comment**, not the post body (most music subs auto-remove link posts; text posts with the maker engaging do far better). When someone says "link?", reply with it.

---

## SUBREDDIT SHORTLIST (verify each sub's rules tomorrow before posting)

Post to ONE or TWO per day, not all at once — spreading lets you fix the pitch between posts, and avoids spam flags.

| Subreddit | Why | Watch out for |
|---|---|---|
| r/SideProject | Makers expect "I built X", friendly to early stuff | Low non-maker traffic |
| r/InternetIsBeautiful | Huge reach if it lands | Strict, must be genuinely novel + working link |
| r/spotify | Your exact users | **Check self-promo rules — may need mod ok** |
| r/musicsuggestions / r/music | Music nerds | r/music is anti-self-promo; tread carefully |
| r/playlists | People who care about curation | Smaller |
| r/webdev or r/nextjs | If using maker angle B | Must be dev-framed |
| r/letsbefriends-style / r/teenagers (if young aud.) | Social angle resonates | Match the room's tone |

**Etiquette that keeps you from getting banned:**
- Read each sub's rules + "no self-promo" pinned posts FIRST.
- Comment in the sub a few times before posting (cold accounts get auto-filtered).
- Reply to every comment fast in the first 2 hours — Reddit's algo rewards early engagement.
- Don't copy-paste the same post across subs same-day. Tailor each.
- If a mod removes it, message them politely; don't repost.

---

## SUCCESS THRESHOLD (decide if this is worth continuing)

From the council's Executor test. After ~3–5 communities:
- **Strong signal:** 50+ signups / link clicks, or a wave of "I need this / what's the link" comments.
- **Weak signal:** crickets, a few polite upvotes, no one asks for the link.

Write the numbers down. If weak across the board, the social loop isn't the wedge either — and that's worth knowing fast, before the corpus crawler or anything else.

---

## CAPTURE: where does the link send people?

Right now the link sends people into the live app (needs Spotify login). Two options for tomorrow:
- **A) Send straight to the app** — higher intent, but Spotify-login friction + dev-mode user cap (Spotify limits non-approved test users to 25 in dev mode — verify this isn't a wall).
- **B) A dead-simple waitlist page** (email capture + the demo video) — lower friction, measures pure interest, no login wall. **Recommended for the test** — you want the signal, not the installs yet.

⚠️ **Spotify dev-mode cap is a real launch blocker to check:** in dev mode only ~25 hand-added users can log in. A public Reddit post could hit that instantly. So option B (waitlist) is almost certainly the right move for day one. See MARKETING_PLAN.md.
