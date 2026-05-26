'use strict';
/**
 * world.js — Royal Ram: Eid Rush UPGRADED v3
 *
 * Upgrades:
 *  • Object pooling (acquireObstacle / releaseObstacle) — reduces GC stutters
 *  • Obstacle hit juice — flies backwards + rotates on impact
 *  • Obstacle dodge integrates with combo system
 */

const WorldManager = (() => {

  /* ── Perspective constants ── */
  const VANISH_X = 0.50;
  const VANISH_Y = 0.28;
  const NEAR_Y   = 0.92;
  const LANE_X   = [0.20, 0.50, 0.80];

  /* ── Obstacle lifecycle ── */
  const SPAWN_PROGRESS   = 0.04;
  const HIT_PROGRESS_MIN = 0.72;
  const HIT_PROGRESS_MAX = 0.88;
  const DODGE_PROGRESS   = 0.92;

  const CHILD_TYPES = ['sprite_child1', 'sprite_child2', 'sprite_child3'];
  let sequenceIndex = 0;
  const FIXED_SEQUENCE = [0, 2, 1, 0, 1, 2, 0, 2, 1, 2, 0, 1, 0, 2, 1, 0, 1, 2, 1, 0, 2, 0, 1, 2, 0, 2, 1, 0, 1, 2];

  /* ── State ── */
  let obstacles  = [];
  let container  = null;
  let baseSpeed  = 0.36;
  let speedMult  = 1.0;
  let spawnTimer = 2.5;
  let lastLane   = -1;
  let isActive   = false;
  let lastGroundSpeedStr = '';

  /* ── Object Pool ── */
  const obstaclePool   = [];
  const MAX_POOL_SIZE  = 12;

  /* ── Math helpers ── */
  const lerp = (a, b, t) => a + (b - a) * t;

  function perspScale(progress) {
    return Math.max(0.03, Math.pow(Math.min(progress, 1.0), 0.62));
  }

  function perspPos(lane, progress) {
    return {
      x: lerp(VANISH_X, LANE_X[lane], progress),
      y: lerp(VANISH_Y, NEAR_Y,       progress),
    };
  }

  function getSpawnInterval(timeLeft) {
    if (timeLeft <= 4)  return 0.95;
    if (timeLeft <= 8)  return 1.35;
    if (timeLeft <= 13) return 1.75;
    return 2.40;
  }

  function pickLane() {
    const lane = FIXED_SEQUENCE[sequenceIndex % FIXED_SEQUENCE.length];
    sequenceIndex++;
    lastLane = lane;
    return lane;
  }

  /* ── Object Pooling ── */
  function acquireObstacle() {
    if (obstaclePool.length > 0) {
      const obs = obstaclePool.pop();
      obs.hitRecorded   = false;
      obs.dodgeRecorded = false;
      obs.active        = true;
      obs.progress      = SPAWN_PROGRESS;
      return obs;
    }
    return {
      lane: 0, type: '', progress: SPAWN_PROGRESS,
      element: null, hitRecorded: false, dodgeRecorded: false, active: true,
    };
  }

  function releaseObstacle(obs) {
    obs.active        = false;
    obs.hitRecorded   = false;
    obs.dodgeRecorded = false;
    if (obs.element) {
      if (obs.element.parentNode) obs.element.parentNode.removeChild(obs.element);
      obs.element = null;
    }
    if (obstaclePool.length < MAX_POOL_SIZE) {
      obstaclePool.push(obs);
    }
  }

  /* ── CREATE OBSTACLE DOM ELEMENT ── */
  function createObstacleEl(type) {
    const img = document.createElement('img');
    img.src       = Assets[type];
    img.className = 'obstacle-sprite';
    img.alt       = '';
    img.draggable = false;
    container.appendChild(img);
    return img;
  }

  /* ── SPAWN ── */
  function spawnObstacle() {
    const lane = pickLane();
    const type = CHILD_TYPES[sequenceIndex % CHILD_TYPES.length];

    const obs  = acquireObstacle();
    obs.lane   = lane;
    obs.type   = type;
    obs.element = createObstacleEl(type);

    obstacles.push(obs);
  }

  /* ── UPDATE SINGLE OBSTACLE ── */
  function updateObstacle(obs, delta, parentWidth, parentHeight) {
    obs.progress += baseSpeed * speedMult * delta;

    const { x, y } = perspPos(obs.lane, obs.progress);
    const scale     = perspScale(obs.progress);
    const opacity   = obs.progress < 0.10 ? (obs.progress / 0.10) : 1.0;
    const zIndex    = Math.floor(obs.progress * 90) + 10;

    const shadowBlur   = scale * 18;
    const shadowSpread = scale * 4;
    const filterVal    = `drop-shadow(0 ${shadowSpread}px ${shadowBlur}px rgba(0,0,0,0.55))`;

    const tx = x * parentWidth;
    const ty = y * parentHeight;

    obs.element.style.transform = `translate3d(${tx}px, ${ty}px, 0) translateX(-50%) scale(${scale})`;
    obs.element.style.opacity   = opacity;
    obs.element.style.zIndex    = zIndex;
    obs.element.style.filter    = filterVal;

    /* Dodge scoring */
    if (!obs.dodgeRecorded && obs.progress >= DODGE_PROGRESS) {
      obs.dodgeRecorded = true;
      if (typeof window.onObstacleDodged === 'function') {
        window.onObstacleDodged('child');
      }
    }

    /* Remove when past */
    if (obs.progress > 1.15) {
      obs.active = false;
      releaseObstacle(obs);
      return false;
    }
    return true;
  }

  /* ── PUBLIC: UPDATE ── */
  function update(delta, timeLeft) {
    if (!isActive) return;

    const elapsed = 20 - timeLeft;
    baseSpeed = 0.36 + elapsed * 0.009;

    spawnTimer -= delta;
    if (spawnTimer <= 0) {
      spawnTimer = getSpawnInterval(timeLeft);
      spawnObstacle();
    }

    const parentWidth  = container.clientWidth  || window.innerWidth;
    const parentHeight = container.clientHeight || window.innerHeight;

    obstacles = obstacles.filter(obs => {
      if (!obs.active) return false;
      return updateObstacle(obs, delta, parentWidth, parentHeight);
    });

    /* Ground scroll speed */
    if (speedMult > 0) {
      const groundSpeedVal = Math.max(0.12, Math.min(0.44 / (baseSpeed * speedMult / 0.36), 1.8));
      const groundSpeedStr = `${groundSpeedVal.toFixed(2)}s`;
      if (groundSpeedStr !== lastGroundSpeedStr) {
        lastGroundSpeedStr = groundSpeedStr;
        document.documentElement.style.setProperty('--ground-speed', groundSpeedStr);
      }
    }
  }

  /* ── PUBLIC: CHECK COLLISION ── */
  function checkCollision(playerBounds) {
    if (!playerBounds || !isActive) return { type: 'none' };
    const pLane = playerBounds.lane;

    for (const obs of obstacles) {
      if (!obs.active || obs.hitRecorded) continue;
      if (
        obs.lane     === pLane &&
        obs.progress >= HIT_PROGRESS_MIN &&
        obs.progress <= HIT_PROGRESS_MAX
      ) {
        obs.hitRecorded = true;

        /* Hit juice — obstacle flies back and fades */
        if (obs.element) {
          const el = obs.element;
          gsap.to(el, {
            rotate:  (Math.random() - 0.5) * 55,
            opacity: 0,
            scale:   1.25,
            duration: 0.40,
            ease: 'power2.out',
            onComplete: () => {
              obs.active = false;
              if (el.parentNode) el.parentNode.removeChild(el);
              obs.element = null;
            }
          });
          /* Brightness flash on hit */
          gsap.fromTo(el,
            { filter: 'brightness(2) drop-shadow(0 0 18px rgba(255,80,50,0.9))' },
            { filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.55))', duration: 0.2 }
          );
        }

        return { type: 'child' };
      }
    }
    return { type: 'none' };
  }

  /* ── PUBLIC: IS OBSTACLE AHEAD IN LANE ── */
  function isObstacleAheadInLane(lane) {
    return obstacles.some(obs =>
      obs.active &&
      obs.lane     === lane &&
      obs.progress >= 0.05 &&
      obs.progress <  0.68
    );
  }

  function isObstacleNearSheep(lane) {
    return obstacles.some(obs =>
      obs.active &&
      obs.lane     === lane &&
      obs.progress >= 0.12 &&
      obs.progress <= 0.43
    );
  }

  /* ── PUBLIC: SPEED MULTIPLIER ── */
  function setSpeedMultiplier(m) {
    speedMult = Math.max(0, m);
    if (m <= 0.01) {
      document.documentElement.style.setProperty('--ground-speed', '99s');
    }
  }

  /* ── PUBLIC: RESET ── */
  function reset() {
    obstacles.forEach(obs => {
      if (obs.element && obs.element.parentNode) obs.element.parentNode.removeChild(obs.element);
      obs.element = null;
    });
    obstacles  = [];
    spawnTimer = 2.8;
    baseSpeed  = 0.36;
    speedMult  = 1.0;
    lastLane   = -1;
    sequenceIndex = 0;
    isActive   = true;
    lastGroundSpeedStr = '0.45s';
    document.documentElement.style.setProperty('--ground-speed', '0.45s');
  }

  function getRandomActiveObstacleElement() {
    const activeObs = obstacles.filter(obs => obs.active && obs.progress > 0.1 && obs.progress < 0.9 && obs.element);
    if (activeObs.length === 0) return null;
    return activeObs[Math.floor(Math.random() * activeObs.length)].element;
  }

  /* ── INIT ── */
  function init(sceneManager) {
    container = document.getElementById('gw-chars');
    isActive  = false;

    return {
      update,
      checkCollision,
      reset,
      isObstacleAheadInLane,
      isObstacleNearSheep,
      setSpeedMultiplier,
      getRandomActiveObstacleElement,
    };
  }

  return { init };

})();
