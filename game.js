const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
}
resize();
window.addEventListener("resize", resize);

// Pixel art scale: each "sprite pixel" renders as PIXEL×PIXEL world pixels.
const PIXEL = 3;

// World layout
const ROAD_MAX = 520;              // widest the icy road ever gets
const SHOULDER_WIDTH = 220;        // snow shoulder width on each side
const WORLD_WIDTH = ROAD_MAX + SHOULDER_WIDTH * 2;
const TRACK_PATTERN_HEIGHT = 2000; // one "loop" of the track

// --------- TRACK SHAPE — EDIT THIS ---------
// Each point is [y_offset, left_edge, right_edge] in world units.
// y_offset increases from 0 to TRACK_PATTERN_HEIGHT.
// More negative left / more positive right = wider road.
// Last row must match the first for a seamless loop.
const TRACK_SHAPE = [
  [   0, -230,  230],
  [ 300, -160,  260],
  [ 600, -260,  180],
  [ 900, -180,  280],
  [1200, -260,  200],
  [1500, -180,  260],
  [1800, -240,  200],
  [2000, -230,  230],
];

// --------- SNOW ISLANDS — EDIT THIS ---------
// Little snow patches sitting in the middle of the road. Touching one
// triggers spin-out just like hitting the shoulder.
// { y: position-in-pattern, x: horizontal offset, rx/ry: half-widths }
const SNOW_ISLANDS = [
  { y:  450, x:  20, rx: 95, ry: 70 },
  { y: 1350, x: -30, rx: 75, ry: 55 },
];

function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { return t * t * (3 - 2 * t); }

function sampleShape(y) {
  const yMod = ((y % TRACK_PATTERN_HEIGHT) + TRACK_PATTERN_HEIGHT) % TRACK_PATTERN_HEIGHT;
  for (let i = 0; i < TRACK_SHAPE.length - 1; i++) {
    const [y0, l0, r0] = TRACK_SHAPE[i];
    const [y1, l1, r1] = TRACK_SHAPE[i + 1];
    if (yMod >= y0 && yMod <= y1) {
      const t = (yMod - y0) / (y1 - y0);
      const s = smoothstep(t);
      return [lerp(l0, l1, s), lerp(r0, r1, s)];
    }
  }
  return [TRACK_SHAPE[0][1], TRACK_SHAPE[0][2]];
}

function roadLeftAt(y)  { return sampleShape(y)[0]; }
function roadRightAt(y) { return sampleShape(y)[1]; }
function roadWidthAt(y) { return roadRightAt(y) - roadLeftAt(y); }
function roadCenterAt(y){ return (roadRightAt(y) + roadLeftAt(y)) / 2; }

function isOnIsland(x, y) {
  const yMod = ((y % TRACK_PATTERN_HEIGHT) + TRACK_PATTERN_HEIGHT) % TRACK_PATTERN_HEIGHT;
  for (const isl of SNOW_ISLANDS) {
    const dx = (x - isl.x) / isl.rx;
    const dy = (yMod - isl.y) / isl.ry;
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
}

// ---------- Touch input (virtual joystick + fire button) ----------

let touchSeen = false;
function isTouchish() {
  return touchSeen
      || ("ontouchstart" in window)
      || (navigator.maxTouchPoints > 0)
      || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
}

const joystick = {
  active: false,
  touchId: null,
  baseX: 0, baseY: 0,       // center of the base (set when touch starts)
  stickX: 0, stickY: 0,     // current finger position
  dx: 0, dy: 0,             // normalized vector (-1..1)
  radius: 60,
};

// Each new touch down counts as a fire tap (consumed in update()).
let touchFire = false;

function getCanvasPoint(touch) {
  const rect = canvas.getBoundingClientRect();
  return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
}

function startJoystick(touch) {
  const p = getCanvasPoint(touch);
  joystick.active = true;
  joystick.touchId = touch.identifier;
  joystick.baseX = p.x;
  joystick.baseY = p.y;
  joystick.stickX = p.x;
  joystick.stickY = p.y;
  joystick.dx = 0; joystick.dy = 0;
}

function updateJoystick(touch) {
  const p = getCanvasPoint(touch);
  let dx = p.x - joystick.baseX;
  let dy = p.y - joystick.baseY;
  const dist = Math.hypot(dx, dy);
  const max = joystick.radius;
  if (dist > max) { dx = dx * max / dist; dy = dy * max / dist; }
  joystick.stickX = joystick.baseX + dx;
  joystick.stickY = joystick.baseY + dy;
  joystick.dx = dx / max;
  joystick.dy = dy / max;
}

function endJoystick() {
  joystick.active = false;
  joystick.touchId = null;
  joystick.dx = 0; joystick.dy = 0;
}

canvas.addEventListener("touchstart", (e) => {
  touchSeen = true;
  // Every touch-down fires one shot (tank only — handled in update()).
  touchFire = true;
  for (const t of e.changedTouches) {
    if (!joystick.active) startJoystick(t);
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joystick.touchId) updateJoystick(t);
  }
  e.preventDefault();
}, { passive: false });

function endTouch(t) {
  if (t.identifier === joystick.touchId) endJoystick();
}
canvas.addEventListener("touchend",    (e) => { for (const t of e.changedTouches) endTouch(t); e.preventDefault(); }, { passive: false });
canvas.addEventListener("touchcancel", (e) => { for (const t of e.changedTouches) endTouch(t); e.preventDefault(); }, { passive: false });

// Input
const keys = Object.create(null);
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
  if (game.state !== "playing" && (e.key === " " || e.key === "Enter")) {
    resetGame();
  }
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

canvas.addEventListener("click", () => {
  if (game.state !== "playing") resetGame();
});

// Entities
const SPIN_DURATION = 1.5; // seconds
const FIRE_COOLDOWN = 1.3; // seconds between tank shots
const BULLET_SPEED = 340;  // world units/second
const BULLET_LIFESPAN = 2.4;
const BULLET_SPREAD = 50;  // spacing between the in-line bullets (bigger = more gap)
const ROUND_TIME = 120;    // seconds per round
const AUTO_SCROLL = 110;   // world units/sec the road carries you forward

