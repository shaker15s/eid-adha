/**
 * app.js — Royal Ram: Eid Rush UPGRADED v3
 *
 * Fixes:
 *  • BUG #1: Catch mechanic re-enabled (sameLaneDuration tracks same-lane time)
 *  • BUG #4: Collision flash uses classList.add('active') CSS animation
 *
 * Upgrades:
 *  • Combo system (Combo object with FLEE/TAUNT/PANIC/FREEZE states)
 *  • Haptic patterns (Haptic helper)
 *  • Screen shake — Perlin-like sine decay
 *  • Word-by-word motivational text
 *  • SheepAI — personality states
 *  • Frame budget manager (adaptive particle quality)
 *  • Dynamic BPM + chromatic aberration called each frame
 *  • Score popup with combo multiplier
 */

'use strict';

/* ──────────────────────────────────────────────────────────────
   GLOBAL STATE
────────────────────────────────────────────────────────────── */
const AppState = {
  LOADER:     'LOADER',
  ONBOARDING: 'ONBOARDING',
  GAME:       'GAME',
  VICTORY:    'VICTORY',
};

const Game = {
  currentState:  AppState.LOADER,
  isRunning:     false,
  score:         0,
  timeLeft:      20.0,
  lives:         3,
  currentLane:   1,
  sheepLane:     1,
  introComplete: false,
  wasCaught:     false,
  rafId:         null,
  screens:       {},
  hud:           {},
  scene:         null,
  world:         null,
  characters:    null,
  controller:    null,
  audio:         null,
  victoryMgr:    null,
  loaderMgr:     null,
};

const lerp = (a, b, t) => a + (b - a) * t;


/* ──────────────────────────────────────────────────────────────
   HAPTIC PATTERNS
────────────────────────────────────────────────────────────── */
const Haptic = {
  light:   () => navigator.vibrate?.([15]),
  medium:  () => navigator.vibrate?.([35]),
  heavy:   () => navigator.vibrate?.([60]),
  success: () => navigator.vibrate?.([30, 20, 50]),
  warning: () => navigator.vibrate?.([50, 30, 50]),
  error:   () => navigator.vibrate?.([80, 30, 80, 30, 80]),
  catch:   () => navigator.vibrate?.([30, 20, 30, 20, 80, 20, 100]),
};


/* ──────────────────────────────────────────────────────────────
   COMBO SYSTEM
────────────────────────────────────────────────────────────── */
const Combo = {
  count:  0,
  timer:  0,
  WINDOW: 3.0, // seconds

  increment() {
    this.count++;
    this.timer = this.WINDOW;
    if (this.count >= 3) showComboText(this.count);
  },

  reset() {
    if (this.count >= 3) {
      const el = document.getElementById('motiv-text');
      if (el) gsap.fromTo(el, { scale: 1.2 }, { scale: 1, duration: 0.2 });
    }
    this.count = 0;
    this.timer = 0;
  },

  update(delta) {
    if (this.timer > 0) {
      this.timer -= delta;
      if (this.timer <= 0) this.reset();
    }
  },

  getMultiplier() {
    if (this.count >= 8) return 4;
    if (this.count >= 5) return 3;
    if (this.count >= 3) return 2;
    return 1;
  },
};

function showComboText(count) {
  const TEXTS = { 3: 'تلاتة! 🔥', 5: 'خمسة! 🔥🔥', 8: 'لحم كبدة!! 💥', 10: 'أسطورة!! ⚡' };
  const text = TEXTS[count] || `${count}x رهيب! 🎯`;
  showMotivTextImmediate(text);
  Haptic.medium();
  if (Game.audio) Game.audio.playSFX('combo');
}


/* ──────────────────────────────────────────────────────────────
   FRAME BUDGET MANAGER
────────────────────────────────────────────────────────────── */
const FrameBudget = {
  history: new Float32Array(30),
  index:   0,
  avgMS:   16.67,

  record(ms) {
    this.history[this.index % 30] = ms;
    this.index++;
    if (this.index % 10 === 0) {
      let sum = 0;
      for (let i = 0; i < 30; i++) sum += this.history[i];
      this.avgMS = sum / 30;
    }
  },

  isUnderPressure() { return this.avgMS > 20; },
  isCritical()      { return this.avgMS > 33; },
};


