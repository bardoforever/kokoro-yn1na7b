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

---

# Round 2 — behaviour overhaul (assets/kokoro-life.js)

The new behaviour lives in one readable add-on, `assets/kokoro-life.js`, loaded
after the main bundle. It hooks the game's public objects (`window.__game`);
the minified bundles only gained small `window.__kl?.…` hooks, which fall back
to the original behaviour if the add-on isn't loaded. **To port: copy the
add-on into the source and turn each hook into a direct call.**

## F15 — Debug menu acts near the player, at once, and reports honestly
- **Bug:** debug actions picked random Miis anywhere on the island (often far
  away or indoors) and said "Playing: dance" straight away while the Miis
  still had a 15–40 s walk. Problem buttons put bubbles on Miis the player
  couldn't see. "Marry a couple" only changed data.
- **Fix:** `gather(n)` takes the nearest awake, free Miis and brings anyone
  further than 4.5 m to a spot in front of the player. Scenes tied to a place
  (picnic, beach, bench, fountain) take the player there. "Marry" runs the
  real wedding at the plaza. "Accident: stuck" takes the player to the beach.
  Messages only claim what actually happened. Verified: every action happens
  within 1–6 s, in view.
- Hook: `actor` passes the asking Mii to `game.wantPool(l)` (merged into F2).

## F15b — Requests suit each Mii and don't repeat
- **Bug:** food wants were a uniform pick from everything stocked or sold,
  ignoring the Mii's tastes and history, so the same dish came up over and
  over. Minigame invites were uniform too.
- **Fix:** `wantPool(res)` weighs loves ×10, likes ×4, never hates, damps
  what this Mii asked for recently and what another Mii is asking for now.
  Invites use per-personality favourite games and avoid what was just played.

## F16 — Movement
- **Bugs:** wander targets were a ring at one plaza point (everyone bunched
  up) or a 5 m strip in front of the Mii's own house (pacing), with 2–6 s
  pauses. Walkers went through each other and the player. A gesture started
  before walking kept playing while moving (sliding). Any walker within 2.2 m
  of the player stopped dead in front of them. A Mii whose bubble was poked
  but not solved stood still forever.
- **Fix:** add-on `wander()` picks a place by personality (plaza, bench,
  park, beach, shops when hungry, own garden, a friend, a stroll), never the
  same kind twice in a row, choosing the least crowded spot; `dwell()` gives
  each place its own stay (bench 15–32 s, beach 18–40 s…); `steer()` bends
  the walk around nearby Miis and the player (not during the final approach).
  Bundle hooks: `et()` wander, idle `j` dwell, the walk step, `N` reset on
  walk start, greet-without-blocking, and a 45 s `askedAt` timeout.
- Verified: 10 minutes went from 41 to 93 distinct areas visited, with no
  Mii frozen for over a minute.

## F17 — Conversations
- **Bug:** every chat was a greeting, one of 6 topics and a one-line reply,
  with only two tones (strangers vs everyone else). There was no memory and no
  mood, and lines repeated.
- **Fix:** add-on `chat(a, b)`:
  - Tone by relationship tier: stranger, new, friend, best friend
    (level ≥ 5), sweetheart, spouse, family, ex.
  - Voice from personality: loud, quiet, hyper, calm, smart.
  - 1–3 beats picked by weight: shared memories, island gossip (from
    `game.news`), food the player fed them (`discoverTaste`), new outfits
    (`dress`), hunger, sadness, grumpiness, wants, place, rain, time of day,
    food likes and dislikes with agreeing or clashing replies, taught words
    (lingo), personality, and relationship flavour.
  - Per-pair topic history and island-wide line freshness prevent repeats.
- The fight and intro lines are hooked too. Verified over 15 minutes: 6.7
  lines per chat, 87 distinct lines out of 121.

## F18 — More, and more natural, chats
- Up to one chat per four Miis can run at once (was 2 island-wide).
  Partners are weighted toward nearby Miis (was anyone within 30 m), and a
  Mii next to a stranger may introduce itself (40%). Verified: everyday chats
  per 15 minutes went from 8 to 18.