const game = {
  timeLeft: ROUND_TIME,
  state: "playing", // "playing" | "tankWins" | "carWins"
  playerIsTank: Math.random() < 0.5,
  roleSplash: 2.5, // seconds the "YOU ARE THE ___" splash is shown at round start
  resumeDelay: 0, // short "get ready" countdown after resuming from pause
};

// Pause both gameplay and audio when the tab/window is hidden.
let paused = false;
function pauseGame() {
  paused = true;
  stopMusic();
}
function unpauseGame() {
  paused = false;
  last = performance.now();
  if (game.state === "playing") {
    game.resumeDelay = 2.0; // short "get ready" so the player can focus
    startMusic();
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame(); else unpauseGame();
});
window.addEventListener("blur",  pauseGame);
window.addEventListener("focus", () => { if (!document.hidden) unpauseGame(); });

const tank = {
  x: 0,
  y: -120,
  angle: 0, // facing up (away from the car at start)
  resetAngle: 0,
  speed: 0,
  maxSpeed: 190,
  accel: 380,
  friction: 320,
  turnSpeed: 2.4,
  w: 42,
  h: 54,
  spinning: 0,
  cooldown: 0,
  muzzleFlash: 0,
};

const car = {
  x: 0,
  y: 120,
  angle: 0, // facing up
  resetAngle: 0,
  speed: 0,
  maxSpeed: 260,
  accel: 520,
  friction: 320,
  turnSpeed: 3.6,
  w: 36,
  h: 52,
  spinning: 0,
  hitFlash: 0,
  lives: 3,
};

const bullets = [];
const particles = [];
let shakeTime = 0;
const SHAKE_DURATION = 0.3;
const SHAKE_MAX = 10;

// ---------- Sound (Web Audio, no asset files) ----------

let audioCtx = null;
function getAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function noiseBuffer(ac, seconds) {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function playShoot() {
  const ac = getAudio(); if (!ac) return;
  const now = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.15);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  const filt = ac.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.setValueAtTime(1800, now);
  filt.frequency.exponentialRampToValueAtTime(300, now + 0.12);
  src.connect(filt).connect(gain).connect(ac.destination);
  src.start(now); src.stop(now + 0.15);
}

function playHit() {
  const ac = getAudio(); if (!ac) return;
  const now = ac.currentTime;
  // Low thud
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(gain).connect(ac.destination);
  osc.start(now); osc.stop(now + 0.22);
  // Noise click on top
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.05);
  const ngain = ac.createGain();
  ngain.gain.setValueAtTime(0.25, now);
  ngain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  src.connect(ngain).connect(ac.destination);
  src.start(now); src.stop(now + 0.05);
}

function playSpin() {
  const ac = getAudio(); if (!ac) return;
  const now = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.6);
  const filt = ac.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = 900;
  filt.Q.value = 3;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
  gain.gain.linearRampToValueAtTime(0.0, now + 0.6);
  // Amplitude modulation gives it a rattle
  const lfo = ac.createOscillator();
  lfo.frequency.value = 18;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 0.15;
  lfo.connect(lfoGain).connect(gain.gain);
  src.connect(filt).connect(gain).connect(ac.destination);
  lfo.start(now); lfo.stop(now + 0.6);
  src.start(now); src.stop(now + 0.6);
}

function playTone(freq, when, duration, gainPeak) {
  const ac = getAudio(); if (!ac) return;
  const osc = ac.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, when);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(gainPeak, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(when); osc.stop(when + duration + 0.02);
}

function playWin() {
  const ac = getAudio(); if (!ac) return;
  const t = ac.currentTime;
  // C5, E5, G5, C6 — triumphant upward arpeggio
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => playTone(f, t + i * 0.12, 0.2, 0.15));
}

function playLose() {
  const ac = getAudio(); if (!ac) return;
  const t = ac.currentTime;
  // Descending "oh no" tones
  const notes = [392.00, 329.63, 261.63, 196.00];
  notes.forEach((f, i) => playTone(f, t + i * 0.18, 0.28, 0.14));
}

// ---------- Chase music (procedural loop) ----------

const NOTE = {
  E2:  82.41, F2:  87.31, G2:  98.00,
  A2: 110.00, B2: 123.47, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00,
  A3: 220.00, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00,
  C5: 523.25, D5: 587.33, E5: 659.25,
};

// 16-step bass + lead pattern, one bar = 16 eighth notes.
const BASS_PATTERN = ["A2","A2","E3","A2","A2","G2","F2","E2","A2","A2","E3","A2","C3","G2","F2","E2"];
const LEAD_PATTERN = [null,null,"E4",null,"A4",null,"G4",null,null,null,"E4",null,"C5",null,"A4","G4"];
const TEMPO_BPM = 130;

let music = null; // { nextTime, step, timer }

function startMusic() {
  const ac = getAudio(); if (!ac || music) return;
  const eighth = (60 / TEMPO_BPM) / 2;
  music = { nextTime: ac.currentTime + 0.1, step: 0, eighth };
  scheduleMusic();
}

function stopMusic() {
  if (!music) return;
  clearTimeout(music.timer);
  music = null;
}

function scheduleMusic() {
  if (!music) return;
  const ac = getAudio(); if (!ac) return;
  // Keep a half-second scheduling lookahead.
  while (music.nextTime < ac.currentTime + 0.5) {
    const step = music.step % BASS_PATTERN.length;
    const bNote = BASS_PATTERN[step];
    const lNote = LEAD_PATTERN[step];
    if (bNote) playMusicBass(NOTE[bNote], music.nextTime, music.eighth);
    if (lNote) playMusicLead(NOTE[lNote], music.nextTime, music.eighth * 0.9);
    music.nextTime += music.eighth;
    music.step++;
  }
  music.timer = setTimeout(scheduleMusic, 80);
}