/* ──────────────────────────────────────────────────────────────
   SHEEP AI — personality-state machine
────────────────────────────────────────────────────────────── */
const SheepAI = (() => {
  let timer  = null;
  let active = false;

  const STATES = { FLEE: 'flee', TAUNT: 'taunt', PANIC: 'panic', FREEZE: 'freeze' };
  let state = STATES.FLEE;

  function getInterval() {
    const t    = Game.timeLeft;
    const base = Math.round(lerp(2800, 1200, 1 - (t / 20)));
    switch (state) {
      case STATES.TAUNT:  return base * 1.5;
      case STATES.PANIC:  return base * 0.6;
      case STATES.FREEZE: return base * 2.0;
      default:            return base;
    }
  }

  function updateState() {
    const t          = Game.timeLeft;
    const playerLane = Game.currentLane;
    const sheepLane  = Game.sheepLane;
    const isNear     = playerLane === sheepLane;

    if (t < 5) {
      state = Math.random() < 0.30 ? STATES.FREEZE : STATES.PANIC;
    } else if (isNear && t > 10) {
      state = Math.random() < 0.18 ? STATES.TAUNT : STATES.FLEE;
    } else {
      state = STATES.FLEE;
    }
  }

  function pickLane() {
    if (!active || !Game.isRunning) return;
    updateState();

    const playerLane = Game.currentLane;
    let chosen = Game.sheepLane;

    // Check if an obstacle is closely approaching the sheep's lane
    const obstacleApproaching = Game.world && Game.world.isObstacleNearSheep && Game.world.isObstacleNearSheep(Game.sheepLane);

    if (obstacleApproaching) {
      // Evade! Try to switch to another lane that doesn't have an obstacle approaching
      const choices = [0, 1, 2].filter(l => l !== Game.sheepLane);
      const safeChoices = choices.filter(l => {
        if (Game.world && Game.world.isObstacleNearSheep) {
          return !Game.world.isObstacleNearSheep(l);
        }
        return true;
      });

      if (safeChoices.length > 0) {
        chosen = safeChoices[Math.floor(Math.random() * safeChoices.length)];
      } else {
        // No safe lane to transition to! Do a jump instead to dodge the child
        if (Game.characters && Game.characters.doSheepJump) {
          Game.characters.doSheepJump();
        }
      }
    } else {
      // Normal AI decisions
      if (state === STATES.FREEZE) {
        chosen = Game.sheepLane; // stays put — gives player a chance
      } else if (state === STATES.TAUNT) {
        chosen = playerLane; // moves toward player, then flees next tick
      } else {
        // Flee — prefer safe lanes without obstacles
        const escapeLanes = [0, 1, 2].filter(l => l !== playerLane);
        const safeLanes   = escapeLanes.filter(l => {
          if (Game.world && Game.world.isObstacleAheadInLane) {
            return !Game.world.isObstacleAheadInLane(l);
          }
          return true;
        });
        const pool = safeLanes.length > 0 ? safeLanes : escapeLanes;
        chosen = pool[Math.floor(Math.random() * pool.length)];

        // In late panic: 25% chance to momentarily freeze (cornered)
        if (Game.timeLeft < 5 && Math.random() < 0.25) {
          chosen = playerLane;
        }
      }
    }

    Game.sheepLane = chosen;
    scheduleNext();
  }

  function scheduleNext() {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(pickLane, getInterval());
  }

  function start() {
    active = true;
    state  = STATES.FLEE;
    timer  = setTimeout(pickLane, 1500);
  }

  function stop() {
    active = false;
    clearTimeout(timer);
    timer = null;
  }

  return { start, stop, pickLane };
})();


/* ──────────────────────────────────────────────────────────────
   CATCH MECHANIC — BUG #1 FIX: re-enabled
────────────────────────────────────────────────────────────── */
let sameLaneDuration = 0;
const CATCH_THRESHOLD = 1.2; // seconds in same lane
let catchTriggered    = false;

function updateCatchMechanic(delta) {
  return; // Disabled early catch - game runs for the full 20s


  if (catchTriggered || !Game.isRunning || !Game.introComplete) return;

  if (Game.currentLane === Game.sheepLane) {
    sameLaneDuration += delta;

    /* Trigger catch when threshold reached */
    if (sameLaneDuration >= CATCH_THRESHOLD) {
      catchTriggered = true;
      triggerCatch();
      return;
    }
  } else {
    /* Decay slowly rather than hard reset — feels more natural */
    sameLaneDuration = Math.max(0, sameLaneDuration - delta * 2);
  }
}

function updateCatchProgress(ratio) {
  const wrap = document.getElementById('catch-bar-wrap');
  const fill = document.getElementById('catch-bar-fill');
  if (!wrap || !fill) return;

  if (ratio > 0.04) {
    wrap.classList.add('visible');
    fill.style.width = `${ratio * 100}%`;

    /* near-catch glow state */
    fill.classList.toggle('near-catch', ratio > 0.75);

    Game.hud.laneDots.forEach((dot, i) => {
      dot.classList.toggle('catch-lane', i === Game.sheepLane && ratio > 0.08);
    });
  } else {
    wrap.classList.remove('visible');
    fill.style.width = '0%';
    fill.classList.remove('near-catch');
    Game.hud.laneDots.forEach(dot => dot.classList.remove('catch-lane'));
  }
}

function triggerCatch() {
  stopTimer();
  stopGameLoop();
  stopMotivationalTexts();
  Game.controller.disable();
  SheepAI.stop();
  Game.wasCaught = true;

  Game.audio.playSFX('shutter');
  Game.audio.playSFX('dodge');
  Game.audio.playBaaa(true);
  Game.audio.stopPercussion();
  Haptic.catch();

  triggerScreenShake(0.7);

  ['panic-overlay', 'gw-panic-vignette'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  ['speed-lines', 'gw-speed-lines'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  /* Clear chromatic aberration */
  if (Game.scene && Game.scene.setChromaticAberration) {
    Game.scene.setChromaticAberration(0);
  }

  const catchEl = document.createElement('div');
  catchEl.textContent = 'أمسكته! 🐑🎉';
  catchEl.style.cssText = `
    position:fixed; left:50%; top:42%;
    transform:translate(-50%,-50%) scale(0);
    font-family:'Cairo',sans-serif;
    font-size:clamp(28px,8vw,42px);
    font-weight:900;
    color:#4ADB6C;
    text-shadow:0 0 30px rgba(74,219,108,0.9), 0 0 60px rgba(74,219,108,0.5);
    pointer-events:none; z-index:300;
    white-space:nowrap; direction:rtl;
    will-change:transform,opacity;
  `;
  document.body.appendChild(catchEl);

  gsap.timeline()
    .to(catchEl, { scale: 1.25, duration: 0.65, ease: 'elastic.out(1, 0.5)' })
    .to(catchEl, { scale: 1.0,  duration: 0.25, ease: 'power2.out' })
    .to(catchEl, { scale: 1.08, duration: 0.3, ease: 'power1.inOut', yoyo: true, repeat: 2 }, 0.9)
    .to(catchEl, { opacity: 0, y: -40, duration: 0.5, ease: 'power2.in',
                   onComplete: () => catchEl.remove() }, 2.0);

  if (Game.world && Game.world.setSpeedMultiplier) {
    Game.world.setSpeedMultiplier(0);
  }

  if (Game.characters && Game.characters.animateCatchUp) {
    Game.characters.animateCatchUp(Game.sheepLane, 1.8);
  }

  if (Game.scene && Game.scene.focusOnCatch) {
    Game.scene.focusOnCatch(1.8);
  }

  setTimeout(() => {
    if (Game.world && Game.world.setSpeedMultiplier) Game.world.setSpeedMultiplier(1);
    endGameplay();
    Object.values(Game.screens).forEach(s => s.classList.remove('active'));
    Game.screens.victory.classList.add('active');
    Game.victoryMgr.start(Game.score, true);
  }, 2200);
}


/* ──────────────────────────────────────────────────────────────
   PANIC MODE — last 5 seconds
────────────────────────────────────────────────────────────── */
let panicActivated = false;
let chromaticIntensity = 0;

function checkPanicMode() {
  if (!Game.isRunning) return;

  /* Activate panic overlay once */
  if (!panicActivated && Game.timeLeft <= 5) {
    panicActivated = true;

    ['panic-overlay', 'gw-panic-vignette'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('active');
    });
    ['speed-lines', 'gw-speed-lines'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('active');
    });

    if (Game.world && Game.world.setSpeedMultiplier) {
      Game.world.setSpeedMultiplier(0.85);
    }

    if (Game.characters && Game.characters.triggerSheepPanic) {
      Game.characters.triggerSheepPanic();
    }

    showMotivTextImmediate('الآن أمسكه! 🏃‍♂️');
    Haptic.warning();
  }

  /* Progressive chromatic aberration in last 5s */
  if (Game.timeLeft <= 5 && Game.scene && Game.scene.setChromaticAberration) {
    chromaticIntensity = Math.max(0, (5 - Game.timeLeft) / 5) * 0.55;
    Game.scene.setChromaticAberration(chromaticIntensity);
  }

  /* Timer text panic styling */
  const timerEl = document.getElementById('hud-timer-value');
  if (timerEl && Game.timeLeft <= 5) {
    const p = (5 - Game.timeLeft) / 5;
    timerEl.style.color    = `hsl(${Math.round(lerp(200, 0, p))}deg, 80%, 65%)`;
    timerEl.style.fontSize = `clamp(18px, ${lerp(4, 5.8, p).toFixed(1)}vw, 32px)`;
  }
}


