// Kokoro Life — readable gameplay add-on layered on the published build.
//
// It waits for window.__game, then:
//   1. Reworks the debug menu so every action happens near the player, right
//      away, and only reports what actually happened.
//   2. Gives each Mii its own taste in what it asks for (foods, minigames)
//      and stops the same request repeating.
//
// Each section is self-contained so it can be moved into the source project.

const wait = () => new Promise(r => {
  const t = setInterval(() => { if (window.__game?.game?.actors && window.__game.cheats?.list) { clearInterval(t); r(window.__game); } }, 200);
});

const G = await wait();
const game = G.game, data = game.data;
const V = G.rig.position.constructor;
const pick = a => a[Math.floor(Math.random() * a.length)];
const actors = () => game.actors;
const isAdult = a => !a.res.age;

// ---------------------------------------------------------------------------
// Player-relative helpers
// ---------------------------------------------------------------------------
function playerPos() { return G.camera.getWorldPosition(new V()); }
function playerFwd() { const f = G.camera.getWorldDirection(new V()); f.y = 0; return f.lengthSq() < 1e-6 ? new V(0, 0, -1) : f.normalize(); }
function ground(x, z) { return G.island.groundAt?.(x, z) ?? 0.1; }

// A spot in front of the player, fanned out for slot i of n.
function frontSpot(i = 0, n = 1, dist = 2.6) {
  const p = playerPos(), f = playerFwd(), r = new V().crossVectors(f, new V(0, 1, 0)).normalize();
  const spread = n <= 1 ? 0 : (i - (n - 1) / 2) * 0.9;
  const s = p.clone().addScaledVector(f, dist).addScaledVector(r, spread);
  s.y = ground(s.x, s.z);
  return s;
}

// Can this Mii be pulled into something right now?
const canJoin = (a, { allowProblem = false } = {}) =>
  !a.asleep && !a.busy && !a.social && !a.accident && isAdult(a) &&
  (allowProblem || !a.res.problem || ['want', 'hungry'].includes(a.res.problem.type));

// The n Miis nearest the player that pass the filter; anyone further than
// `reach` is brought over so the player actually sees what happens.
function gather(n, { reach = 4.5, allowProblem = false, exclude = [] } = {}) {
  const p = playerPos();
  const list = actors().filter(a => !exclude.includes(a) && canJoin(a, { allowProblem }))
    .sort((a, b) => a.root.position.distanceTo(p) - b.root.position.distanceTo(p))
    .slice(0, n);
  list.forEach((a, i) => {
    if (a.root.position.distanceTo(p) > reach || a.activity === 'home') {
      a.socialEnd?.();
      a.root.position.copy(frontSpot(i, list.length));
      a.emote?.('wave', 1.6);
    }
  });
  return list;
}

const names = l => l.length <= 2 ? l.map(a => a.name).join(' and ') : l.slice(0, -1).map(a => a.name).join(', ') + ' and ' + l.at(-1).name;
const rel = (a, b) => G.relations.getRel(data, a.res.id, b.res.id);

// ---------------------------------------------------------------------------
// 1. Debug menu
// ---------------------------------------------------------------------------
const cheat = Object.fromEntries(G.cheats.list.map(c => [c.id, c]));
const setRun = (id, fn) => { if (cheat[id]) cheat[id].run = fn; };

const SCENE_NAMES = { dance: 'Dance party', photo: 'Group photo', ghost: 'Ghost scare', picnic: 'Picnic', bench: 'Bench chat', beach: 'Beach day', fountain: 'Fountain hangout', exercise: 'Workout', joke: 'Joke time', secret: 'Secret', snack: 'Snack break', armwrestle: 'Arm wrestling' };
// Group scenes: gather the cast in front of the player and start immediately.
// Scenes tied to a place (beach, bench, fountain, picnic) take the player there.
function runScene(id) {
  const def = G.scenes.SCENES.find(s => s.id === id);
  if (!def) return 'Unknown scene';
  if (def.spot) goNear(new V(def.spot[0], 0, def.spot[1]), 3.2);
  let cast = gather(def.n, { reach: def.spot ? 0 : 4.5 });
  if (def.needs === 'friends' && cast.length >= 2) {
    const r = rel(cast[0], cast[1]);
    if (!['friend', 'sweetheart', 'spouse', 'family'].includes(r?.type)) { r.type = 'friend'; r.f[cast[0].res.id] = r.f[cast[1].res.id] = Math.max(60, r.f[cast[0].res.id] ?? 0); }
  }
  if (cast.length < def.n) return `Only ${cast.length} Mii${cast.length === 1 ? ' is' : 's are'} awake and free — ${def.n} needed`;
  const s = G.scenes.run(id, cast);
  return s ? `${SCENE_NAMES[id] ?? id[0].toUpperCase() + id.slice(1)}${def.spot ? ' (taking you there)' : ''}: ${names(cast)}` : 'Could not start';
}
for (const [cid, sid] of [['sc_dance', 'dance'], ['sc_photo', 'photo'], ['sc_ghost', 'ghost'], ['sc_picnic', 'picnic']]) setRun(cid, () => runScene(sid));
setRun('sc_rand', () => runScene(pick(G.scenes.SCENES.filter(s => s.n > 1)).id));

