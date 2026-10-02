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
      # (also carries the F13 ceremony lock, which edits the same spot)
      "&&!P&&!Y&&!(l.ceremony>Date.now())&&q()!==`sleep`}")

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

# --- F11 minigames: no way out, and rare invites ----------------------------
# A running minigame had no quit, time limit or walk-away check. Leaving a
# game like Bowling (which waits for throws) kept the Mii stuck forever and
# blocked every other invite. Walking 8 m+ away for 6 s now ends it.
patch("host", "F11 walk away ends a minigame",
      "S&&!S.over&&!R.paused&&(S.t+=e,x[S.id].update(S.state,e)),",
      "S&&!S.over&&!R.paused&&(S.t+=e,x[S.id].update(S.state,e)),S&&!S.over&&S.frame&&(S.away=S.frame.getWorldPosition(new n).distanceTo(h.getWorldPosition(new n))>8?(S.away??0)+e:0,S.away>6&&(S.quit=!0,S.actor.chatSay?.(`Aww... let's play later!`,`sad`,2.4),R.finish(!1))),")
# Walking away is a quiet cancel: no "Hehe, I win!" and no junk prize box.
patch("host", "F11 walk-away skips the loss gloat and junk prize",
      ":(r.chatSay?.([`Hehe, I win! Let's play again sometime!`",
      ":S.quit?r.handleEvents?.(f(r.res,4)):(r.chatSay?.([`Hehe, I win! Let's play again sometime!`")
# Miis invited the player to a minigame once every 50 min at normal pacing.
patch("host", "F11 invite cadence",
      "R._t=T()?70+Math.random()*60:3e3",
      "R._t=T()?70+Math.random()*60:360+Math.random()*360")
# Accidents (stuck / frozen / hiccups) every 40-100 min -> every 15-30 min.
patch("events", "F11 accident cadence",
      "s=o()?90+Math.random()*90:2400+Math.random()*60*60",
      "s=o()?90+Math.random()*90:900+Math.random()*900")

# --- F12 bowling ball rolled backwards and could never hit a pin -------------
# Object3D.localToWorld() mutates its argument. The roll update converted the
# lane-local ball position r to world space in place and kept using r as
# lane-local: the ball snapped to the gutter, raced backwards at ~24 m/s, and
# the pin hit test read world coordinates, so no pin ever fell.
patch("action", "F12 bowling: floor clamp uses a copy",
      "r.y<.1&&(r.y=.1,e.ball.position.copy(e.lane.localToWorld(r))),",
      "r.y<.1&&(r.y=.1,e.ball.position.copy(e.lane.localToWorld(r.clone()))),")
patch("action", "F12 bowling: gutter clamp uses a copy",
      "Math.abs(r.x)>.44&&(r.x=Math.sign(r.x)*.44,e.ball.position.copy(e.lane.localToWorld(r)))",
      "Math.abs(r.x)>.44&&(r.x=Math.sign(r.x)*.44,e.ball.position.copy(e.lane.localToWorld(r.clone())))")

# --- F13 weddings never completed ---------------------------------------------
# Between "YES!" and the wedding there was a 2.8 s gap where the couple counted
# as free, so the auto-chat grabbed them ("Oh, hi Sam!"). When that small talk
# ended it released them from the wedding script, the vows got interleaved with
# chit-chat, and the line that marries them never ran. Lock the couple for the
# ceremony (expires after 60 s so nobody can get stuck) and drop stray chats.
patch("proposal", "F13 lock couple after YES",
      "e?(setTimeout(()=>{k.script(t,n,[[t,`${n.name}... will you marry me?`",
      "e?(t.res.ceremony=n.res.ceremony=Date.now()+6e4,setTimeout(()=>{k.script(t,n,[[t,`${n.name}... will you marry me?`")
patch("proposal", "F13 wedding drops stray chats",
      "function X(e,t){let n=new a(4,.1,13.6),",
      "function X(e,t){e.res.ceremony=t.res.ceremony=Date.now()+6e4;for(let n of k.chats.filter(n=>[n.a,n.b].some(n=>n===e||n===t)))k.chats.splice(k.chats.indexOf(n),1);let n=new a(4,.1,13.6),")
patch("proposal", "F13 unlock after wedding",
      "()=>{for(let n of[e,t])n.handleEvents(x(n.res,50));",
      "()=>{e.res.ceremony=t.res.ceremony=0;for(let n of[e,t])n.handleEvents(x(n.res,50));")
# (F13 ceremony lock in `available` is applied together with F7 above)

# --- F14 birthday party froze the whole island ---------------------------------
# A party gathers every awake Mii at the plaza and only ended when the player
# grabbed the present. If the player never went (indoors, didn't notice, took
# the headset off) every Mii stayed at the party forever. After 3 minutes the
# birthday Mii opens the present and everyone heads off.
patch("birthdays", "F14 party remembers how to end",
      "m.grabbables.push(r);let i=m.actors.filter(",
      "m.grabbables.push(r),e.__partyT=0,e.__partyEnd=()=>r.grab();let i=m.actors.filter(")
patch("birthdays", "F14 party ends itself after 3 min",
      "update(e){if(v-=e,v>0)return;v=10;let t=new Date(c())",
      "update(e){if(y&&y.__partyEnd&&(y.__partyT=(y.__partyT??0)+e)>180){let t=y.__partyEnd;y.__partyEnd=null,t()}if(v-=e,v>0)return;v=10;let t=new Date(c())")

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