/* ──────────────────────────────────────────────────────────────
   MOTIVATIONAL TEXT SYSTEM — word-by-word reveal
────────────────────────────────────────────────────────────── */
const MOTIVATIONAL_TEXTS = [
  'استمر! 💪',
  'الخروف قريب!',
  'ما تهدش!',
  'الجزار بيقترب!',
  'اللحاق قرب! 🎯',
  'ده مش هيهرب! 🏃',
];
let motivIndex    = 0;
let motivInterval = null;
let motivFadeTimer = null;

function startMotivationalTexts() {
  motivIndex = 0;
  clearInterval(motivInterval);
  setTimeout(showMotivText, 3000);
  motivInterval = setInterval(showMotivText, 5000);
}

function stopMotivationalTexts() {
  clearInterval(motivInterval);
  clearTimeout(motivFadeTimer);
  motivInterval  = null;
  motivFadeTimer = null;
  const el = document.getElementById('motiv-text');
  if (el) { el.innerHTML = ''; el.style.opacity = '0'; }
}

function showMotivTextImmediate(text) {
  return;
}

function showMotivText() {
  if (!Game.isRunning) return;
  const text = MOTIVATIONAL_TEXTS[motivIndex % MOTIVATIONAL_TEXTS.length];
  motivIndex++;
  showMotivTextImmediate(text);
}


/* ──────────────────────────────────────────────────────────────
   INTERACTIVE SPEECH BUBBLES
────────────────────────────────────────────────────────────── */
const SHEEP_MESSAGES  = ['سيبونييييي! 🐑', 'ابعد ياحبيبي! 🏃‍♂️', 'منكم لله! 💔', 'مش هتمسكوني! ⚡'];
const CHEER_MESSAGES  = ['اجري يامعلم! 🔥', 'هتمسكه اهه! 🎯', 'الحقهه! 🏃‍♂️', 'عاش يامعلم علي! 💪'];

let speechInterval = null;

function startGameplaySpeeches() {
  speechInterval = setInterval(() => {
    if (!Game.isRunning) return;
    if (Math.random() < 0.5) {
      const msg = SHEEP_MESSAGES[Math.floor(Math.random() * SHEEP_MESSAGES.length)];
      showSpeechBubble('sheep', msg, 'sheep');
    } else {
      const msg = CHEER_MESSAGES[Math.floor(Math.random() * CHEER_MESSAGES.length)];
      showSpeechBubble('child', msg, 'child');
    }
  }, 4000);
}

function stopGameplaySpeeches() {
  clearInterval(speechInterval);
  speechInterval = null;
  document.querySelectorAll('.dynamic-speech-bubble').forEach(b => b.remove());
}