## F19 — Remove a Mii from the debug menu
- New debug buttons (Island group): **❌ Remove nearest Mii** and
  **❌ Remove newest Mii**. The first tap names the Mii and asks; a second tap
  within 4 s removes it via the game's own `removeResident` (relationships,
  family links and problems pointing at it are cleaned up). It's saved, so the
  Mii stays gone after a reload. (The tablet's Residents page also has a
  goodbye button with a confirm step.)

---

# Round 3 — polish pass (bubbles, staging, steering, life around the player)

## F20 — Speech bubbles filled the screen
- **Bug:** the bubble scale was `clamp(1, d·tan12°/0.36, d·tan19°/0.36)`, so
  every bubble covered 27–42° of view at any distance. A few talking Miis,
  even far away, filled the screen.
- **Fix:** the actor calls `__kl.bubbleScale(d)`, which sizes the bubble like
  a real object: ~16° at 2–3 m, ~10° at 5 m, ~4° at 12 m, fading out by
  16 m. The minimum is 0.42 up close, and the large-text setting still
  applies.

## F21 — Interaction staging
- **Chats:** the initiator walks up to the other Mii, who waits and waves.
  Before, both walked to a midpoint. When the player is within 8 m, both angle
  toward the player (the `audience` argument of `socialGo`), so the player sees
  faces rather than backs of heads. (social `F`)
- **Listener reactions:** after each line, the listener reacts a beat later
  (laugh, surprise, love, wave back…). (social chat runner, `__kl.react`)
- **Performances:** dance, group photo and workout line up a few steps in
  front of the player, facing them, instead of circling their centre.
  (scenes `x`, `__kl.formation`)
- **Steering rewrite:** walkers look ahead 2.6 m and sidestep the player (and
  other Miis, 1.4 m) early, like people passing on a sidewalk, instead of only
  being pushed away once already close.

## F22 — Life around the player (add-on only)
- **Noticing you:** a free Mii within 4 m turns and greets you in its own
  voice, at most once every 45–90 s. If it has a want, hunger or a bad mood,
  it mentions it ("Psst... I'm really craving pudding."). Chatty, friendly
  Miis sometimes walk over to say hi. The greeting is skipped in the Mii
  maker, minigames, God view and the proposal game.
- **Walking together:** some friendly chats end with "Want to go to the
  beach?" / "Sure, let's go!", and the pair walks side by side to that spot.
- **Goodbyes:** every relationship tier except exes ends a chat with a wave,
  and the listener waves back.
- **No standing on someone:** wander targets reject any spot within 0.8 m of
  another Mii (or of where one is heading) or within 1 m of the player. If two
  idle Miis still overlap, the newer arrival shuffles a step aside.
- **Greeting rate:** at most one greeting every 25–40 s island-wide, and each
  Mii greets at most every 3–5 min, never repeating a recent line. (Before
  tuning it was every ~13 s at the plaza.)
- **Walking together** goes only to shared places (plaza, bench, park, beach,
  shops). The pair is held together while one asks and the other answers, so
  nothing else grabs them. A safety release after 30 s means nobody is left
  waiting.

### Verified (round 3)
- Player standing at the busy plaza for 10 game minutes:

  | | Before | After |
  |---|---|---|
  | Miis walking through the player | 7 | 0 |
  | Closest pass | 0.03 m | 0.70 m |
  | Mii-to-Mii overlap samples | 2619 | 28 |
  | Areas visited | 38 | 80 |

- Filmed chats show both faces (3/4 toward the player). The dance party is a
  line of four facing the player.
- Regression: all 16 debug actions pass in 1–6 s; all 19 scenes finish; 21
  chats in 15 min (6.5 lines each, 99 distinct of 137); problems curious,
  judge, fight, lingo, pet, sad, photo and meet (carried by hand) all resolve;
  0 page errors.