// Problems: put the bubble on a Mii the player can see.
function giveProblem(type, build, label) {
  const [a] = gather(1);
  if (!a) return 'Nobody is awake and free';
  const extra = build(a);
  if (extra === null) return 'Needs more Miis';
  a.res.problem = { type, ...extra, since: Date.now(), asked: false };
  a.refreshBubble();
  return `${a.name} (in front of you) ${label(a, extra)} — poke the bubble`;
}
const otherNear = (a, f = () => true) => gather(1, { exclude: [a] }).find(f) ?? actors().find(b => b !== a && isAdult(b) && f(b)) ?? null;
setRun('p_curious', () => giveProblem('curious', a => { const b = otherNear(a); return b ? { who: b.res.id } : null; }, (a, x) => `is curious about ${actors().find(b => b.res.id === x.who)?.name}`));
setRun('p_judge', () => giveProblem('judge', a => { const b = otherNear(a); if (!b) return null; rel(a, b); return { with: b.res.id }; }, (a, x) => `wants your opinion about ${actors().find(b => b.res.id === x.with)?.name}`));
setRun('p_photo', () => { if (!game.isUnlocked('snap')) data.progress.unlocked.push('snap'); return giveProblem('photo', () => ({}), () => 'wants a photo (camera is in the Home menu)'); });
setRun('p_meet', () => giveProblem('meet', a => { const b = actors().find(b => b !== a && isAdult(b) && (!rel(a, b) || rel(a, b).type === 'stranger')); return b ? { who: b.res.id } : null; }, (a, x) => `wants to meet ${actors().find(b => b.res.id === x.who)?.name} — carry them over`));
setRun('p_sad', () => { const [a] = gather(1); if (!a) return 'Nobody is awake and free'; a.res.problem = { type: 'sad', reason: 'test', since: Date.now(), asked: false }; a.refreshBubble(); a.emote?.('sad', 3); return `${a.name} (in front of you) is feeling down — pat their head`; });
setRun('p_fight', () => {
  const pair = gather(2); if (pair.length < 2) return 'Needs 2 awake adults';
  const [a, b] = pair, r = rel(a, b);
  if (['stranger', 'acquaintance'].includes(r.type)) r.type = 'friend';
  r.fight = true;
  const topic = pick(['the last cookie', 'the best color', 'who waved first', 'a silly joke', 'what clouds taste like']);
  for (const [x, y] of [[a, b], [b, a]]) { x.res.problem = { type: 'fight', with: y.res.id, topic, since: Date.now(), asked: false }; x.emote?.('angry', 3); x.refreshBubble(); }
  return `${a.name} and ${b.name} just had a fight about ${topic}`;
});
// put the player a few steps from a world point, facing it
function goNear(pos, back = 2.6) {
  const off = playerPos().sub(G.rig.position);
  G.rig.position.set(pos.x - off.x, G.rig.position.y, pos.z + back - off.z);
}
setRun('acc', () => {
  const [a] = gather(1); if (!a) return 'Nobody is awake and free';
  const t = pick(['stuck', 'frozen', 'hiccups']);
  if (!G.events.trigger(a, t)) return `${a.name} couldn't have an accident right now`;
  if (t === 'stuck') { goNear(a.root.position); return `${a.name} is stuck in the sand at the beach (taking you there) — grab them to pull them out`; }
  return `${a.name} (in front of you) ${t === 'frozen' ? 'froze stiff — rub them to warm up' : "can't stop hiccuping — pick them up to startle them"}`;
});

// Minigames: the inviting Mii comes to the player.
function invite(gameId) {
  const [a] = gather(1); if (!a) return 'Nobody is awake and free';
  if (a.res.problem) { a.res.problem = null; a.refreshBubble(); }
  G.games.inviteFrom(a, gameId ?? null);
  const gid = a.res.problem?.game;
  return gid ? `${a.name} wants to play ${G.games.games[gid]?.name ?? gid} — poke the green bubble` : 'Could not invite';
}
setRun('g_match', () => invite('match'));
setRun('g_rand', () => invite(null));

// Life events: bring the pair over and make the moment visible.
const showCard = (title, label, a, b) => G.relCard?.show({ theme: 'love', title, labelA: label, labelB: label, hold: 3.5, a: { name: a.name, appearance: a.res.appearance }, b: { name: b.name, appearance: b.res.appearance } });
setRun('sweet', () => {
  const pair = gather(2); if (pair.length < 2) return 'Needs 2 awake adults';
  const [a, b] = pair, r = rel(a, b); r.type = 'sweetheart'; r.fight = false; r.f[a.res.id] = r.f[b.res.id] = Math.max(70, r.f[a.res.id] ?? 0);
  a.emote?.('love', 3); b.emote?.('love', 3); showCard('Sweethearts!', 'Sweetheart', a, b); game.save();
  return `${a.name} and ${b.name} are now sweethearts`;
});
setRun('marry', () => {
  const pair = gather(2); if (pair.length < 2) return 'Needs 2 awake adults';
  const [a, b] = pair; const r = rel(a, b); r.type = 'sweetheart'; r.fight = false;
  // the real ceremony happens at the plaza; take the player along
  goNear(new V(4, 0, 13.6), 3.3);
  G.proposal.wedding(a, b);
  return `${a.name} and ${b.name} are getting married at the plaza!`;
});
setRun('crush', () => {
  const pair = gather(2); if (pair.length < 2) return 'Needs 2 awake adults';
  const [a, b] = pair, r = rel(a, b); if (['stranger', 'acquaintance'].includes(r.type)) r.type = 'friend';
  r.f[a.res.id] = r.f[b.res.id] = Math.max(75, r.f[a.res.id] ?? 0); r.crush = { [a.res.id]: true };
  a.res.problem = { type: 'love', who: b.res.id, since: Date.now(), asked: false }; a.refreshBubble(); a.emote?.('love', 3);
  return `${a.name} has a crush on ${b.name} — poke ${a.name}'s bubble`;
});
setRun('moodbad', () => { const pair = gather(2); if (pair.length < 2) return 'Needs 2 awake adults'; G.social.badMood(pair[0], pair[1]); return `${pair[0].name} is in a bad mood`; });