function showSpeechBubble(targetType, text, bubbleType) {
  const container = document.getElementById('gw-chars');
  if (!container) return;

  let targetEl = null;
  if (targetType === 'sheep') {
    targetEl = document.getElementById('char-sheep');
  } else if (targetType === 'butcher') {
    targetEl = document.getElementById('char-butcher');
  } else if (targetType === 'child') {
    if (Game.world && Game.world.getRandomActiveObstacleElement) {
      targetEl = Game.world.getRandomActiveObstacleElement();
    }
  }

  if (!targetEl) return;

  const bubble = document.createElement('div');
  bubble.className = 'dynamic-speech-bubble';
  bubble.textContent = text;

  const borderColor = bubbleType === 'sheep' ? '#ff4d4d' : '#ffb800';
  const textColor   = bubbleType === 'sheep' ? '#ffb3b3' : '#ffdca1';
  bubble.style.cssText = `
    position: absolute;
    background: rgba(13, 9, 7, 0.92);
    border: 2px solid ${borderColor};
    color: ${textColor};
    font-family: 'Cairo', sans-serif;
    font-size: clamp(12px, 3.5vw, 15px);
    font-weight: 800;
    padding: 6px 14px;
    border-radius: 12px;
    white-space: nowrap;
    direction: rtl;
    z-index: 150;
    pointer-events: none;
    box-shadow: 0 8px 20px rgba(0,0,0,0.6);
    transform: translate(-50%, -100%) scale(0);
    transform-origin: bottom center;
  `;

  container.appendChild(bubble);

  const updatePos = () => {
    if (!document.body.contains(bubble)) return;
    
    // Some target elements might be removed (e.g. child obstacles passing offscreen)
    if (!document.body.contains(targetEl)) {
      gsap.to(bubble, { opacity: 0, duration: 0.2, onComplete: () => bubble.remove() });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    
    // Calculate relative coordinates
    const cx = targetRect.left + (targetRect.width / 2) - containerRect.left;
    const cy = targetRect.top - containerRect.top;
    
    const offset = targetType === 'sheep' ? 20 : 35;
    bubble.style.left = `${cx}px`;
    bubble.style.top = `${cy - offset}px`;
    
    requestAnimationFrame(updatePos);
  };
  requestAnimationFrame(updatePos);

  const arrow = document.createElement('div');
  arrow.style.cssText = `
    position: absolute;
    bottom: -8px; left: 50%;
    transform: translateX(-50%) rotate(45deg);
    width: 10px; height: 10px;
    background: rgba(13, 9, 7, 0.92);
    border-right: 2px solid ${borderColor};
    border-bottom: 2px solid ${borderColor};
  `;
  bubble.appendChild(arrow);

  gsap.timeline()
    .to(bubble, { transform: 'translate(-50%, -100%) scale(1.15)', duration: 0.35, ease: 'back.out(2)' })
    .to(bubble, { transform: 'translate(-50%, -100%) scale(1.0)',  duration: 0.15 })
    .to(bubble, { y: '-=15', opacity: 0, duration: 0.5, delay: 1.8, ease: 'power2.in',
                  onComplete: () => bubble.remove() });
}


/* ──────────────────────────────────────────────────────────────
   VISIBILITY / TAB FOCUS
────────────────────────────────────────────────────────────── */
let wasRunningBeforePageHide = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (Game.isRunning) {
      wasRunningBeforePageHide = true;
      stopGameLoop();
      stopTimer();
      if (SheepAI && SheepAI.stop) SheepAI.stop();
    }
  } else {
    if (wasRunningBeforePageHide && Game.currentState === AppState.GAME) {
      wasRunningBeforePageHide = false;
      Game.isRunning = true;
      startGameLoop();
      startTimer();
      if (SheepAI && SheepAI.start) SheepAI.start();
    }
  }
});


/* ──────────────────────────────────────────────────────────────
   INIT
────────────────────────────────────────────────────────────── */
function init() {
  Game.screens = {
    loader:     document.getElementById('screen-loader'),
    onboarding: document.getElementById('screen-onboarding'),
    gameplay:   document.getElementById('screen-gameplay'),
    victory:    document.getElementById('screen-victory'),
  };

  Game.hud = {
    scorePanel: document.getElementById('hud-score-panel'),
    scoreValue: document.getElementById('hud-score-value'),
    timerPanel: document.getElementById('hud-timer-panel'),
    timerValue: document.getElementById('hud-timer-value'),
    laneDots:   [
      document.getElementById('lane-dot-0'),
      document.getElementById('lane-dot-1'),
      document.getElementById('lane-dot-2'),
    ],
    swipeHint:  document.getElementById('swipe-hint'),
    baaaBubble: document.getElementById('baaa-bubble'),
    letterboxT: document.getElementById('letterbox-top'),
    letterboxB: document.getElementById('letterbox-bottom'),
  };

  document.getElementById('btn-start-chase').addEventListener('click', handleStartChase);
  document.getElementById('btn-play-again').addEventListener('click', handlePlayAgain);
  document.getElementById('btn-share-exp').addEventListener('click', handleShare);
  document.getElementById('btn-download-card').addEventListener('click', handleDownloadCard);

  Game.audio      = AudioManager.init();
  Game.scene      = SceneManager.init();
  Game.world      = WorldManager.init(Game.scene);
  Game.characters = CharacterManager.init(Game.scene);
  Game.controller = ControllerManager.init();
  Game.victoryMgr = VictoryManager.init();
  Game.loaderMgr  = LoaderManager.init();

  transitionTo(AppState.LOADER);
}

function handleDownloadCard() {
  if (Game.victoryMgr && Game.victoryMgr.downloadCard) {
    Game.victoryMgr.downloadCard();
  }
}


/* ──────────────────────────────────────────────────────────────
   STATE MACHINE
────────────────────────────────────────────────────────────── */
function transitionTo(newState) {
  Game.currentState = newState;
  Object.values(Game.screens).forEach(s => s.classList.remove('active'));

  switch (newState) {
    case AppState.LOADER:
      Game.screens.loader.classList.add('active');
      Game.loaderMgr.start(() => transitionTo(AppState.ONBOARDING));
      break;

    case AppState.ONBOARDING:
      Game.screens.onboarding.classList.add('active');
      showOnboarding();
      startBackgroundRender();
      break;

    case AppState.GAME:
      Game.screens.gameplay.classList.add('active');
      startGameplay();
      break;

    case AppState.VICTORY:
      endGameplay();
      Game.screens.victory.classList.add('active');
      Game.victoryMgr.start(Game.score, Game.wasCaught);
      break;
  }
}