function playMusicBass(freq, when, duration) {
  const ac = getAudio(); if (!ac) return;
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = freq;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0, when);
  gain.gain.linearRampToValueAtTime(0.09, when + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration * 0.95);
  const filt = ac.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 500;
  osc.connect(filt).connect(gain).connect(ac.destination);
  osc.start(when); osc.stop(when + duration + 0.01);
}

function playMusicLead(freq, when, duration) {
  const ac = getAudio(); if (!ac) return;
  const osc = ac.createOscillator();
  osc.type = "square";
  osc.frequency.value = freq;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0, when);
  gain.gain.linearRampToValueAtTime(0.045, when + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(when); osc.stop(when + duration + 0.02);
}

// Camera follows the midpoint between the two vehicles.
let cameraY = 0;
let viewScale = 1; // updated each frame in draw()

function update(dt) {
  // Always let the screen shake wind down, even after the round ends.
  if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);

  if (game.state !== "playing") return;

  // Hold everything still while the "YOU ARE THE ___" splash is up.
  if (game.roleSplash > 0) {
    game.roleSplash -= dt;
    return;
  }

  // Short "get ready" countdown after resuming from pause.
  if (game.resumeDelay > 0) {
    game.resumeDelay -= dt;
    return;
  }

  // The road carries both vehicles forward automatically (like the Scratch original).
  tank.y -= AUTO_SCROLL * dt;
  car.y  -= AUTO_SCROLL * dt;

  // Single-player: arrow keys OR virtual joystick drive the player. Tank fires with Space or the fire button.
  const dead = 0.25;
  const playerInput = {
    forward: keys["arrowup"]    || joystick.dy < -dead,
    back:    keys["arrowdown"]  || joystick.dy >  dead,
    left:    keys["arrowleft"]  || joystick.dx < -dead,
    right:   keys["arrowright"] || joystick.dx >  dead,
  };

  updateAI(dt);
  const tankInput = game.playerIsTank ? playerInput : tankAI();
  const carInput  = game.playerIsTank ? carAI()     : playerInput;

  updateVehicle(tank, tankInput, dt);
  updateVehicle(car,  carInput,  dt);

  // Tank firing (player or AI)
  tank.cooldown = Math.max(0, tank.cooldown - dt);
  const wantFire = game.playerIsTank ? (keys[" "] || touchFire) : tank._aiShoot;
  if (wantFire && tank.cooldown <= 0 && tank.spinning <= 0) {
    fireBullets();
    tank.cooldown = FIRE_COOLDOWN;
    tank.muzzleFlash = 0.09;
    playShoot();
  }
  touchFire = false; // consume any tap-fire this frame
  if (tank.muzzleFlash > 0) tank.muzzleFlash = Math.max(0, tank.muzzleFlash - dt);

  updateBullets(dt);
  resolveVehicleCollision();
  updateParticles(dt);

  // Hit flash timer
  if (car.hitFlash > 0) car.hitFlash = Math.max(0, car.hitFlash - dt);

  // Spawn spin-out dust while either vehicle is spinning.
  if (tank.spinning > 0) spawnSpinDust(tank, dt);
  if (car.spinning  > 0) spawnSpinDust(car,  dt);

  // Round timer
  game.timeLeft = Math.max(0, game.timeLeft - dt);

  // Win conditions
  if (car.lives <= 0) {
    game.state = "tankWins";
    stopMusic();
    playWin();
  } else if (game.timeLeft <= 0) {
    game.state = "carWins";
    stopMusic();
    playLose();
  }

  // Camera tracks midpoint, smoothed.
  const targetCamY = (tank.y + car.y) / 2;
  cameraY += (targetCamY - cameraY) * Math.min(1, dt * 4);

  // Keep both vehicles on screen.
  clampToScreenY(tank);
  clampToScreenY(car);
}

function clampToScreenY(v) {
  const margin = 50;
  const top = cameraY - canvas.height / 2 + margin;
  const bot = cameraY + canvas.height / 2 - margin;
  if (v.y < top) v.y = top;
  if (v.y > bot) v.y = bot;
}

function spawnSpinDust(v, dt) {
  // Spawn ~25 particles per second while spinning.
  const spawnChance = dt * 25;
  if (Math.random() > spawnChance) return;
  const angle = Math.random() * Math.PI * 2;
  const speed = 50 + Math.random() * 60;
  particles.push({
    x: v.x + Math.cos(angle) * 12,
    y: v.y + Math.sin(angle) * 12,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.5 + Math.random() * 0.25,
    maxLife: 0.75,
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.2, dt);
    p.vy *= Math.pow(0.2, dt);
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    const t = Math.max(0, p.life / p.maxLife);
    const size = PIXEL * (1 + t * 1.5);
    ctx.fillStyle = `rgba(242, 248, 252, ${t})`;
    ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
  }
}

function resolveVehicleCollision() {
  const dx = car.x - tank.x;
  const dy = car.y - tank.y;
  const dist = Math.hypot(dx, dy);
  const rTank = (tank.w + tank.h) / 4;
  const rCar  = (car.w + car.h)   / 4;
  const minDist = rTank + rCar;
  if (dist < minDist && dist > 0.1) {
    const nx = dx / dist;
    const ny = dy / dist;
    const push = (minDist - dist) / 2 + 10;
    // Push both apart so they separate.
    tank.x -= nx * push;
    tank.y -= ny * push;
    car.x  += nx * push;
    car.y  += ny * push;
    // Bounce: kill speed and give a brief kick backward.
    tank.speed = -tank.maxSpeed * 0.45;
    car.speed  = -car.maxSpeed  * 0.45;
  }
}