// ---------------------------------------------------------------------------
// 2. Variety: every Mii asks for things that suit it, without repeating
// ---------------------------------------------------------------------------
const hist = res => (res._asked ??= { food: [], game: [] });
const remember = (list, v, max = 4) => { list.unshift(v); list.length = Math.min(list.length, max); };

// Weighted pick: loves > likes > okay, never a hate, damped if this Mii asked
// for it recently or another Mii is asking for the same thing right now.
function pickWant(res, options, kind) {
  if (!options.length) return null;
  const inUse = new Set(actors().map(a => a.res.problem?.type === 'want' && a.res.problem.kind === kind ? a.res.problem.item : null).filter(Boolean));
  const recent = kind === 'food' ? hist(res).food : (res._askedClothes ??= []);
  const w = options.map(id => {
    if (kind === 'food' && res.prefs?.hates?.includes(id)) return 0;
    let x = kind === 'food' ? (res.prefs?.loves?.includes(id) ? 10 : res.prefs?.likes?.includes(id) ? 4 : 1) : 1;
    if (recent.includes(id)) x *= 0.08;
    if (inUse.has(id)) x *= 0.15;
    return x;
  });
  const total = w.reduce((s, x) => s + x, 0); if (!total) return null;
  let r = Math.random() * total, i = 0; for (; i < w.length - 1 && r > w[i]; i++) r -= w[i];
  remember(recent, options[i]);
  return options[i];
}
const basePool = game.wantPool.bind(game);
game.wantPool = res => {
  const pool = basePool();
  if (!res) return pool;
  const food = pickWant(res, pool.food, 'food'), clothes = pickWant(res, pool.clothes, 'clothes');
  return { food: food ? [food] : [], clothes: clothes ? [clothes] : [] };
};

// Each Mii gets a few favourite minigames from its personality; invites
// prefer those and avoid what was just played.
const GAME_TASTE = {
  bowling: p => p.energy + p.movement, redlight: p => p.energy + p.movement, wheel: p => p.energy + p.thinking * 0.5,
  shadow: p => p.thinking * 2, pixel: p => p.thinking * 2, odd: p => p.thinking + (7 - p.movement),
  coin: p => 7 - p.thinking + p.speech * 0.5, cups: p => p.thinking + p.movement * 0.5,
  match: p => p.speech + p.thinking, norepeats: p => p.speech * 2,
};
const islandRecent = [];
const baseInvite = G.games.inviteFrom.bind(G.games);
G.games.inviteFrom = (actor, gameId = null, others = null) => {
  if (!gameId && actor?.res) {
    const p = { movement: 4, speech: 4, energy: 4, thinking: 4, ...actor.res.personality };
    const ids = Object.keys(G.games.games);
    const mine = hist(actor.res).game;
    const w = ids.map(id => {
      let x = 1 + Math.max(0, (GAME_TASTE[id]?.(p) ?? 7)) ** 1.4;
      if (mine.includes(id)) x *= 0.1;
      if (islandRecent.includes(id)) x *= 0.3;
      return x;
    });
    const total = w.reduce((s, x) => s + x, 0); let r = Math.random() * total, i = 0;
    for (; i < w.length - 1 && r > w[i]; i++) r -= w[i];
    gameId = ids[i];
  }
  const ok = baseInvite(actor, gameId, others);
  if (ok && actor?.res) { remember(hist(actor.res).game, gameId, 3); remember(islandRecent, gameId, 3); }
  return ok;
};

