#!/usr/bin/env python3
"""Gameplay hotfixes applied directly to the published build.

The readable source lives on the Mac (tomodachi-life-vr). These patches edit the
built bundles so fixes can be tested on the headset now; each one is described
in CHANGES.md so it can be ported to the source. Re-running is safe: a patch
whose new text is already present is skipped, and any patch whose old text is
not found exactly once aborts the run.
"""
import pathlib, sys

ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"

def find(prefix):
    # tiny re-export stubs share the prefix; the real bundle is the big one
    hits = [h for h in sorted(ASSETS.glob(prefix + "-*.js")) if h.stat().st_size > 500]
    if len(hits) != 1:
        sys.exit(f"expected one bundle for {prefix}, found {[h.name for h in hits]}")
    return hits[0]

PATCHES = []

def patch(bundle, name, old, new):
    PATCHES.append((bundle, name, old, new))

# --- F1 pacing --------------------------------------------------------------
# Fast "demo" pacing was on unless the URL had ?realtime. Make normal pacing the
# default; ?fast turns demo pacing on for testing.
patch("index", "F1 normal pacing by default",
      "dt(!G.has(`realtime`))",
      "dt(G.has(`fast`))")

# Normal pacing was so slow nothing happened in a play session (wants every
# ~50 min, tummy lasts 3 h). Lively-but-calm values.
patch("resident", "F1 lively normal pacing values",
      "u.hungerPerMinute=e?60:100/180,u.wantEveryMin=e?.5:50,u.wantExpireMin=e?1.5:120",
      "u.hungerPerMinute=e?60:100/120,u.wantEveryMin=e?.5:12,u.wantExpireMin=e?1.5:45")
patch("resident", "F1 lively normal pacing defaults",
      "var u={hungerPerMinute:100/180,hungryAt:45,wantEveryMin:50,wantExpireMin:120,deepSadMin:360}",
      "var u={hungerPerMinute:100/120,hungryAt:45,wantEveryMin:12,wantExpireMin:45,deepSadMin:360}")

# --- F2 problem cap -----------------------------------------------------------
# Every Mii could have a want at once, so nobody was free for scenes/games.
# Only start a new want while fewer than a quarter of Miis have a problem.
patch("actor", "F2 cap simultaneous problems",
      "{pool:k===`sleep`||l.age===`baby`?null:h.wantPool?.()}",
      "{pool:k===`sleep`||l.age===`baby`||h.actors.filter(e=>e.res.problem).length>=Math.max(1,Math.ceil(h.actors.length/4))?null:h.wantPool?.()}")

# --- F3 autonomous life cadence -----------------------------------------------
# Group scenes started every 25-50 min at normal pacing. Every 2.5-5 min now.
patch("scenes", "F3 scene cadence",
      "g=m()?50+Math.random()*60:1500+Math.random()*25*60",
      "g=m()?50+Math.random()*60:150+Math.random()*150")
# Miis chatted every 45-105 s at normal pacing. Every 20-45 s now.
patch("social", "F3 chat cadence",
      "E=N()?10+Math.random()*10:45+Math.random()*60",
      "E=N()?10+Math.random()*10:20+Math.random()*25")

# Relationship/social needs (judge, curious, meet, lingo, roommate...) rolled
# every 4-8 min at normal pacing. Every 1.5-3 min, and never past half the
# island having a problem.
patch("social", "F3 needs cadence",
      "D=N()?40+Math.random()*30:240+Math.random()*240",
      "D=N()?40+Math.random()*30:90+Math.random()*90")
patch("social", "F3 needs cap",
      "function H(){let e=M().filter(e=>e.available);if(!e.length)return;",
      "function H(){let e=M().filter(e=>e.available);if(!e.length||M().filter(e=>e.res.problem).length>=Math.max(1,Math.ceil(M().length/2)))return;")

# --- F4 pets ----------------------------------------------------------------
# The "I'd love a pet" bubble called game.openPet, which was never defined, and
# nothing ever created a pet problem. Roll it for pet-less adults and let the
# player pick the kind.
patch("social", "F4 pet need",
      "S.save()}else if(S.isUnlocked?.(`snap`)&&a<.4)",
      "S.save()}else if(!t.res.pet&&!t.res.age&&a<.34)t.res.problem={type:`pet`,since:Date.now(),asked:!1},t.refreshBubble(),S.save();else if(S.isUnlocked?.(`snap`)&&a<.4)")
patch("index", "F4 openPet dialog",
      "Q.openTrip=e=>{yr.isOpen||vi.openTrip(e)},",
      "Q.openTrip=e=>{yr.isOpen||vi.openTrip(e)},Q.openPet=e=>{yr.isOpen||Or.openChoice({title:`${e.name} would love a pet!`,color:`#ff9f3d`,lines:[`Which pet should ${e.name} get?`],options:[{id:`dog`,label:`🐶 Puppy`},{id:`cat`,label:`🐱 Kitty`},{id:`bunny`,label:`🐰 Bunny`},{id:`chick`,label:`🐤 Chick`}],later:!0,onPick:t=>{if(!gi.PET_KINDS[t])return;e.res.problem=null,gi.give(e,t),e.refreshBubble(),Q.save()}})},")

