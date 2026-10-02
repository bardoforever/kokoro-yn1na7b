# Gameplay hotfixes on the published build

These fixes were made in a cloud session, directly on the built files in this
repo, because the readable source (`tomodachi-life-vr` on the Mac) wasn't
available there. **Port each one to the source before the next build from the
Mac, or that build will undo them.** `patch.py` applies them to a fresh build
and is safe to run more than once.

Every fix was checked by playing the game at true speed in a test harness. The
harness uses a virtual clock so slow software rendering doesn't put the game in
slow motion, and it includes the Quest 3 emulator for point-and-click and
hand-feeding tests.

## F1 — Normal pacing by default (fixes "Needs 4 free Miis")
- **Bug:** the main startup turned fast "demo" pacing on unless the URL had
  `?realtime`. With fast pacing, every Mii got a want within about a minute and
  was sad by minute 2. A Mii with a problem is not `available`, so all 12 were
  blocked and no scene, minigame, chat or visit could start.
- **Fix:** `setFastPacing(params.has('fast'))`, so fast pacing is now opt-in
  with `?fast`.
- **Bug:** the old normal pacing was so slow that nothing happened during a
  play session (a want every ~50 min, a full tummy lasting 3 h).
- **Fix (resident pacing table):** `hungerPerMinute 100/120`,
  `wantEveryMin 12`, `wantExpireMin 45`. Fast-mode values are unchanged.

## F2 — Cap simultaneous problems
- **Fix (actor update, the `pool:` argument to the resident tick):** don't
  start a new want while at least ceil(N/4) Miis already have a problem.

## F3 — Autonomous island life cadence (normal pacing)
- Group scenes: every 25–50 min → **every 2.5–5 min** (scenes `update`).
- Chats: every 45–105 s → **every 20–45 s** (social `update`, `E` timer).
- Social/relationship needs roll: every 4–8 min → **every 1.5–3 min**
  (`D` timer).
- The needs roller (`H()`) now stops while half or more of the island already
  has a problem.

## F4 — "Wants a pet" was a dead feature
- **Bug:** poking a pet bubble called `game.openPet`, which was never defined,
  and nothing ever created a `pet` problem.
- **Fix:** the needs roller now gives pet-less adults a `pet` need (in the
  `a < .34` band, before the photo need). Main defines
  `game.openPet = actor => talk.openChoice({...dog/cat/bunny/chick...,
  onPick: kind => { clear the problem; pets.give(actor, kind); save }})`.

## F5 — A craved food was refused when the Mii was full
- **Bug:** both `actor.receiveFood` and the resident feed function returned
  early when `hunger >= 97`. A Mii craving an apple refused the apple, so the
  want couldn't be solved. The resident early-out also returned taste `full`,
  which the eat popup had no label for, so it crashed ("t is not iterable").
- **Fix:** both full checks skip the early-out when the food is the exact
  craved item. The popup label falls back to `So full!` / `Yum!`.

## F6 — Lingo panel crash guard
- `topics[problem.topic].ask` had no guard; a missing or renamed topic threw
  every frame and the panel showed no buttons. It now falls back to the
  `phrase` topic.

## F7 — A pending level-up froze the Mii
- **Bug:** `available` required `rewardsPending !== 1`, so a Mii that leveled
  up sat out of every scene, chat, game and visit until the player collected
  the reward. Over a session more and more Miis froze.
- **Fix:** that condition is removed from `available`. The level-up star
  bubble still shows, and poking it still opens the reward.

## F8 — Fight dialog said "It was about undefined."
- The fight panel now shows `They had a falling out.` when there's no topic.
  The debug "Start a fight" button now sets a topic, as natural fights do.

## F9 — Dead evenings and rainy days
- **Old schedule:** home from 18:30, for 1.5 h after waking, 12:00–13:00, and
  all day in rain or snow. All social life happens outdoors.