// ---------------------------------------------------------------------------
// 3. Movement: purposeful outings, spreading out, steering around others
// ---------------------------------------------------------------------------
const P = p => ({ movement: 4, speech: 4, energy: 4, thinking: 4, ...p });
const PLACES = {
  // each returns a candidate point; `a` is the actor
  plaza: () => { const t = Math.random() * Math.PI * 2, r = 3 + Math.random() * 3.5; return new V(4 + Math.cos(t) * r, 0, 10 + Math.sin(t) * r); },
  bench: () => new V(-4.8 + (Math.random() - .5) * 4.5, 0, 5.4 + (Math.random() - .5) * 3),
  park: () => new V(10 + (Math.random() - .5) * 5, 0, 8.5 + (Math.random() - .5) * 4),
  beach: () => new V(-9 + Math.random() * 20, 0, 33 + Math.random() * 3),
  shops: () => { const s = pick([[-13, 14], [14.5, 14.5]]); return new V(s[0] + (Math.random() - .5) * 3, 0, s[1] + Math.random() * 1.5); },
  garden: a => { const h = G.island.homes?.[a.res.home]; return h ? new V(h.x + (Math.random() - .5) * 5, 0, h.z + 4.2 + Math.random() * 2.2) : null; },
  friend: a => {
    const fr = actors().filter(b => b !== a && !b.asleep && ['friend', 'sweetheart', 'spouse', 'family'].includes(rel(a, b)?.type));
    if (!fr.length) return null;
    const b = pick(fr);
    if (b.activity === 'out') { const t = Math.random() * Math.PI * 2, d = 1.0 + Math.random() * .5; return b.root.position.clone().add(new V(Math.cos(t) * d, 0, Math.sin(t) * d)).setY(0); }
    const h = G.island.homes?.[b.res.home]; return h ? new V(h.x + (Math.random() - .5) * 3, 0, h.z + 4.4 + Math.random()) : null;
  },
  stroll: () => { const t = Math.random() * Math.PI * 2, r = 6 + Math.random() * 16; return new V(Math.cos(t) * r, 0, 4 + Math.sin(t) * r * .8); },
};
function placeWeights(a) {
  const p = P(a.res.personality), hungry = (a.res.hunger ?? 100) < 55;
  return {
    plaza: 2 + p.speech * .35, bench: 1 + (7 - p.energy) * .45, park: 1.2 + p.speech * .15,
    beach: .4 + p.energy * .35, shops: hungry ? 5 : .8, garden: 1.2 + (7 - p.movement) * .3,
    friend: 1 + p.speech * .45, stroll: .5 + p.movement * .35,
  };
}
const DWELL = { plaza: [8, 20], bench: [15, 32], park: [10, 24], beach: [18, 40], shops: [6, 14], garden: [6, 14], friend: [10, 22], stroll: [3, 8] };
// how crowded is a point: Miis standing there or heading there
function crowd(pt, self) {
  let n = 0;
  for (const b of actors()) {
    if (b === self) continue;
    const d1 = b.root.position.distanceTo(pt), d2 = b.__dest ? b.__dest.distanceTo(pt) : 99;
    if (d1 < 1.6) n += d1 < 0.8 ? 6 : 1;
    if (d2 < 1.6) n += d2 < 0.8 ? 6 : 1;
  }
  return n;
}
function wander(a) {
  if (a.res.age === 'baby') return null;
  const w = placeWeights(a);
  if (a.__place) w[a.__place] *= 0.25;             // not the same kind of place twice in a row
  const keys = Object.keys(w); let total = keys.reduce((s, k) => s + w[k], 0), r = Math.random() * total, kind = keys[0];
  for (const k of keys) { if ((r -= w[k]) <= 0) { kind = k; break; } }
  let best = null, bestScore = Infinity;
  for (let i = 0; i < 6; i++) {
    const c = PLACES[kind](a); if (!c) continue;
    if (Math.hypot(c.x, c.z - 4) > (G.island.radius ?? 40) - 6) continue;
    const score = crowd(c, a) + c.distanceTo(a.root.position) * 0.02;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  if (!best) return null;                          // fall back to the game's own choice
  best.y = 0.1;
  a.__place = kind; a.__dest = best.clone();
  return best;
}
function dwell(a) {
  const d = DWELL[a.__place]; a.__dest = null;
  return d ? d[0] + Math.random() * (d[1] - d[0]) : null;
}
// Steering: bend the walk direction away from nearby Miis and the player.
const _tmp = new V();
function steer(a, dir, remaining) {
  if (remaining < 0.8) return;                     // never fight the final approach
  const me = a.root.position; let px = 0, pz = 0;
  for (const b of actors()) {
    if (b === a || b.asleep) continue;
    const dx = me.x - b.root.position.x, dz = me.z - b.root.position.z, d = Math.hypot(dx, dz);
    if (d > 0.001 && d < 0.85) { const k = (0.85 - d) / 0.85; px += dx / d * k; pz += dz / d * k; }
  }
  const pp = playerPos(), dx = me.x - pp.x, dz = me.z - pp.z, d = Math.hypot(dx, dz);
  if (d > 0.001 && d < 0.9) { const k = (0.9 - d) / 0.9 * 1.4; px += dx / d * k; pz += dz / d * k; }
  if (!px && !pz) return;
  dir.x += px * 0.9; dir.z += pz * 0.9;
  const l = Math.hypot(dir.x, dir.z) || 1; dir.x /= l; dir.z /= l;
}

// ---------------------------------------------------------------------------
// 4. Conversations: relationship-aware, personal, with memory, no repeats
// ---------------------------------------------------------------------------
let recentSaid = [];
const any = l => { const f = l.filter(x => typeof x !== 'string' || !recentSaid.includes(x)); const src = f.length ? f : l; return src[Math.floor(Math.random() * src.length)]; };
const cap = t => t ? t[0].toUpperCase() + t.slice(1) : t;
const foodName = id => (actors()[0]?.FOOD_BY_ID?.[id]?.name ?? String(id ?? 'snacks')).toLowerCase();
const COUNTABLE = /(sandwich|cookie|donut|cupcake|apple|banana|carrot|taco|burger|lollipop|rice ball|hot ?dog|riceball|hotdog)$/;
const foods = id => { const n = foodName(id).replace(/^riceball$/, 'rice ball').replace(/^hotdog$/, 'hot dog'); return COUNTABLE.test(n) ? n.replace(/sandwich$/, 'sandwiches').replace(/([^s])$/, '$1s') : n; };
const isAre = n => /s$/.test(n) && !/(fries|grapes|pancakes)$/.test(n) ? 'are' : (/(fries|grapes|pancakes)$/.test(n) ? 'are' : 'is');
const relLevel = r => { try { return G.relations.level?.(r) ?? 0; } catch { return 0; } };
const tier = (a, b) => {
  const r = rel(a, b); if (!r) return 'stranger';
  if (r.type === 'spouse') return 'spouse';
  if (r.type === 'sweetheart') return 'sweet';
  if (r.type === 'family') return 'family';
  if (r.type === 'exsweet' || r.type === 'exfriend') return 'ex';
  if (r.type === 'friend') return relLevel(r) >= 5 ? 'best' : 'friend';
  return r.type === 'acquaintance' ? 'new' : 'stranger';
};
// a Mii's speaking style from personality
const voice = a => { const p = P(a.res.personality); return { loud: p.speech >= 5, quiet: p.speech <= 2, hyper: p.energy >= 5, calm: p.energy <= 2, smart: p.thinking >= 5, restless: p.movement >= 5 }; };
const say = (a, t) => { const v = voice(a); if (v.loud && Math.random() < .5) t = t.replace(/\.$/, '!'); if (v.quiet && Math.random() < .4 && !t.startsWith('...')) t = '...' + t; return t; };
const dur = t => Math.min(4.2, 1.5 + t.length * 0.045);
const L = (a, t, emote = 'talk') => { t = say(a, t); return [a, t, emote, dur(t)]; };

// --- memory -----------------------------------------------------------------
const mem = res => (res._mem ??= []);
function remember2(res, m) { const l = mem(res); l.unshift({ t: Date.now(), ...m }); if (l.length > 14) l.length = 14; }
const baseNews = game.news?.bind(game);
if (baseNews) game.news = (kind, text, ...rest) => {
  const out = baseNews(kind, text, ...rest);
  try {
    const str = typeof text === 'string' ? text : (text?.text ?? '');
    if (str) {
      const who = actors().filter(a => new RegExp(`\\b${a.name}\\b`).test(str));
      for (const a of who) remember2(a.res, { kind, text: str, with: who.filter(b => b !== a).map(b => b.res.id) });
      (data._gossip ??= []).unshift({ t: Date.now(), kind, text: str, who: who.map(a => a.res.id) }); data._gossip.length = Math.min(data._gossip.length, 20);
    }
  } catch {}
  return out;
};
const baseTaste = game.discoverTaste?.bind(game);
if (baseTaste) game.discoverTaste = (res, food, taste, ...r) => { remember2(res, { kind: 'fed', item: food, taste }); return baseTaste(res, food, taste, ...r); };
const baseDress = game.dress?.bind(game);
if (baseDress) game.dress = (a, id, ...r) => { if (a?.res) remember2(a.res, { kind: 'dressed', item: id }); return baseDress(a, id, ...r); };

// --- pair history so topics don't repeat -----------------------------------
const pairKey = (a, b) => [a.res.id, b.res.id].sort().join('|');
const pairHist = {}; const recentLines = [];
const fresh = (a, b, id) => !(pairHist[pairKey(a, b)] ?? []).includes(id);
const used = (a, b, id) => { const k = pairKey(a, b); (pairHist[k] ??= []).unshift(id); pairHist[k].length = Math.min(pairHist[k].length, 8); };
const notStale = l => !l.some(x => recentLines.includes(x[1]));

// --- greetings and goodbyes by relationship ---------------------------------
const GREET = {
  stranger: (a, b) => [L(a, any([`Oh, hello there.`, `Um, hi!`, `Hello! I don't think we've talked much.`])), L(b, any([`Oh! Hello.`, `Hi there.`, `Ah, hello!`]))],
  new: (a, b) => [L(a, any([`Hi, ${b.name}!`, `Oh, ${b.name}! Hello again.`, `${b.name}, right? Hi!`])), L(b, any([`Hi, ${a.name}!`, `Oh, hey ${a.name}.`, `Hello again!`]))],
  friend: (a, b) => [L(a, any([`Hey ${b.name}!`, `${b.name}! There you are!`, `Oh, hi ${b.name}!`]), 'wave'), L(b, any([`Hey ${a.name}!`, `Hi hi!`, `Oh, ${a.name}! Perfect timing.`]))],
  best: (a, b) => [L(a, any([`${b.name}!! My favorite person!`, `There's my best buddy!`, `${b.name}! I was JUST thinking about you.`]), 'cheer'), L(b, any([`${a.name}! Ha, of course it's you.`, `Bestie!`, `I knew you'd show up!`]), 'happy')],
  sweet: (a, b) => [L(a, any([`Hi, ${b.name}... ♥`, `There you are, cutie.`, `${b.name}! I missed you.`]), 'love'), L(b, any([`${a.name}... hi. ♥`, `Missed you too.`, `You found me!`]), 'love')],
  spouse: (a, b) => [L(a, any([`Hi, honey!`, `There's my sweetheart.`, `${b.name}! How's your day going?`]), 'love'), L(b, any([`Hi, dear!`, `Better now that you're here.`, `Busy! But good.`]), 'happy')],
  family: (a, b) => [L(a, any([`Hey, ${b.name}!`, `Oh, it's you! How are you doing?`])), L(b, any([`Hi! I'm good, thanks.`, `Hey! Fancy meeting you out here.`]))],
  ex: (a, b) => [L(a, any([`Oh. ${b.name}.`, `...Hi.`, `Hey. Long time.`])), L(b, any([`...Hey.`, `Oh. Hi.`, `Um. Hello.`]), 'idle')],
};
const BYE = {
  stranger: (a, b) => [L(b, any([`Well, nice talking to you!`, `See you around!`]))],
  new: (a, b) => [L(a, any([`Let's talk again sometime!`, `Catch you later!`]))],
  friend: (a, b) => [L(b, any([`See you later!`, `Talk soon!`, `Let's hang out again!`]), 'wave')],
  best: (a, b) => [L(a, any([`Same time tomorrow?`, `Don't be a stranger!`, `Love ya, ${b.name}!`]), 'cheer'), L(b, any([`Obviously!`, `You know it!`]), 'happy')],
  sweet: (a, b) => [L(b, any([`See you soon... ♥`, `I'll miss you!`, `Don't go too far, okay?`]), 'love')],
  spouse: (a, b) => [L(a, any([`See you at home!`, `Don't be late for dinner!`, `Love you!`]), 'love')],
  family: (a, b) => [L(b, any([`Take care!`, `Say hi to everyone at home!`]))],
  ex: (a, b) => [L(a, any([`Well... bye.`, `Anyway. See you.`]), 'idle')],
};

// --- conversation beats: each returns lines or null -------------------------
const hour = () => G.dayNight?.state?.hour ?? new Date().getHours();
const BEATS = [
  // memory: something that happened to these two together
  { id: 'shared', w: 5, when: (a, b) => mem(a.res).find(m => m.with?.includes(b.res.id) && Date.now() - m.t < 6 * 3600e3), make: (a, b, m) => {
      const t = m.text, aFirst = t.indexOf(a.name) >= 0 && (t.indexOf(b.name) < 0 || t.indexOf(a.name) < t.indexOf(b.name));
      if (m.kind === 'wedding') return [L(a, `I still can't believe we got married!`, 'love'), L(b, `Best day ever. ♥`, 'love')];
      if (/visited|visit to|place/.test(t)) return aFirst ? [L(a, `Thanks for having me over earlier!`, 'happy'), L(b, `Anytime! Come back soon.`, 'happy')] : [L(a, `It was fun having you over earlier!`, 'happy'), L(b, `Your place is so cozy!`, 'happy')];
      if (/fight|argu|grump|irritated|upset/.test(t)) return [L(a, `Hey... sorry about earlier.`, 'sad'), L(b, any([`It's okay. I'm sorry too.`, `Let's just forget about it.`]), 'happy')];
      if (/cheered/.test(t)) return aFirst ? [L(a, `Feeling better now?`), L(b, `Much better. Thanks to you!`, 'love')] : [L(a, `Thanks for cheering me up before.`, 'love'), L(b, `That's what friends are for!`, 'happy')];
      if (/met|acquaint/.test(t)) return [L(a, `I'm glad we met!`, 'happy'), L(b, `Me too!`, 'happy')];
      return [L(a, any([`That was fun earlier!`, `Hey, about earlier... that was great!`]), 'happy'), L(b, any([`Haha, yes! Let's do that again.`, `How could I forget?`, `That was the best!`]), 'laugh')];
    } },
  // gossip: island news that doesn't involve the listener
  { id: 'gossip', w: 4, when: (a, b) => (data._gossip ?? []).find(g => g.who.length && !g.who.includes(b.res.id) && !g.who.includes(a.res.id) && Date.now() - g.t < 6 * 3600e3), make: (a, b, g) => {
      const big = /married|in love|baby|sweetheart|couple/.test(g.text);
      return [L(a, `Did you hear? ${g.text}`, big ? 'surprised' : 'talk'), L(b, big ? any([`No WAY!`, `Oh my gosh, really?!`, `I had no idea!`]) : any([`Ha, that sounds like them.`, `Oh, fun!`, `Aww, I missed it!`]), big ? 'surprised' : 'laugh')];
    } },
  // something the player did for them
  { id: 'fed', w: 4, when: a => mem(a.res).find(m => m.kind === 'fed' && Date.now() - m.t < 3 * 3600e3), make: (a, b, m) => {
      const f = foods(m.item);
      return m.taste === 'love' ? [L(a, `I had ${f} today and it was AMAZING.`, 'love'), L(b, b.res.prefs?.loves?.includes(m.item) ? `${cap(f)}?! I love those too!` : `Lucky! I'm jealous.`, 'happy')]
        : m.taste === 'hate' ? [L(a, `Someone gave me ${f} today... bleh.`, 'yuck'), L(b, b.res.prefs?.loves?.includes(m.item) ? `What? I love ${f}!` : `Oh no, poor you!`, 'surprised')]
        : [L(a, `I had some ${f} earlier. Not bad!`), L(b, `Ooh, nice.`)];
    } },
  { id: 'dressed', w: 3, when: a => mem(a.res).find(m => m.kind === 'dressed' && Date.now() - m.t < 6 * 3600e3), make: (a, b) => [L(a, `Do you like my new outfit?`, 'peace'), L(b, any([`It really suits you!`, `Ooh, so stylish!`, `Hmm... it's very... you!`]), 'happy')] },
  // how they feel right now
  { id: 'hungry', w: 6, when: a => (a.res.hunger ?? 100) < 45 || a.res.problem?.type === 'hungry', make: (a, b) => { const fav = a.res.prefs?.loves?.[0]; return [L(a, `I'm SO hungry... I could eat ${fav ? foodName(fav) : 'anything'} right now.`, 'hungry'), L(b, any([`Me too, actually!`, `Go get a snack! Munch Mart is open.`, `Your tummy is rumbling, haha!`]))]; } },
  { id: 'sad', w: 7, when: a => a.res.problem?.type === 'sad' || a.res.mood?.kind === 'upset', make: (a, b, _, t) => ['best', 'friend', 'sweet', 'spouse', 'family'].includes(t)
      ? [L(a, `I've been feeling kind of down today.`, 'sad'), L(b, any([`Aww, come here. Want to talk about it?`, `I'm here for you, okay?`, `Let's do something fun to cheer you up!`]), 'love')]
      : [L(a, `Sorry, I'm not in a great mood today.`, 'sad'), L(b, `Oh... I hope you feel better soon.`, 'sad')] },
  { id: 'grumpy', w: 7, when: a => a.res.mood?.kind === 'irritated', make: (a, b) => [L(a, `Hmph. Not the best day.`, 'angry'), L(b, any([`Whoa, okay. I'll give you some space.`, `Yikes. Did something happen?`]), 'surprised')] },
  { id: 'want', w: 4, when: a => a.res.problem?.type === 'want', make: (a, b) => { const p = a.res.problem; const it = p.kind === 'food' ? foods(p.item) : 'a new outfit'; return [L(a, `I really, really want ${it}.`, 'hungry'), L(b, any([`I hope someone gets it for you!`, `You've mentioned that like ten times, haha.`]), 'laugh')]; } },
  // where they are / weather / time
  { id: 'beach', w: 4, when: a => a.__place === 'beach', make: (a, b) => [L(a, any([`The waves sound so nice today.`, `I could stay at the beach forever.`])), L(b, any([`Want to look for seashells?`, `Race you to the water!`]), 'cheer')] },
  { id: 'plaza', w: 2, when: a => a.__place === 'plaza', make: (a, b) => [L(a, `The fountain looks extra sparkly today.`), L(b, any([`I made a wish on it once...`, `Let's toss a coin in!`]), 'happy')] },
  { id: 'rain', w: 5, when: () => G.weather?.wet, make: (a, b) => [L(a, voice(a).hyper ? `Rain! Let's jump in puddles!` : `I wish this rain would stop...`, voice(a).hyper ? 'cheer' : 'sad'), L(b, voice(b).hyper ? `YES! Puddle time!` : `Me too. I'm getting soaked.`)] },
  { id: 'morning', w: 3, when: () => hour() < 10, make: (a, b) => [L(a, voice(a).calm ? `Mmm... still waking up.` : `Good morning! What a day to be awake!`), L(b, voice(b).calm ? `Same... coffee first.` : `Morning! Let's make it a good one!`)] },
  { id: 'evening', w: 3, when: () => hour() >= 19, make: (a, b) => [L(a, `It's getting late. The sky is so pretty, though.`), L(b, voice(b).calm ? `I'm already sleepy...` : `Night is the best time for secrets!`)] },
  // preferences: replies depend on whether they agree
  { id: 'food', w: 3, when: a => a.res.prefs?.loves?.length, make: (a, b) => { const f = a.res.prefs.loves[0], n = foods(f);
      const r = b.res.prefs?.loves?.includes(f) ? [L(b, `Wait, you love ${n} too?! We have to eat together!`, 'cheer')] : b.res.prefs?.hates?.includes(f) ? [L(b, `Eww, ${n}? No way!`, 'yuck'), L(a, `Hey! Don't knock it till you try it!`, 'angry')] : [L(b, any([`Ooh, I'll have to try some.`, `I don't think I've ever had ${n}!`, `Good to know! I'll remember that.`]))];
      return [L(a, `${cap(n)} ${isAre(n)} my favorite food in the whole world!`, 'happy'), ...r]; } },
  { id: 'hatefood', w: 2, when: a => a.res.prefs?.hates?.length, make: (a, b) => { const f = a.res.prefs.hates[0], n = foods(f);
      return [L(a, `I can't stand ${n}. Blech.`, 'yuck'), L(b, b.res.prefs?.hates?.includes(f) ? `RIGHT?! Finally, someone gets it.` : b.res.prefs?.loves?.includes(f) ? `What?! ${cap(n)} ${isAre(n)} amazing!` : `Haha, everyone has their thing.`, b.res.prefs?.loves?.includes(f) ? 'surprised' : 'laugh')]; } },
  { id: 'lingo', w: 3, when: a => a.res.lingo && Object.keys(a.res.lingo).length, make: (a, b) => { const [k, v] = any(Object.entries(a.res.lingo));
      return k === 'phrase' ? [L(a, `${v}!`, 'cheer'), L(b, any([`Haha, you always say that!`, `What does that even mean?`]), 'laugh')]
        : k === 'hobby' ? [L(a, `I've been really into ${v} lately.`), L(b, any([`Can you show me sometime?`, `That's so you!`]))]
        : k === 'place' ? [L(a, `Someday I'm going to visit ${v}.`), L(b, any([`Take me with you!`, `That sounds dreamy.`]))]
        : [L(a, `Have you ever tried ${v}? So good.`), L(b, `I'll add it to my list!`)]; } },
  // personality flavour
  { id: 'energy', w: 2, when: a => voice(a).hyper, make: (a, b) => [L(a, `I have SO much energy today! Race you to the beach!`, 'cheer'), L(b, voice(b).calm ? `Maybe later... I'm comfy.` : `You're on!`, voice(b).calm ? 'idle' : 'cheer')] },
  { id: 'smart', w: 2, when: a => voice(a).smart, make: (a, b) => [L(a, any([`Did you know octopuses have three hearts?`, `Did you know clouds can weigh a million pounds?`, `Fun fact: honey never goes bad!`])), L(b, any([`Whoa, really?!`, `How do you know all this stuff?`, `My brain hurts, haha.`]), 'surprised')] },
  // relationship flavour
  { id: 'bestjoke', w: 4, when: (a, b, t) => t === 'best', make: (a, b) => [L(a, `Remember that time we laughed until we couldn't breathe?`, 'laugh'), L(b, `Haha, stop! Don't make me start again!`, 'laugh')] },
  { id: 'flirt', w: 5, when: (a, b, t) => t === 'sweet', make: (a, b) => [L(a, any([`You look really nice today.`, `I like spending time with you.`, `Want to go on a walk later?`]), 'love'), L(b, any([`Stop it, you're making me blush!`, `I'd love that. ♥`, `Me too... a lot.`]), 'love')] },
  { id: 'home', w: 5, when: (a, b, t) => t === 'spouse', make: (a, b) => [L(a, any([`What should we have for dinner tonight?`, `I tidied up at home today!`, `Let's watch the stars tonight.`])), L(b, any([`Surprise me!`, `You're the best.`, `It's a date. ♥`]), 'love')] },
  { id: 'awkward', w: 6, when: (a, b, t) => t === 'ex', make: (a, b) => [L(a, `So... how have you been?`, 'idle'), L(b, any([`Fine. You?`, `Good. Busy.`]), 'idle'), L(a, `Cool. Cool cool cool.`, 'idle')] },
  { id: 'small', w: 3, when: (a, b, t) => t === 'stranger' || t === 'new', make: (a, b) => any([
      () => [L(a, `So... do you live around here?`), L(b, any([`Yep, just up the road!`, `Mm-hm, by the plaza.`, `I do! I love it here.`]))],
      () => [L(a, `Nice weather, huh?`), L(b, G.weather?.wet ? `Well... apart from the rain!` : any([`It really is!`, `Perfect day for a walk.`]))],
      () => [L(a, `What do you like to do for fun?`), L(b, voice(b).hyper ? `Running around! You?` : voice(b).smart ? `Reading, mostly. And puzzles!` : `Oh, all sorts of things!`), L(a, `Ooh, nice.`)],
      () => [L(a, `Have you tried the food at Munch Mart?`), L(b, `Not yet! Is it good?`), L(a, `So good.`, 'happy')],
    ])() },
  { id: 'island', w: 1, when: () => true, make: (a, b) => [L(a, any([`This island is the best place to live.`, `Have you seen the new shops?`, `I think something exciting is going to happen today.`])), L(b, any([`Totally agree!`, `I know, right?`, `Ooh, I hope so!`]))] },
];
function chat(a, b) {
  const t = tier(a, b);
  const lines = [...(GREET[t] ?? GREET.friend)(a, b)];
  const beats = [];
  // pick 1-3 beats, longer for closer friends and chattier Miis
  const want = Math.max(1, Math.min(3, Math.round(1 + (['best', 'sweet', 'spouse'].includes(t) ? 1 : 0) + (voice(a).loud ? .7 : 0) + (voice(a).quiet ? -.6 : 0) + Math.random() * .8)));
  for (let k = 0; k < want; k++) {
    const speaker = k % 2 ? b : a, listener = speaker === a ? b : a;
    const opts = BEATS.map(B => { const ctx = B.when(speaker, listener, t); return ctx && !beats.includes(B.id) && fresh(a, b, B.id) ? { B, ctx } : null; }).filter(Boolean);
    if (!opts.length) break;
    let tot = opts.reduce((s, o) => s + o.B.w, 0), r = Math.random() * tot, ch = opts[0];
    for (const o of opts) { if ((r -= o.B.w) <= 0) { ch = o; break; } }
    let made = ch.B.make(speaker, listener, ch.ctx, t);
    for (let tries = 0; tries < 3 && !notStale(made); tries++) made = ch.B.make(speaker, listener, ch.ctx, t);
    beats.push(ch.B.id); used(a, b, ch.B.id); lines.push(...made);
  }
  lines.push(...(BYE[t] ?? BYE.friend)(a, b));
  for (const l of lines) { recentLines.unshift(l[1]); recentSaid.unshift(l[1].replace(/^\.\.\./, '').replace(/!$/, '.')); recentSaid.unshift(l[1]); } recentLines.length = Math.min(recentLines.length, 40); recentSaid.length = Math.min(recentSaid.length, 60);
  return lines;
}
const FIGHTS = [
  (a, b) => [L(a, `Hey, that was MY idea!`, 'angry'), L(b, `No way! It was mine!`, 'angry')],
  (a, b) => [L(a, `You ate the last cookie, didn't you?!`, 'angry'), L(b, `So what if I did?!`, 'angry')],
  (a, b) => [L(a, `You never listen to me!`, 'angry'), L(b, `I DO listen! You just never stop talking!`, 'angry')],
  (a, b) => [L(a, `Why are you always copying me?`, 'angry'), L(b, `Copying YOU? Please!`, 'angry')],
  (a, b) => [L(a, `That's not funny!`, 'angry'), L(b, `It was a little funny...`, 'laugh'), L(a, `Hmph!`, 'angry')],
];
const fightLines = (a, b) => any(FIGHTS)(a, b);
const introLines = (a, b) => [L(a, any([`Oh! Hi there. I'm ${a.name}.`, `Hello! I'm ${a.name}. I don't think we've met!`, `Hi! You must be new around here. I'm ${a.name}!`]), 'wave'),
  L(b, any([`Nice to meet you! I'm ${b.name}!`, `Hi ${a.name}! I'm ${b.name}.`, `Oh, hello! ${b.name}. Pleased to meet you!`]), 'happy'),
  L(a, voice(a).loud ? `Let's be friends!` : any([`I hope we'll get along.`, `See you around, ${b.name}!`]), 'happy')];

window.__kl = { gather, frontSpot, pickWant, wander, dwell, steer, chat, fightLines, introLines };
console.info('[kokoro-life] loaded');