# --- F5 craved food refused when full ----------------------------------------
# A Mii craving a food said "I'm full" and refused that very food when its
# tummy was >= 97, so the want could not be solved. Always accept the craving.
patch("actor", "F5 accept craved food when full",
      "receiveFood(e,t){return l.hunger>=97?",
      "receiveFood(e,t){return l.hunger>=97&&!(l.problem?.type===`want`&&l.problem.item===e)?")
# The resident feed function had its own "full" early-out that returned taste
# `full`, which the eat popup had no label for (crashed: "t is not iterable").
patch("resident", "F5 feed accepts craved food when full",
      "if(e.hunger>=97)return{taste:`full`,events:[],money:0};",
      "if(e.hunger>=97&&!(e.problem?.type===`want`&&e.problem.kind===`food`&&e.problem.item===t))return{taste:`full`,events:[],money:0};")
patch("actor", "F5 eat popup label fallback",
      "{love:`LOVES it!`,like:`Likes it!`,okay:`Okay`,hate:`Hates it!`}[t],",
      "{love:`LOVES it!`,like:`Likes it!`,okay:`Okay`,hate:`Hates it!`,full:`So full!`}[t]??`Yum!`,")

# --- F6 lingo panel crash ------------------------------------------------------
# The lingo panel read topics[problem.topic].ask with no guard; a missing or
# renamed topic (old saves) threw every frame and the panel had no buttons.
patch("talkpanels", "F6 lingo panel guard",
      "let i=u[v.actor.res.problem.topic];",
      "let i=u[v.actor.res.problem?.topic]??u.phrase??Object.values(u)[0];")

# --- F7 level-up froze Miis --------------------------------------------------
# A Mii with an uncollected level-up reward was not `available`, so it sat out
# of every scene, chat, game and visit until the player poked it. Over a session
# more and more Miis froze. The level-up bubble still shows; the Mii keeps
# living its life.
patch("actor", "F7 level-up does not freeze Mii",
      "&&!P&&!Y&&l.rewardsPending!==1&&q()!==`sleep`}",
      "&&!P&&!Y&&q()!==`sleep`}")

# --- F8 fight dialog said "It was about undefined." ---------------------------
patch("talkpanels", "F8 fight topic fallback",
      "t.fillText(`It was about ${s.topic}.`,n/2,112)",
      "t.fillText(s?.topic?`It was about ${s.topic}.`:`They had a falling out.`,n/2,112)")
patch("cheats", "F8 debug fight gets a topic",
      "e[0].res.problem={type:`fight`,with:e[1].res.id,since:Date.now(),asked:!1}",
      "e[0].res.problem={type:`fight`,with:e[1].res.id,topic:w([`the last cookie`,`the best color`,`who waved first`,`a silly joke`]),since:Date.now(),asked:!1}")

# --- F9 dead evenings and rainy days -------------------------------------------
# Every Mii went indoors at 18:30, for 1.5 h after waking, for a full lunch
# hour, and all day whenever it rained or snowed. Social life only happens
# outdoors, so evening and rainy-day play had nothing going on.
patch("actor", "F9 livelier daily schedule",
      "e<Ze+1.5||e>=12&&e<13||e>=18.5||h.weather?.wet?`home`",
      "e<Ze+.75||e>=12&&e<12.5||e>=Qe-1.5||h.weather?.wet&&Xe<4?`home`")

# --- F10 debug scene buttons ----------------------------------------------------
# "Dance party (4)" etc. only used fully-free Miis, so with a few wants or a
# level-up around they said "Needs 4 free Miis". Fall back to any awake Mii
# that is not already doing something.
patch("cheats", "F10 debug scenes recruit awake Miis",
      "H=e=>{let t=R(),n=x.find(t=>t.id===e);",
      "H=e=>{let t=R(),n=x.find(t=>t.id===e);n&&t.length<n.n&&(t=I().filter(e=>!e.busy&&!e.asleep&&!e.social&&!e.accident&&!e.res.age));")

def main():
    changed = {}
    for bundle, name, old, new in PATCHES:
        f = find(bundle)
        src = changed.get(f) or f.read_text()
        if new in src:
            print(f"skip (already applied)  {name}")
            continue
        n = src.count(old)
        if n != 1:
            sys.exit(f"FAIL {name}: old text found {n} times in {f.name}")
        changed[f] = src.replace(old, new)
        print(f"ok   {name}")
    for f, src in changed.items():
        f.write_text(src)

if __name__ == "__main__":
    main()
