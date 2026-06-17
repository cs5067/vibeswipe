# Tomorrow — run sheet

Do these in order. Don't skip to the post.

## 1. Smoke-test the app (15 min)  ← the gate
- [ ] `npm run dev`, open http://localhost:3000
- [ ] Connect Spotify (confirms login + profile auto-creation works)
- [ ] Go to /friends, set a username
- [ ] Swipe a few cards
- [ ] Tap "Make a friend listen" → get a share link
- [ ] Open the link on your phone → **does the song PLAY?**  ← make-or-break
- [ ] Check /inbox renders

**If anything errors:** tell Claude exactly what (screen + console). Most likely culprits:
preview_url being null (needs Deezer fallback), or a Supabase query bug. These are quick fixes.

## 2. Fork in the road based on the smoke test
- **Previews play + loop works** → record the demo (LAUNCH_KIT > DEMO SCRIPT).
- **Previews dead** → have Claude wire Deezer preview fallback (~1hr), re-test, then record.

## 3. Decide capture surface (5 min)
- [ ] Confirm Spotify dev-mode user cap (dashboard). If ~25-user limit is real:
- [ ] → Build the simple **waitlist page** (Claude can do this fast) instead of sending Reddit to the login.

## 4. Record demo (30 min)
- [ ] 30–45 sec vertical screen recording per the script
- [ ] One text caption, real music playing, end on app name

## 5. Prep the posts (15 min)
- [ ] Pick 2 subreddits for day one (LAUNCH_KIT shortlist)
- [ ] Read each sub's rules + self-promo policy
- [ ] Pick the matching title/body variant, tailor slightly
- [ ] Upload demo (Reddit native video or a link)

## 6. Post + babysit (first 2 hrs)
- [ ] Post to sub #1 (text post, link in comments)
- [ ] Reply to EVERY comment within minutes for the first 2 hours
- [ ] Note numbers: upvotes, comments, link clicks, signups

## 7. Read the signal
- [ ] Strong (50+ signups / "I need this" wave) → plan TikTok + invite-a-friend onboarding
- [ ] Weak (crickets) → regroup; the loop may not be the wedge. Better to know now.

---

### What Claude has ready to build fast tomorrow if needed:
- Deezer preview fallback (if Spotify previews are dead)
- Waitlist landing page (if dev-mode cap forces it)
- "They listened" notification back to the sender (the missing half of the loop)