function resetGame() {
  game.timeLeft = ROUND_TIME;
  game.state = "playing";
  game.playerIsTank = Math.random() < 0.5;
  game.roleSplash = 2.5;
  bullets.length = 0;
  particles.length = 0;

  tank.x = 0; tank.y = -120; tank.angle = 0; tank.speed = 0;
  tank.spinning = 0; tank.cooldown = 0; tank.muzzleFlash = 0;
  tank._aiShoot = false;

  car.x = 0; car.y = 120; car.angle = 0; car.speed = 0;
  car.spinning = 0; car.hitFlash = 0; car.lives = 3;

  cameraY = 0;
  startMusic();
}

// ---------- CPU AI ----------

function normalizeAngle(a) {
  while (a >  Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Angle so that vehicle facing (dx, dy) direction (0 = up, π/2 = right).
function angleTo(dx, dy) {
  return Math.atan2(dx, -dy);
}

// AI "brain state" — carries reaction delay and random moods between frames.
const ai = {
  tank: {
    reactionTimer: 0, targetX: 0, targetY: 0,
    aimJitter: 0, aimJitterTimer: 0,
  },
  car: {
    biasTimer: 0, bias: 0,
    jitterTimer: 0, jitter: 0,
    jukeTimer: 1.0, juke: 0,     // occasional sharp direction swap
    throttleTimer: 0, throttle: 1, // sometimes let off the gas to be unpredictable
  },
};

function updateAI(dt) {
  // Tank: refresh its memory of where the car is every ~0.35s (reaction delay — slower now).
  ai.tank.reactionTimer -= dt;
  if (ai.tank.reactionTimer <= 0) {
    ai.tank.targetX = car.x;
    ai.tank.targetY = car.y;
    ai.tank.reactionTimer = 0.28 + Math.random() * 0.28;
  }
  // Bigger aim wobble so shots miss more often.
  ai.tank.aimJitterTimer -= dt;
  if (ai.tank.aimJitterTimer <= 0) {
    ai.tank.aimJitter = (Math.random() - 0.5) * 0.45;
    ai.tank.aimJitterTimer = 0.25 + Math.random() * 0.4;
  }

  // Car: lane bias flips often to chaotic targets.
  ai.car.biasTimer -= dt;
  if (ai.car.biasTimer <= 0) {
    // Occasionally slam to a hard side instead of sampling smoothly.
    if (Math.random() < 0.3) ai.car.bias = (Math.random() < 0.5 ? -1 : 1) * 260;
    else                     ai.car.bias = (Math.random() - 0.5) * 240;
    ai.car.biasTimer = 0.18 + Math.random() * 0.9;
  }
  // Short-term wobble on top of the lane bias.
  ai.car.jitterTimer -= dt;
  if (ai.car.jitterTimer <= 0) {
    ai.car.jitter = (Math.random() - 0.5) * 90;
    ai.car.jitterTimer = 0.1 + Math.random() * 0.3;
  }
  // Juke: sharp side-darts, bigger and more frequent.
  ai.car.jukeTimer -= dt;
  if (ai.car.jukeTimer <= 0) {
    const r = Math.random();
    if (r < 0.6) {
      ai.car.juke = (Math.random() < 0.5 ? -1 : 1) * (150 + Math.random() * 180);
    } else if (r < 0.75) {
      // Head-fake: dart toward the tank briefly.
      ai.car.juke = (tank.x - car.x) * 0.6;
    } else {
      ai.car.juke = 0;
    }
    ai.car.jukeTimer = 0.25 + Math.random() * 0.9;
  }
  // Throttle: varies — short sprints, coasts, occasional brake.
  ai.car.throttleTimer -= dt;
  if (ai.car.throttleTimer <= 0) {
    const r = Math.random();
    if (r < 0.12)      ai.car.throttle = -0.5; // brief reverse
    else if (r < 0.35) ai.car.throttle = 0;    // coast
    else               ai.car.throttle = 1;    // full ahead
    ai.car.throttleTimer = 0.25 + Math.random() * 0.8;
  }
}

function tankAI() {
  // Aim at the car's REMEMBERED position (delayed), not its current one.
  const dx = ai.tank.targetX - tank.x;
  const dy = ai.tank.targetY - tank.y;
  const dist = Math.hypot(dx, dy);
  const want = angleTo(dx, dy) + ai.tank.aimJitter;
  const diff = normalizeAngle(want - tank.angle);

  const input = {
    forward: dist > 160,
    back:    dist < 90,
    left:    diff < -0.08,
    right:   diff >  0.08,
  };

  // Fire only sometimes even when aligned — not relentless.
  const aligned = Math.abs(diff) < 0.15;
  const inRange = dist > 100 && dist < 380;
  tank._aiShoot = aligned && inRange && Math.random() < 0.22;
  return input;
}

function carAI() {
  const l = roadLeftAt(car.y);
  const r = roadRightAt(car.y);
  const safeL = l + 30;
  const safeR = r - 30;
  const mid = (l + r) / 2;

  // Desired lateral target: middle + current mood bias + wobble + juke.
  let target = mid + ai.car.bias + ai.car.jitter + ai.car.juke;
  // Push away from tank — but sometimes INVERT it as a feint.
  const feintAway = (Math.sin(game.timeLeft * 3.7) > 0.7) ? -1 : 1;
  if (tank.x > car.x) target -= 35 * feintAway;
  else                target += 35 * feintAway;

  // Avoid snow islands — scan a short distance ahead and steer around any island on our path.
  for (const isl of SNOW_ISLANDS) {
    for (const loopBase of [0, TRACK_PATTERN_HEIGHT, -TRACK_PATTERN_HEIGHT]) {
      const ix = isl.x;
      const iy = isl.y - Math.floor(car.y / TRACK_PATTERN_HEIGHT) * TRACK_PATTERN_HEIGHT + loopBase;
      // Only worry about islands just ahead of (or on top of) the car.
      if (iy > car.y + 20) continue;
      if (iy < car.y - isl.ry - 180) continue;
      // Does the target column pass through the island?
      if (Math.abs(target - ix) < isl.rx + 25) {
        // Push target to whichever side of the island is closer to clear.
        const leftExit  = ix - isl.rx - 30;
        const rightExit = ix + isl.rx + 30;
        target = Math.abs(target - leftExit) < Math.abs(target - rightExit) ? leftExit : rightExit;
      }
    }
  }

  // Bullet dodging — swerve away from any bullet that's close and approaching.
  for (const b of bullets) {
    const dx = car.x - b.x;
    const dy = car.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 220) continue;
    // Is the bullet actually coming toward the car?
    const approaching = (b.vx * -dx + b.vy * -dy) > 0;
    if (!approaching) continue;
    // Shove the target sideways relative to the bullet's travel.
    const side = dx >= 0 ? 1 : -1;
    target += side * 110 * (1 - dist / 220);
  }

  if (target < safeL) target = safeL;
  if (target > safeR) target = safeR;

  const err = target - car.x;
  const want = angleTo(err, -80); // aim slightly up/forward
  const diff = normalizeAngle(want - car.angle);

  return {
    forward: ai.car.throttle > 0,
    back:    ai.car.throttle < 0,
    left:    diff < -0.08,
    right:   diff >  0.08,
  };
}

function fireBullets() {
  // Forward unit vector from tank.
  const fx =  Math.sin(tank.angle);
  const fy = -Math.cos(tank.angle);
  // Spawn clearly in front of the barrel tip, no overlap.
  const barrelDist = tank.h / 2 + 48;
  const bx = tank.x + fx * barrelDist;
  const by = tank.y + fy * barrelDist;

  // 2 bullets in a line, one behind the other.
  for (let i = 0; i < 2; i++) {
    const backOffset = i * BULLET_SPREAD;
    bullets.push({
      x: bx - fx * backOffset,
      y: by - fy * backOffset,
      vx: fx * BULLET_SPEED,
      vy: fy * BULLET_SPEED,
      angle: tank.angle,
      life: BULLET_LIFESPAN,
    });
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    // Collision with car (simple rect check, ignoring car rotation).
    const dx = b.x - car.x;
    const dy = b.y - car.y;
    if (Math.abs(dx) < car.w / 2 && Math.abs(dy) < car.h / 2) {
      bullets.splice(i, 1);
      if (car.lives > 0) {
        car.lives -= 1;
        car.hitFlash = 0.15;
        shakeTime = SHAKE_DURATION;
        playHit();
      }
      continue;
    }

    if (b.life <= 0) bullets.splice(i, 1);
  }
}

function updateVehicle(v, input, dt) {
  if (v.spinning > 0) {
    spinOut(v, dt);
  } else {
    drive(v, input, dt);
    if (isOnSnow(v)) {
      v.spinning = SPIN_DURATION;
      playSpin();
    }
  }
  clampToWorld(v);
}

function drive(v, input, dt) {
  if (input.left)  v.angle -= v.turnSpeed * dt * Math.sign(v.speed || 1);
  if (input.right) v.angle += v.turnSpeed * dt * Math.sign(v.speed || 1);

  if (input.forward)      v.speed += v.accel * dt;
  else if (input.back)    v.speed -= v.accel * dt;
  else {
    const drop = v.friction * dt;
    if (v.speed > 0) v.speed = Math.max(0, v.speed - drop);
    else if (v.speed < 0) v.speed = Math.min(0, v.speed + drop);
  }

  v.speed = Math.max(-v.maxSpeed * 0.6, Math.min(v.maxSpeed, v.speed));

  // Angle 0 = up. Convert to dx/dy.
  v.x += Math.sin(v.angle) * v.speed * dt;
  v.y -= Math.cos(v.angle) * v.speed * dt;
}

function spinOut(v, dt) {
  // Ignore input, rotate fast, decay motion.
  const spinsPerSec = 2.5;
  v.angle += spinsPerSec * Math.PI * 2 * dt;
  v.speed *= Math.pow(0.1, dt); // quick decay
  v.x += Math.sin(v.angle) * v.speed * dt;
  v.y -= Math.cos(v.angle) * v.speed * dt;

  v.spinning -= dt;
  if (v.spinning <= 0) {
    v.spinning = 0;
    v.x = roadCenterAt(v.y); // reset to the middle of the road
    v.angle = v.resetAngle;  // face original direction
    v.speed = 0;
  }
}

function isOnSnow(v) {
  const l = roadLeftAt(v.y);
  const r = roadRightAt(v.y);
  if (v.x < l + v.w / 2 || v.x > r - v.w / 2) return true;
  return isOnIsland(v.x, v.y);
}

function clampToWorld(v) {
  const halfRoad = WORLD_WIDTH / 2;
  if (v.x < -halfRoad + 20) v.x = -halfRoad + 20;
  if (v.x >  halfRoad - 20) v.x =  halfRoad - 20;
}

// ---------- Pixel sprite system ----------

function makeSprite(spriteStr, palette, anchorX, anchorY) {
  const lines = spriteStr.replace(/^\n|\n$/g, "").split("\n");
  const h = lines.length;
  const w = Math.max(...lines.map((l) => l.length));
  const spr = document.createElement("canvas");
  spr.width = w;
  spr.height = h;
  const c = spr.getContext("2d");
  c.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      const color = palette[lines[y][x]];
      if (color) {
        c.fillStyle = color;
        c.fillRect(x, y, 1, 1);
      }
    }
  }
  return { canvas: spr, w, h, anchorX, anchorY };
}

