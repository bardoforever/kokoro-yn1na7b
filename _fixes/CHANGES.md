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