- **New schedule:** home 45 min after waking, 12:00–12:30, from 1.5 h before
  the Mii's own bedtime (20:00–21:45 by energy), and in rain or snow only for
  low-energy Miis (`energy < 4`).

## F10 — Debug scene buttons ("Needs 4 free Miis")
- When there aren't enough fully free Miis, the debug scene buttons now
  recruit any awake Mii that isn't busy, in a chat or in an accident.

## F11 — Minigames had no way out, and invites were rare
- **Bug:** a running minigame had no quit, time limit or walk-away check. A
  game that waits for the player (Bowling waits for two throws) kept the Mii
  stuck forever and blocked every other invite.
- **Fix (host `update`):** if the player is more than 8 m from the game frame
  for 6 s, set `S.quit`, have the Mii say "Aww... let's play later!" and
  `finish(false)`. The loss branch skips the "Hehe, I win!" gloat and the
  junk prize box when `S.quit` is set.
- Auto-invites at normal pacing: every 50 min → **every 6–12 min**.
- Accidents at normal pacing: every 40–100 min → **every 15–30 min**
  (events `update`).

## F12 — The bowling ball rolled backwards and never hit a pin
- **Bug:** `Object3D.localToWorld()` changes its argument. The roll update did
  `ball.position.copy(lane.localToWorld(r))` and then kept using `r` as a
  lane-local position. Once the ball touched the floor it snapped to the
  gutter, raced backwards at ~24 m/s, and the pin hit test read world
  coordinates, so no pin could ever fall.
- **Fix:** both clamps use `lane.localToWorld(r.clone())`. Verified: the
  first throw knocked down 9 pins.

## F13 — Weddings never finished
- **Bug:** between "YES! Of course I will!" and the wedding there was a 2.8 s
  gap where the couple counted as `available`, so the auto-chat grabbed them
  ("Oh, hi Sam!"). When that small talk ended it released them from the
  wedding script. The vows got mixed in with chit-chat, and the line that
  marries them never ran, so they stayed sweethearts.
- **Fix:** on "YES", `res.ceremony = now + 60 s` for both Miis; `available`
  is false while `ceremony > now`, and the lock expires on its own. The wedding
  (`X`) removes any chats involving the couple before its script starts, and
  clears the lock when it finishes. Verified: the vows play cleanly and the
  news reads "Otto and Kai got married!", with the relation now `spouse`.

## F14 — A birthday party froze the whole island
- **Bug:** a party gathers every awake Mii at the plaza and only ends when the
  player grabs the present. If the player never went (indoors, didn't notice,
  took the headset off) every Mii stayed at the party forever.
- **Fix:** if the present isn't grabbed within 3 minutes, the birthday Mii
  opens it (same rewards) and everyone goes back to their day.

---

## Verified working (no change needed)
Tested through real VR input in the Quest 3 emulator (laser clicks confirmed
against the game's own hover state, hand grabs, fingertip touches):
- All 20 problem types: hungry, want, sad (head pat), curious, judge, photo
  (camera), meet (carry by hand), fight, lingo (typed answer), apology,
  getback, breakup, roommate, love, propose, baby, play, trip, souvenir, pet.
- All 19 scenes run start to finish and release their Miis.
- All 10 minigames start from a real invite and end (Odd One Out, Shadow,
  Pixel, Coin, Cups, Match, No Repeats, Sky Wheel, Red Light, Bowling).
- Romance (crush → confess → date → sweethearts), proposal dodge game →
  wedding, baby → naming → grow up, trip → ferry → souvenir, level-up reward,
  night sleep and dreams.
- Tablet: every page opens and scrolls; God view, camera, Mii edit, island
  book, builder, shop buying, dressing a Mii, placing furniture.
- Save → reload restores the same island.

## Re-applying
`python3 _fixes/patch.py` applied to a clean copy of the original build gives
byte-identical files. Each patch aborts if its target text isn't found exactly
once, so a rebuilt bundle with different minified names fails loudly rather
than patching the wrong place.