const TANK_SPRITE_STR = `
......kk......
......kk......
......kk......
......kk......
BBBBBBBBBBBBBB
B..GGGGGGGG..B
B..GhhhhhhG..B
B..GhhhhhhG..B
B..GhKKKKhG..B
B..GhKttKhG..B
B..GhKttKhG..B
B..GhKttKhG..B
B..GhKttKhG..B
B..GhKKKKhG..B
B..GhhhhhhG..B
B..GhhhhhhG..B
B..GhhhhhhG..B
B..GhhhhhhG..B
B..GGGGGGGG..B
BBBBBBBBBBBBBB
`;

const TANK_PALETTE = {
  ".": null,
  "B": "#0d0d0d",
  "G": "#1a4a1a",
  "h": "#6cdc6c",
  "K": "#1b1b1b",
  "t": "#3a3a3a",
  "k": "#1a1a1a",
};

const CAR_SPRITE_STR = `
..YY....YY..
BB........BB
BB........BB
.RRRRRRRRRR.
.RrrrrrrrR.
.RrDDDDDDrR.
.RrDhhhhDrR.
.RrDhhhhDrR.
.RrDhhhhDrR.
.RrDhhhhDrR.
.RrDDDDDDrR.
.RrrrrrrrR.
.RRRRRRRRRR.
BB........BB
BB........BB
`;