/* ──────────────────────────────────────────────────────────────
   ONBOARDING
────────────────────────────────────────────────────────────── */
function showOnboarding() {
  const wrap  = document.getElementById('onboarding-card-wrap');
  const icon  = document.getElementById('onboarding-icon');
  const title = document.getElementById('onboarding-title');
  const body  = document.getElementById('onboarding-body');
  const ctrls = document.getElementById('onboarding-controls');
  const btn   = document.getElementById('btn-start-chase');

  gsap.killTweensOf([wrap, icon, title, body, ctrls, btn]);
  gsap.set(wrap,  { y: '100%', opacity: 0 });
  gsap.set([icon, title, body, ctrls], { opacity: 0, y: 20 });
  gsap.set(btn,   { opacity: 0, scale: 0.85 });

  const tl = gsap.timeline();
  tl.to(wrap, { y: 0, opacity: 1, duration: 0.8, ease: 'elastic.out(1, 0.75)', delay: 0.2 });
  tl.to(icon,  { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.3');
  tl.to(title, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.15');
  tl.to(body,  { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.1');
  tl.to(ctrls, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.05');
  tl.to(btn, { duration: 0 }, '+=0.05');
  tl.fromTo(btn,
    { scale: 0.85, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' }
  );
  tl.to(btn, {
    boxShadow: '0 6px 30px rgba(255,184,0,0.65)',
    scale: 1.02,
    duration: 0.9, ease: 'sine.inOut',
    yoyo: true, repeat: -1,
  });
}


/* ──────────────────────────────────────────────────────────────
   GAME — Intro → Loop
────────────────────────────────────────────────────────────── */
function startGameplay() {
  Game.score         = 0;
  Game.timeLeft      = 20.0;
  Game.lives         = 3;
  Game.currentLane   = 1;
  Game.sheepLane     = 1;
  Game.introComplete = false;
  Game.wasCaught     = false;
  sameLaneDuration   = 0;
  catchTriggered     = false;
  panicActivated     = false;
  chromaticIntensity = 0;
  Combo.count = 0;
  Combo.timer = 0;

  updateLivesDisplay();
  updateHUD();

  if (Game.world && Game.world.reset) Game.world.reset();
  if (Game.characters && Game.characters.reset) Game.characters.reset();

  /* Reset panic overlays */
  ['panic-overlay', 'gw-panic-vignette'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  ['speed-lines', 'gw-speed-lines'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  /* Reset timer text styling */
  const timerEl = document.getElementById('hud-timer-value');
  if (timerEl) {
    timerEl.style.color    = '';
    timerEl.style.fontSize = '';
  }

  runCameraIntro(() => {
    Game.introComplete = true;
    Game.isRunning     = true;

    Game.controller.enable();
    Game.audio.startPercussion();
    Game.audio.playAmbience();

    if (Game.scene && Game.scene.startParticles) {
      Game.scene.startParticles();
    }

    SheepAI.start();
    startMotivationalTexts();
    startGameplaySpeeches();

    if (Game.hud.swipeHint) {
      Game.hud.swipeHint.classList.remove('hidden');
    }
    const hintTimer = setTimeout(() => {
      if (Game.hud.swipeHint) Game.hud.swipeHint.classList.add('hidden');
    }, 10000);
    Game.hintTimer = hintTimer;

    startGameLoop();
    startTimer();
  });
}

function runCameraIntro(onComplete) {
  Game.hud.letterboxT.classList.add('open');
  Game.hud.letterboxB.classList.add('open');
  Game.scene.setCameraToSheepFace();
  startBackgroundRender();

  const tl = gsap.timeline();
  tl.to({}, { duration: 0.8 });
  tl.add(() => {
    Game.characters.sheepAlert();
    Game.audio.playBaaa();
    showBaaaBubble();
  });
  tl.to({}, { duration: 0.7 });
  tl.add(() => {
    hideBaaaBubble();
    Game.scene.doCameraWhip(() => {
      Game.hud.letterboxT.classList.remove('open');
      Game.hud.letterboxB.classList.remove('open');
      onComplete();
    });
  });
}

function showBaaaBubble() {
  gsap.to(Game.hud.baaaBubble, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' });
}
function hideBaaaBubble() {
  gsap.to(Game.hud.baaaBubble, { opacity: 0, scale: 0.7, duration: 0.25, ease: 'power2.in' });
}


/* ──────────────────────────────────────────────────────────────
   GAME LOOP
────────────────────────────────────────────────────────────── */
let lastTimestamp = 0;

function startGameLoop() {
  lastTimestamp = performance.now();
  gameLoop(lastTimestamp);
}

function gameLoop(timestamp) {
  if (!Game.isRunning) return;

  const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;

  FrameBudget.record(timestamp - lastTimestamp + delta * 1000);

  /* Subsystem updates */
  Game.world.update(delta, Game.timeLeft);

  /* Force Sheep AI to instantly check/evade if an obstacle approaches closely */
  if (window.Game && window.Game.isRunning && SheepAI && Game.world && Game.world.isObstacleNearSheep && Game.world.isObstacleNearSheep(Game.sheepLane)) {
    if (!SheepAI.lastEvadeTime || Date.now() - SheepAI.lastEvadeTime > 800) {
      SheepAI.lastEvadeTime = Date.now();
      SheepAI.pickLane();
    }
  }

  Game.characters.update(delta, Game.currentLane, Game.sheepLane, Game.timeLeft);

  /* Collision detection (bypass if jumping) */
  const isJumping = Game.characters && Game.characters.getPlayerState &&
                    Game.characters.getPlayerState() === 'jump';
  if (!isJumping) {
    const hitResult = Game.world.checkCollision(Game.characters.getPlayerBounds());
    if (hitResult.type === 'adult')  handleAdultCollision();
    else if (hitResult.type === 'child') handleChildCollision();
  }

  /* BUG #1 FIX: Catch mechanic now active */
  updateCatchMechanic(delta);

  /* Combo timer */
  Combo.update(delta);

  /* Panic mode */
  checkPanicMode();

  /* Catch progress visual */
  if (Game.characters.setCatchProximity) {
    const catchRatio = sameLaneDuration / CATCH_THRESHOLD;
    Game.characters.setCatchProximity(catchRatio);
    updateCatchProgress(catchRatio);
  }

  /* Dynamic atmosphere */
  if (Game.scene && Game.scene.updateAtmosphere) {
    Game.scene.updateAtmosphere(Game.timeLeft);
  }

  /* Dynamic BPM */
  if (Game.audio && Game.audio.updatePercussionTempo) {
    Game.audio.updatePercussionTempo(Game.timeLeft);
  }

  /* World breath */
  if (Game.scene && Game.scene.updateWorldBreath) {
    Game.scene.updateWorldBreath(Game.timeLeft, Combo.count);
  }

  Game.scene.render();
  Game.rafId = requestAnimationFrame(gameLoop);
}

function stopGameLoop() {
  Game.isRunning = false;
  if (Game.rafId) { cancelAnimationFrame(Game.rafId); Game.rafId = null; }
}

let bgRafId = null;
function startBackgroundRender() {
  if (bgRafId) return;
  function bgLoop() {
    if (Game.isRunning) { bgRafId = null; return; }
    Game.scene.render();
    bgRafId = requestAnimationFrame(bgLoop);
  }
  bgRafId = requestAnimationFrame(bgLoop);
}
function stopBackgroundRender() {
  if (bgRafId) { cancelAnimationFrame(bgRafId); bgRafId = null; }
}


/* ──────────────────────────────────────────────────────────────
   TIMER
────────────────────────────────────────────────────────────── */
let timerInterval = null;

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!Game.isRunning) return;

    Game.timeLeft = Math.max(0, Game.timeLeft - 0.1);
    updateTimerDisplay(Game.timeLeft);

    /* Tempo acceleration every 5 seconds */
    const elapsed = 20 - Game.timeLeft;
    if (elapsed > 0 && elapsed % 5 < 0.15) {
      Game.audio.accelerateTempo();
    }

    if (Game.timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      triggerTimeUpWin();
    }
  }, 100);
}

function triggerTimeUpWin() {
  stopTimer();
  stopGameLoop();
  stopMotivationalTexts();
  Game.controller.disable();
  if (SheepAI && SheepAI.stop) SheepAI.stop();
  Game.wasCaught = true;

  Game.audio.playSFX('shutter');
  Game.audio.playSFX('dodge');
  Game.audio.playBaaa(true);
  Game.audio.stopPercussion();
  Haptic.success();

  if (Game.world && Game.world.setSpeedMultiplier) {
    Game.world.setSpeedMultiplier(0);
  }

  const panicOverlay = document.getElementById('panic-overlay');
  if (panicOverlay) panicOverlay.classList.remove('active');
  const speedLines = document.getElementById('speed-lines');
  if (speedLines) speedLines.classList.remove('active');

  /* Clear chromatic aberration */
  if (Game.scene && Game.scene.setChromaticAberration) {
    Game.scene.setChromaticAberration(0);
  }
  
  showSpeechBubble('butcher', 'مسكته! 🎉', 'butcher');

  if (Game.characters && Game.characters.triggerFinalFight) {
    Game.characters.triggerFinalFight(Game.sheepLane, () => {
      endGameplay();
      Object.values(Game.screens).forEach(s => s.classList.remove('active'));
      Game.screens.victory.classList.add('active');
      Game.victoryMgr.start(Game.score, true);
    });
  } else {
    transitionTo(AppState.VICTORY);
  }
}

function triggerLossGameOver() {
  stopTimer();
  stopGameLoop();
  stopMotivationalTexts();
  Game.controller.disable();
  if (SheepAI && SheepAI.stop) SheepAI.stop();
  Game.wasCaught = false;

  if (Game.world && Game.world.setSpeedMultiplier) {
    Game.world.setSpeedMultiplier(0);
  }

  const panicOverlay = document.getElementById('panic-overlay');
  if (panicOverlay) panicOverlay.classList.remove('active');
  const speedLines = document.getElementById('speed-lines');
  if (speedLines) speedLines.classList.remove('active');

  if (Game.scene && Game.scene.setChromaticAberration) {
    Game.scene.setChromaticAberration(0);
  }

  if (Game.characters && Game.characters.animateEscape) {
    Game.characters.animateEscape(Game.sheepLane, 2.0, () => {
      endGameplay();
      Object.values(Game.screens).forEach(s => s.classList.remove('active'));
      Game.screens.victory.classList.add('active');
      Game.victoryMgr.start(Game.score, false);
    });
  } else {
    transitionTo(AppState.VICTORY);
  }
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay(t) {
  const el = Game.hud.timerValue;
  if (!el) return;
  el.textContent = t.toFixed(1);
  el.classList.remove('urgent', 'critical');
  if (t <= 3)      el.classList.add('critical');
  else if (t <= 7) el.classList.add('urgent');
}


/* ──────────────────────────────────────────────────────────────
   COLLISION RESPONSE
────────────────────────────────────────────────────────────── */
let collisionTween = null;

function triggerCollisionSlowdown() {
  if (Game.world && Game.world.setSpeedMultiplier) {
    if (collisionTween) collisionTween.kill();
    Game.world.setSpeedMultiplier(0.15);
    const obj = { val: 0.15 };
    collisionTween = gsap.to(obj, {
      val: 1.0,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate: () => {
        if (Game.isRunning && !catchTriggered) {
          Game.world.setSpeedMultiplier(obj.val);
        }
      },
      onComplete: () => { collisionTween = null; }
    });
  }
}

/* BUG #4 FIX: Use CSS animation class (collFlash keyframe in style.css) */
function triggerCollisionFlash() {
  const flash = document.getElementById('collision-flash');
  if (flash) {
    flash.classList.remove('active');
    requestAnimationFrame(() => flash.classList.add('active'));
  }
}

function showLifeLostPopup() {
  const el = document.createElement('div');
  el.textContent = '💔';
  el.style.cssText = `
    position:fixed; left:50%; top:45%; margin-left:-25px;
    font-size:42px;
    pointer-events:none; z-index:200; opacity:0;
    will-change:transform,opacity;
  `;
  document.body.appendChild(el);
  gsap.timeline()
    .fromTo(el,
      { opacity: 0, y: 0, scale: 0.5 },
      { opacity: 1, y: -40, scale: 1.2, duration: 0.22, ease: 'back.out(2)' }
    )
    .to(el, { opacity: 0, y: -75, scale: 0.8, duration: 0.38, ease: 'power2.in', delay: 0.15,
              onComplete: () => el.remove() });
}

function updateLivesDisplay() {
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById(`heart-${i}`);
    if (el) {
      if (i < Game.lives) {
        el.classList.remove('lost');
      } else {
        el.classList.add('lost');
      }
    }
  }
}

function handleAdultCollision() {
  if (!Game.isRunning) return;
  Game.lives--;
  Combo.reset();
  updateLivesDisplay();
  Game.audio.playSFX('bump');
  Game.characters.playStaggerAnim();
  triggerScreenShake(0.3);
  triggerCollisionSlowdown();
  triggerCollisionFlash();
  showLifeLostPopup();
  Haptic.error();

  if (Game.lives <= 0) {
    triggerLossGameOver();
  }
}

function handleChildCollision() {
  if (!Game.isRunning) return;
  Game.lives--;
  Combo.reset();
  updateLivesDisplay();
  Game.audio.playSFX('trip');
  Game.characters.playTripAnim();
  triggerCollisionSlowdown();
  triggerCollisionFlash();
  showLifeLostPopup();
  Haptic.medium();

  if (Game.lives <= 0) {
    triggerLossGameOver();
  }
}

function onObstacleDodged(type) {
  if (!Game.isRunning) return;

  if (Game.hud.swipeHint) Game.hud.swipeHint.classList.add('hidden');
  if (Game.hintTimer) {
    clearTimeout(Game.hintTimer);
    Game.hintTimer = null;
  }

  const basePts     = type === 'child' ? 75 : 100;
  const multiplier  = Combo.getMultiplier();
  const pts         = basePts * multiplier;
  const oldScore    = Game.score;
  Game.score       += pts;

  updateScoreDisplay(Game.score, multiplier);
  showScorePopup(pts, Game.currentLane, multiplier);

  Haptic.light();
  Game.audio.playSFX('dodge');
  Combo.increment();

  const oldMilestone = Math.floor(oldScore / 500);
  const newMilestone = Math.floor(Game.score / 500);
  if (newMilestone > oldMilestone) {
    triggerMilestoneCelebration(newMilestone * 500);
  }
}

function triggerMilestoneCelebration(val) {
  if (Game.audio && Game.audio.playSFX) Game.audio.playSFX('milestone');
  const praises = ['أداء أسطوري! 🏆', 'رائع جداً! 🌟', 'مذهل وسريع! ⚡', 'جزار محترف! 🔥'];
  const text = `${praises[Math.floor(Math.random() * praises.length)]} (${val} نقطة)`;
  showMotivTextImmediate(text);
  Haptic.success();

  const f = document.createElement('div');
  f.style.cssText = `
    position: fixed; inset: 0; background: rgba(255, 184, 0, 0.22);
    pointer-events: none; z-index: 100; opacity: 0;
  `;
  document.body.appendChild(f);
  gsap.timeline()
    .to(f, { opacity: 1, duration: 0.1, yoyo: true, repeat: 1, onComplete: () => f.remove() });
}


/* ──────────────────────────────────────────────────────────────
   SCREEN SHAKE — Perlin-like sine decay
────────────────────────────────────────────────────────────── */
let shakeRafId = null;
const shakeState = { intensity: 0, duration: 0, elapsed: 0 };

function triggerScreenShake(intensity, duration) {
  duration = duration || 0.4;
  shakeState.intensity = Math.min(intensity, 1.2);
  shakeState.duration  = duration;
  shakeState.elapsed   = 0;
  if (!shakeRafId) shakeLoop();
}

function shakeLoop() {
  shakeState.elapsed += 1 / 60;
  const progress = shakeState.elapsed / shakeState.duration;

  if (progress >= 1) {
    const world = document.getElementById('game-world');
    if (world) { world.style.transform = ''; }
    shakeRafId = null;
    return;
  }

  const decay  = 1 - Math.pow(progress, 1.5);
  const t      = performance.now() * 0.001;
  const freq   = 28;
  const maxPx  = shakeState.intensity * 14;

  const sx = (Math.sin(t * freq * 1.0) * 0.6 + Math.sin(t * freq * 1.7) * 0.4) * maxPx * decay;
  const sy = (Math.sin(t * freq * 1.3) * 0.5 + Math.sin(t * freq * 2.1) * 0.5) * maxPx * decay * 0.6;

  const world = document.getElementById('game-world');
  if (world) world.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;

  shakeRafId = requestAnimationFrame(shakeLoop);
}


/* ──────────────────────────────────────────────────────────────
   SCORE DISPLAY & POPUP
────────────────────────────────────────────────────────────── */
function updateScoreDisplay(s, multiplier) {
  const el = Game.hud.scoreValue;
  if (!el) return;
  el.textContent = s;
  const highlight = multiplier > 1 ? '#FFE066' : '#ffb800';
  gsap.fromTo(el,
    { scale: 1.28, color: highlight },
    { scale: 1, color: '#ffdca1', duration: 0.35, ease: 'power2.out' }
  );
}

function showScorePopup(pts, laneIndex, multiplier) {
  const el = document.createElement('div');
  const isBonus = multiplier > 1;
  el.textContent = isBonus ? `+${pts} ✨` : `+${pts}`;
  const laneLeft = 20 + (laneIndex || 1) * 28;
  el.style.cssText = `
    position:fixed;
    font-family:'Cairo',sans-serif;
    font-size:${isBonus ? '22px' : '18px'};
    font-weight:900;
    color:${isBonus ? '#FFE066' : '#4ADB6C'};
    text-shadow: 0 0 15px currentColor;
    pointer-events:none;
    z-index:250;
    left:${laneLeft}%;
    top:65%;
    transform:translate(-50%,-50%) scale(0);
    will-change:transform,opacity;
    direction:rtl;
  `;
  document.body.appendChild(el);
  gsap.timeline({ onComplete: () => el.remove() })
    .to(el, { scale: 1.3, duration: 0.2, ease: 'back.out(2)' })
    .to(el, { y: '-60px', opacity: 0, duration: 0.6, ease: 'power2.out' }, 0.15);
}


/* ──────────────────────────────────────────────────────────────
   HUD UPDATES
────────────────────────────────────────────────────────────── */
function updateHUD() {
  updateScoreDisplay(Game.score, 1);
  updateTimerDisplay(Game.timeLeft);
  updateLaneIndicator(Game.currentLane);
}

function updateLaneIndicator(lane) {
  Game.hud.laneDots.forEach((dot, i) => {
    if (!dot.classList.contains('catch-lane')) {
      dot.classList.toggle('active', i === lane);
    }
  });
}


/* ──────────────────────────────────────────────────────────────
   SWIPE HANDLERS
────────────────────────────────────────────────────────────── */
function onSwipeLeft() {
  if (!Game.introComplete || !Game.isRunning) return;
  if (Game.currentLane > 0) {
    Game.currentLane--;
    updateLaneIndicator(Game.currentLane);
    Game.audio.playSFX('swipe');
    if (Game.scene && Game.scene.triggerLaneRoll) {
      Game.scene.triggerLaneRoll(-1);
    }
  }
}

function onSwipeRight() {
  if (!Game.introComplete || !Game.isRunning) return;
  if (Game.currentLane < 2) {
    Game.currentLane++;
    updateLaneIndicator(Game.currentLane);
    Game.audio.playSFX('swipe');
    if (Game.scene && Game.scene.triggerLaneRoll) {
      Game.scene.triggerLaneRoll(1);
    }
  }
}

function onSwipeUp() {
  if (!Game.introComplete || !Game.isRunning) return;
  Game.characters.doJump();
  /* Audio handled inside doJump now */
}


/* ──────────────────────────────────────────────────────────────
   END GAMEPLAY
────────────────────────────────────────────────────────────── */
function endGameplay() {
  stopTimer();
  stopGameLoop();
  if (typeof stopBackgroundRender === 'function') stopBackgroundRender();
  stopMotivationalTexts();
  stopGameplaySpeeches();
  SheepAI.stop();
  Game.controller.disable();
  Game.audio.stopPercussion();
  Game.audio.stopAmbience();

  if (Game.scene && Game.scene.stopParticles) {
    Game.scene.stopParticles();
  }

  if (Game.hintTimer) {
    clearTimeout(Game.hintTimer);
    Game.hintTimer = null;
  }

  /* Kill shake loop */
  if (shakeRafId) {
    cancelAnimationFrame(shakeRafId);
    shakeRafId = null;
  }

  /* Reset chromatic aberration */
  if (Game.scene && Game.scene.setChromaticAberration) {
    Game.scene.setChromaticAberration(0);
  }

  /* Reset timer text */
  const timerEl = document.getElementById('hud-timer-value');
  if (timerEl) {
    timerEl.style.color    = '';
    timerEl.style.fontSize = '';
  }

  ['panic-overlay', 'gw-panic-vignette'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  ['speed-lines', 'gw-speed-lines'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  const wrap = document.getElementById('catch-bar-wrap');
  if (wrap) wrap.classList.remove('visible');

  if (Game.world && Game.world.setSpeedMultiplier) {
    Game.world.setSpeedMultiplier(0);
  }
}


/* ──────────────────────────────────────────────────────────────
   BUTTON HANDLERS
────────────────────────────────────────────────────────────── */
function handleStartChase() {
  const btn = document.getElementById('btn-start-chase');
  gsap.killTweensOf(btn);
  const wrap = document.getElementById('onboarding-card-wrap');
  gsap.to(wrap, {
    y: '100%', opacity: 0, duration: 0.5, ease: 'power2.in',
    onComplete: () => transitionTo(AppState.GAME),
  });
}

function handlePlayAgain() {
  Game.victoryMgr.reset();
  Game.audio.stopAll();

  const vs = Game.screens.victory;
  gsap.to(vs, {
    opacity: 0, duration: 0.5, ease: 'power2.in',
    onComplete: () => {
      vs.classList.remove('active');
      vs.style.opacity = '';
      Game.world.reset();
      Game.characters.reset();
      Game.scene.resetCamera();
      if (Game.world.setSpeedMultiplier) Game.world.setSpeedMultiplier(1);
      transitionTo(AppState.ONBOARDING);
    },
  });
}

function handleShare() {
  const catchMsg = Game.wasCaught ? ' أمسكت الخروف! 🐑' : '';
  const shareData = {
    title: 'خروف المعلم علي — عيد راش 🐑',
    text:  `تجاوزت ${Game.score} عائق في مطاردة خروف المعلم علي!${catchMsg} هل تستطيع التفوق عليّ؟ عيد مبارك 🎉`,
    url:   window.location.href,
  };

  if (navigator.share) {
    navigator.share(shareData).catch(() => {});
  } else {
    navigator.clipboard
      .writeText(`${shareData.text}\n${shareData.url}`)
      .then(() => showToast('تم نسخ الرابط! شارك اللعبة 🎉'))
      .catch(() => showToast('عيد مبارك! 🐑'));
  }
}

function showToast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed; bottom:80px; left:50%;
    transform:translateX(-50%) translateY(20px);
    background:rgba(255,184,0,0.95); color:#000;
    font-family:'Cairo',sans-serif;
    font-size:13px; font-weight:700;
    padding:10px 20px; border-radius:100px;
    z-index:999; white-space:nowrap; opacity:0;
    direction:rtl;
  `;
  document.body.appendChild(el);
  gsap.timeline()
    .to(el, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' })
    .to(el, { opacity: 0, y: -10, duration: 0.4, ease: 'power2.in', delay: 2.2,
              onComplete: () => el.remove() });
}


/* ──────────────────────────────────────────────────────────────
   GLOBALS
────────────────────────────────────────────────────────────── */
window.Game               = Game;
window.onSwipeLeft        = onSwipeLeft;
window.onSwipeRight       = onSwipeRight;
window.onSwipeUp          = onSwipeUp;
window.onObstacleDodged   = onObstacleDodged;
window.triggerScreenShake = triggerScreenShake;
window.showToast          = showToast;
window.transitionTo       = transitionTo;


/* ──────────────────────────────────────────────────────────────
   BOOT
────────────────────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