const CAR_PALETTE = {
  ".": null,
  "Y": "#fff099",
  "B": "#0d0d0d",
  "R": "#7a1a1a",
  "r": "#ff4a3a",
  "D": "#1a1a1a",
  "h": "#3a3a3a",
};

// Tree, bush, rock, snowman: real PNG assets (not pixel strings).
// worldH = how tall to draw in world units. anchorYFrac = where on the image is "ground"
// (0 = top, 1 = bottom). Trees anchor at the trunk base, bush/rock at center.
const PNG_HAZARDS = {
  tree:    { url: "assets/tree.png",    worldH: 78, anchorYFrac: 0.97 },
  bush:    { url: "assets/bush.png",    worldH: 34, anchorYFrac: 0.78 },
  rock:    { url: "assets/rock.png",    worldH: 26, anchorYFrac: 0.68 },
  snowman: { url: "assets/snowman.png", worldH: 62, anchorYFrac: 0.95 },
};

function loadPngSprite(def) {
  const img = new Image();
  img.src = def.url;
  return { image: img, worldH: def.worldH, anchorYFrac: def.anchorYFrac };
}

function drawPngSpriteAt(spr, x, y) {
  if (!spr.image.complete || !spr.image.naturalWidth) return;
  const scale = spr.worldH / spr.image.naturalHeight;
  const w = spr.image.naturalWidth  * scale;
  const h = spr.image.naturalHeight * scale;
  // Enable smoothing just for this draw; the PNG is high-res art that downscales.
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    spr.image,
    Math.round(x - w / 2),
    Math.round(y - h * spr.anchorYFrac),
    w, h
  );
  ctx.imageSmoothingEnabled = prev;
}

const BULLET_SPRITE_STR = `
.Y.
YYY
YYY
YYY
.o.
`;

const BULLET_PALETTE = {
  ".": null,
  "Y": "#ffe066",
  "o": "#c47a1a",
};

const HEART_SPRITE_STR = `
.rr.rr.
rRRrRRr
rRRRRRr
.rRRRr.
..rRr..
...r...
`;

const HEART_FULL_PALETTE = {
  ".": null,
  "R": "#ff4a3a",
  "r": "#7a1a1a",
};

const HEART_EMPTY_PALETTE = {
  ".": null,
  "R": "#444",
  "r": "#222",
};

let tankSprite, carSprite, bulletSprite;
let heartFullSprite, heartEmptySprite;
let treePng, bushPng, rockPng, snowmanPng;
function initSprites() {
  // Tank: cannon extends above hull, so anchor = hull center (row 12, col 7).
  tankSprite = makeSprite(TANK_SPRITE_STR, TANK_PALETTE, 7, 12);
  // Car: symmetric, anchor = geometric center (row 7, col 6).
  carSprite = makeSprite(CAR_SPRITE_STR, CAR_PALETTE, 6, 7);
  bulletSprite = makeSprite(BULLET_SPRITE_STR, BULLET_PALETTE, 1, 2);
  heartFullSprite  = makeSprite(HEART_SPRITE_STR, HEART_FULL_PALETTE, 0, 0);
  heartEmptySprite = makeSprite(HEART_SPRITE_STR, HEART_EMPTY_PALETTE, 0, 0);

  // Load external PNG hazards.
  treePng    = loadPngSprite(PNG_HAZARDS.tree);
  bushPng    = loadPngSprite(PNG_HAZARDS.bush);
  rockPng    = loadPngSprite(PNG_HAZARDS.rock);
  snowmanPng = loadPngSprite(PNG_HAZARDS.snowman);

  // Update hitbox dimensions to match sprite body (in world units).
  tank.w = 14 * PIXEL; tank.h = 16 * PIXEL;
  car.w  = 10 * PIXEL; car.h  = 13 * PIXEL;
}
initSprites();

function drawSprite(spr) {
  ctx.drawImage(
    spr.canvas,
    -spr.anchorX * PIXEL,
    -spr.anchorY * PIXEL,
    spr.w * PIXEL,
    spr.h * PIXEL
  );
}

function drawSpriteAt(spr, x, y) {
  const dx = Math.round(x) - spr.anchorX * PIXEL;
  const dy = Math.round(y) - spr.anchorY * PIXEL;
  ctx.drawImage(spr.canvas, dx, dy, spr.w * PIXEL, spr.h * PIXEL);
}

// ---------- Drawing ----------

function draw() {
  ctx.fillStyle = "#0b1a2b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  // Snap camera translate to whole pixels so the pixel grid doesn't shimmer.
  let shakeX = 0, shakeY = 0;
  if (shakeTime > 0) {
    const intensity = (shakeTime / SHAKE_DURATION) * SHAKE_MAX;
    shakeX = Math.round((Math.random() - 0.5) * 2 * intensity);
    shakeY = Math.round((Math.random() - 0.5) * 2 * intensity);
  }
  // View scale: shrink the world so the road fits comfortably on narrow (portrait) screens.
  viewScale = Math.min(1, canvas.width / 900);
  const tx = Math.round(canvas.width / 2) + shakeX;
  const ty = Math.round(canvas.height / 2) + shakeY;
  ctx.translate(tx, ty);
  ctx.scale(viewScale, viewScale);
  ctx.translate(0, -cameraY);

  drawTrack();
  drawHazards();
  drawParticles();
  drawVehicle(tank, tankSprite);
  drawVehicle(car, carSprite);
  drawBullets();

  ctx.restore();

  drawHUD();
}

function drawHUD() {
  // Hearts in the top-left corner.
  const scale = 7;
  const pad = 20;
  const spacing = heartFullSprite.w * scale + 10;
  for (let i = 0; i < 3; i++) {
    const spr = i < car.lives ? heartFullSprite : heartEmptySprite;
    ctx.drawImage(
      spr.canvas,
      pad + i * spacing,
      pad,
      spr.w * scale,
      spr.h * scale
    );
  }

  // "You are the ___" label under the hearts — bigger so it's easy to see.
  const youLabel = game.playerIsTank ? "YOU ARE THE TANK" : "YOU ARE THE CAR";
  const youColor = game.playerIsTank ? "#6cdc6c" : "#ff7a5c";
  ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const yLabelY = pad + heartFullSprite.h * scale + 14;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = 6;
  ctx.strokeText(youLabel, pad, yLabelY);
  ctx.fillStyle = youColor;
  ctx.fillText(youLabel, pad, yLabelY);

  // Timer in the top-right — black with a white halo so it reads on any background.
  const seconds = Math.ceil(game.timeLeft);
  const timeStr = String(seconds).padStart(3, "0");
  const timeLow = seconds <= 10;
  ctx.font = "bold 36px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 6;
  ctx.strokeText(timeStr, canvas.width - pad, pad);
  ctx.fillStyle = timeLow ? "#c21a1a" : "#111";
  ctx.fillText(timeStr, canvas.width - pad, pad);

  drawTouchControls();
  if (game.state !== "playing") drawGameOver();
  if (game.roleSplash > 0) drawRoleSplash();
  if (game.resumeDelay > 0 && game.roleSplash <= 0 && game.state === "playing") drawResumeCountdown();
}

function drawTouchControls() {
  if (!isTouchish()) return;

  // Joystick base + stick (only visible while touched).
  if (joystick.active) {
    ctx.beginPath();
    ctx.arc(joystick.baseX, joystick.baseY, joystick.radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(joystick.stickX, joystick.stickY, joystick.radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.stroke();
  } else {
    // Hint pill in the bottom-left so first-time users know where to touch.
    const hintX = 90, hintY = canvas.height - 100;
    ctx.beginPath();
    ctx.arc(hintX, hintY, 48, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#eaf4ff";
    ctx.fillText("MOVE", hintX, hintY);
  }
}

function drawResumeCountdown() {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.lineJoin = "round";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.strokeText("GET READY", canvas.width / 2, canvas.height / 2 - 60);
  ctx.fillStyle = "#eaf4ff";
  ctx.fillText("GET READY", canvas.width / 2, canvas.height / 2 - 60);

  const n = Math.max(1, Math.ceil(game.resumeDelay));
  ctx.font = "bold 150px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.lineWidth = 12;
  ctx.strokeText(String(n), canvas.width / 2, canvas.height / 2 + 30);
  ctx.fillStyle = "#ffd560";
  ctx.fillText(String(n), canvas.width / 2, canvas.height / 2 + 30);
}

function drawRoleSplash() {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const title = game.playerIsTank ? "YOU ARE THE TANK" : "YOU ARE THE CAR";
  const sub   = game.playerIsTank
    ? "Hunt down the car with Space"
    : "Dodge the tank until the timer runs out";
  const color = game.playerIsTank ? "#6cdc6c" : "#ff7a5c";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = "bold 72px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.lineJoin = "round";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.strokeText(title, canvas.width / 2, canvas.height / 2 - 20);
  ctx.fillStyle = color;
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 20);

  ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.lineWidth = 5;
  ctx.strokeText(sub, canvas.width / 2, canvas.height / 2 + 40);
  ctx.fillStyle = "#eaf4ff";
  ctx.fillText(sub, canvas.width / 2, canvas.height / 2 + 40);
}

function drawGameOver() {
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const playerWon =
    (game.state === "tankWins" && game.playerIsTank) ||
    (game.state === "carWins"  && !game.playerIsTank);
  const title = playerWon ? "YOU WIN!" : "YOU LOSE!";
  const color = playerWon ? "#6cdc6c" : "#ff7a5c";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = "bold 72px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(title, canvas.width / 2 + 4, canvas.height / 2 - 20 + 4);
  ctx.fillStyle = color;
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 20);

  ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillStyle = "#eaf4ff";
  ctx.fillText("Click to play again", canvas.width / 2, canvas.height / 2 + 40);
}

function drawBullets() {
  for (const b of bullets) {
    ctx.save();
    ctx.translate(Math.round(b.x), Math.round(b.y));
    ctx.rotate(b.angle);
    drawSprite(bulletSprite);
    ctx.restore();
  }
}

function drawHazards() {
  const halfView = canvas.height / 2 / viewScale;
  const viewTop = cameraY - halfView - 100;
  const viewBot = cameraY + halfView + 100;
  const slotH = 56;
  const slotsPerPattern = Math.max(1, Math.floor(TRACK_PATTERN_HEIGHT / slotH));
  const startSlot = Math.floor(viewTop / slotH);
  const endSlot   = Math.ceil(viewBot / slotH);

  for (let s = startSlot; s <= endSlot; s++) {
    // Loop-mod so the same hazards appear every TRACK_PATTERN_HEIGHT.
    const sMod = ((s % slotsPerPattern) + slotsPerPattern) % slotsPerPattern;

    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const side = sideIdx === 0 ? -1 : 1;

      const existR = hash2(side + 7, sMod);
      if (existR < 0.35) continue;

      const typeR = hash2(side + 13, sMod);
      let spr;
      if (typeR < 0.50)      spr = treePng;
      else if (typeR < 0.75) spr = bushPng;
      else if (typeR < 0.90) spr = rockPng;
      else                   spr = snowmanPng;

      const yR = hash2(side + 41, sMod);
      const y = s * slotH + (yR - 0.5) * (slotH * 0.6);
      const edge = side < 0 ? roadLeftAt(y) : roadRightAt(y);
      const shoulderInner = edge + side * 20;
      const shoulderOuter = side * (ROAD_MAX / 2 + SHOULDER_WIDTH - 30);
      const xR = hash2(side + 29, sMod);
      const x = lerp(shoulderInner, shoulderOuter, xR);

      drawPngSpriteAt(spr, x, y);
    }
  }
}

// Hash-ish pseudo-random, deterministic per (x,y) tile.
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function drawTrack() {
  const halfView = canvas.height / 2 / viewScale;
  const viewTop = cameraY - halfView - PIXEL * 4;
  const viewBot = cameraY + halfView + PIXEL * 4;

  // Snow base.
  ctx.fillStyle = "#f2f8fc";
  ctx.fillRect(-WORLD_WIDTH / 2, viewTop, WORLD_WIDTH, viewBot - viewTop);

  // Pixel-dither snow texture.
  const tile = PIXEL * 6;
  const startTileY = Math.floor(viewTop / tile) * tile;
  const startTileX = Math.floor(-WORLD_WIDTH / 2 / tile) * tile;
  for (let ty = startTileY; ty < viewBot; ty += tile) {
    const l = roadLeftAt(ty);
    const r = roadRightAt(ty);
    for (let tx = startTileX; tx < WORLD_WIDTH / 2; tx += tile) {
      if (tx > l && tx < r) continue;
      const rand = hash2(tx, ty);
      if (rand > 0.7) {
        ctx.fillStyle = rand > 0.9 ? "#c6dbe8" : "#dde9f0";
        ctx.fillRect(tx, ty, PIXEL, PIXEL);
      }
    }
  }

  // Icy road — filled polygon that follows left/right edges.
  const step = PIXEL * 2;
  ctx.fillStyle = "#9fdcee";
  ctx.beginPath();
  for (let y = viewTop; y <= viewBot; y += step) {
    const x = roadLeftAt(y);
    if (y === viewTop) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let y = viewBot; y >= viewTop; y -= step) {
    ctx.lineTo(roadRightAt(y), y);
  }
  ctx.closePath();
  ctx.fill();

  // Pixel ice sparkles — only inside the road.
  for (let ty = startTileY; ty < viewBot; ty += tile) {
    const l = roadLeftAt(ty);
    const r = roadRightAt(ty);
    for (let tx = Math.floor(l / tile) * tile; tx < r; tx += tile) {
      const rand = hash2(tx + 999, ty);
      if (rand > 0.93) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(tx, ty, PIXEL, PIXEL);
      } else if (rand > 0.88) {
        ctx.fillStyle = "#c2ecf6";
        ctx.fillRect(tx, ty, PIXEL, PIXEL);
      }
    }
  }

  // Road edges — dark green stripe that follows each edge.
  drawRoadEdge(viewTop, viewBot, step, roadLeftAt,  "#2e7a4a", PIXEL * 2);
  drawRoadEdge(viewTop, viewBot, step, roadRightAt, "#2e7a4a", PIXEL * 2);
  drawRoadEdge(viewTop, viewBot, step, roadLeftAt,  "#4aa070", PIXEL);
  drawRoadEdge(viewTop, viewBot, step, roadRightAt, "#4aa070", PIXEL);

  drawIslands(viewTop, viewBot);
}

function drawIslands(viewTop, viewBot) {
  const firstLoop = Math.floor(viewTop / TRACK_PATTERN_HEIGHT) - 1;
  const lastLoop  = Math.floor(viewBot / TRACK_PATTERN_HEIGHT) + 1;
  for (let loop = firstLoop; loop <= lastLoop; loop++) {
    const base = loop * TRACK_PATTERN_HEIGHT;
    for (const isl of SNOW_ISLANDS) {
      const y = base + isl.y;
      if (y + isl.ry < viewTop || y - isl.ry > viewBot) continue;
      // Snow fill.
      ctx.fillStyle = "#f2f8fc";
      ctx.beginPath();
      ctx.ellipse(isl.x, y, isl.rx, isl.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // Dark green outline — matches the road edges.
      ctx.strokeStyle = "#2e7a4a";
      ctx.lineWidth = PIXEL * 2;
      ctx.stroke();
    }
  }
}

function drawRoadEdge(viewTop, viewBot, step, edgeFn, color, thickness) {
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  for (let y = viewTop; y <= viewBot; y += step) {
    const x = edgeFn(y);
    if (y === viewTop) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawVehicle(v, spr) {
  ctx.save();
  // Snap to pixel grid.
  ctx.translate(Math.round(v.x), Math.round(v.y));
  ctx.rotate(v.angle);

  // Pixel shadow — a chunky offset rectangle under the body.
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(-v.w / 2 + 2, -v.h / 2 + 2, v.w, v.h);

  drawSprite(spr);

  // Muzzle flash (tank only) — glow at the barrel tip.
  if (v === tank && v.muzzleFlash > 0) {
    const t = v.muzzleFlash / 0.09;
    const flashY = -12 * PIXEL - 10;
    const base = 10 * (0.5 + t * 0.7);
    ctx.fillStyle = `rgba(255, 180, 60, ${t * 0.6})`;
    ctx.beginPath();
    ctx.arc(0, flashY, base * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 230, 120, ${t})`;
    ctx.beginPath();
    ctx.arc(0, flashY, base, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 220, ${t})`;
    ctx.beginPath();
    ctx.arc(0, flashY, base * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hit flash — white tint on the sprite (not the surrounding box).
  if (v.hitFlash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = Math.min(1, v.hitFlash / 0.15);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-spr.anchorX * PIXEL, -spr.anchorY * PIXEL, spr.w * PIXEL, spr.h * PIXEL);
    ctx.restore();
  }

  ctx.restore();
}

// ---------- Main loop ----------

let last = performance.now();
function loop(now) {
  if (paused) {
    last = now;
    requestAnimationFrame(loop);
    return;
  }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
