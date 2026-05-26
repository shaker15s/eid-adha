'use strict';
/**
 * characters.js — Royal Ram: Eid Rush UPGRADED v3
 *
 * Fixes:
 *  • BUG #2: Unified charScales object — GSAP and direct code read same source
 *  • BUG #5: animateCatchUp passes correct 8 args to applyCharTransform
 *
 * Upgrades:
 *  • Variable gravity (ASCENT lighter, DESCENT heavier)
 *  • Peak hang time drag at jump apex
 *  • Spring-based lane change (natural overshoot)
 *  • Idle breathing animation
 *  • Landing impact hook (screen shake + dust + proportional squash)
 *  • Anticipation lean (skewX) on lane change
 *  • Perspective LUT (perspScaleFast) — precomputed Float32Array
 *  • cssText batch in applyCharTransform — single style write per frame
 */

const CharacterManager = (() => {

  /* ── Perspective constants (must match world.js) ── */
  const VANISH_X = 0.50;
  const VANISH_Y = 0.28;
  const NEAR_Y   = 0.92;
  const LANE_X   = [0.20, 0.50, 0.80];

  /* ── Character depth positions ── */
  const SHEEP_PROGRESS   = 0.38;
  const BUTCHER_PROGRESS = 0.64;

  /* ── Jump physics constants ── */
  const GRAVITY_ASCENT  = 800;   // lighter on the way up
  const GRAVITY_DESCENT = 1200;   // heavier on the way down (feels better)
  const JUMP_VELOCITY   = 460;

  /* ── DOM elements ── */
  let sheepEl    = null;
  let butcherEl  = null;
  let container  = null;

  /* ── Lane interpolation — spring state ── */
  let lerpSheepX   = LANE_X[1];
  let lerpButcherX = LANE_X[1];
  let butcherSpringV = 0; // spring velocity for butcher X
  let sheepSpringV   = 0; // spring velocity for sheep X
  let currentPlayerLane = 1;
  let currentSheepLane  = 1;
  let lastPlayerLane    = 1; // for detecting lane changes

  /* ── Unified scale state (BUG #2 fix) ── */
  const charScales = {
    butcher: { x: 1, y: 1 },
    sheep:   { x: 1, y: 1 },
  };

  /* ── Animation state ── */
  let isJumping         = false;
  let jumpVelocity      = 0;
  let jumpYOffset       = 0;
  let jumpState         = 'ground'; // 'ground'|'anticipation'|'jump'|'landing'
  let isSheepJumping    = false;
  let sheepJumpVelocity = 0;
  let sheepJumpYOffset  = 0;
  let staggerTimer      = 0;
  let tripTimer         = 0;
  let catchRatio        = 0;
  let isPanicked        = false;
  let panicShakeTimer   = 0;
  let butcherProgressOffset = 0;

  /* ── Catch-up state ── */
  let isCatchingUp = false;
  let catchupLane  = 1;

  /* ── Math ── */
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ── Perspective LUT (precomputed Float32Array) ── */
  const PERSP_LUT_SIZE = 1000;
  const perspLUT = new Float32Array(PERSP_LUT_SIZE);
  for (let i = 0; i < PERSP_LUT_SIZE; i++) {
    const p = i / PERSP_LUT_SIZE;
    perspLUT[i] = Math.max(0.04, Math.pow(Math.min(p, 1.0), 0.62));
  }

  function perspScaleFast(progress) {
    const idx = Math.floor(progress * (PERSP_LUT_SIZE - 1));
    return perspLUT[Math.max(0, Math.min(PERSP_LUT_SIZE - 1, idx))];
  }

  /* Keep original for compatibility */
  function perspScale(progress) {
    return perspScaleFast(progress);
  }

  function perspPos(laneX, progress) {
    return {
      x: lerp(VANISH_X, laneX, progress),
      y: lerp(VANISH_Y, NEAR_Y, progress),
    };
  }

  /* ── Spring lerp for natural overshoot ── */
  function springStep(current, target, velocity, stiffness, damping, dt) {
    const force = (target - current) * stiffness;
    velocity += force * dt;
    velocity *= Math.pow(1 - damping, dt * 60);
    current  += velocity * dt;
    return { value: current, velocity };
  }

  /* ════════════════════════════════════════════════════════
     APPLY TRANSFORM — batched cssText write (performance)
     ════════════════════════════════════════════════════════ */
  function applyCharTransform(el, laneX, progress, bobYPx, extraScaleX, extraScaleY, glowIntensity, tiltDeg) {
    const pos   = perspPos(laneX, progress);
    const scale = perspScaleFast(progress);

    const shadowSize   = scale * 20;
    const shadowSpread = scale * 5;

    let filterStr = `drop-shadow(0 ${shadowSpread.toFixed(1)}px ${shadowSize.toFixed(1)}px rgba(0,0,0,0.60))`;

    if (glowIntensity > 0.05) {
      const warmR = 245;
      const warmG = Math.max(0, 200 - Math.round(glowIntensity * 100));
      filterStr += ` drop-shadow(0 0 ${(glowIntensity * 28).toFixed(1)}px rgba(${warmR},${warmG},50,${glowIntensity.toFixed(2)}))`;
    }

    const finalScaleX = (scale * extraScaleX).toFixed(4);
    const finalScaleY = (scale * extraScaleY).toFixed(4);
    const tx = (pos.x * 100).toFixed(2);
    const ty = (pos.y * 100).toFixed(2);

    /* Single cssText write — much faster than 5 separate style assignments */
    el.style.cssText = `
      position:absolute;
      left:${tx}%;
      top:${ty}%;
      width:var(--char-base-width);
      height:auto;
      transform:translateX(-50%) translateY(${(-bobYPx).toFixed(1)}px) scaleX(${finalScaleX}) scaleY(${finalScaleY}) rotate(${(tiltDeg).toFixed(2)}deg);
      transform-origin:bottom center;
      filter:${filterStr};
      z-index:${Math.floor(progress * 90)};
      pointer-events:none;
      will-change:transform,filter;
    `;
  }

  /* ════════════════════════════════════════════════════════
     PUBLIC: UPDATE — called every frame from app.js
     ════════════════════════════════════════════════════════ */
  function update(delta, playerLane, sheepLane, timeLeft) {
    currentPlayerLane = playerLane;
    currentSheepLane  = sheepLane;

    const t           = performance.now() * 0.001;
    const speedFactor = 1 + (20 - timeLeft) * 0.022;

    /* ── Detect lane change for anticipation lean ── */
    if (playerLane !== lastPlayerLane) {
      const dir = playerLane > lastPlayerLane ? 1 : -1;
      onLaneChangeStart(dir);
      lastPlayerLane = playerLane;
    }

    /* ── Instant lane snap for butcher (no physics delay) ── */
    lerpButcherX   = LANE_X[playerLane];
    butcherSpringV = 0;

    /* ── Spring lane X for sheep ── */
    const ss = springStep(lerpSheepX, LANE_X[sheepLane], sheepSpringV, 320, 0.85, delta);
    lerpSheepX   = ss.value;
    sheepSpringV = ss.velocity;

    /* ── Dynamic camera tilt ── */
    const sheepDiff = lerpSheepX - LANE_X[sheepLane];
    if (Math.abs(sheepDiff) > 0.02) {
      const tilt = Math.max(-3, Math.min(3, sheepDiff * 10));
      gsap.to('#game-world', { rotationZ: tilt, duration: 0.2, overwrite: true });
    }

    /* ── Running cycles ── */
    const runPhase  = (performance.now() * 0.015 * speedFactor) % (Math.PI * 2);
    const butcherBob = Math.sin(runPhase) * 8 * perspScaleFast(BUTCHER_PROGRESS)
                     + Math.abs(Math.sin(runPhase * 2)) * 3;

    /* ── Idle breathing (when game hasn't progressed much) ── */
    const idlePhase   = t * 0.8;
    const breathScale = 1 + Math.sin(idlePhase) * 0.015;
    const breathY     = Math.sin(idlePhase * 0.7) * 1.5;

    /* ── Running squash/stretch — uses unified charScales (BUG #2 fix) ── */
    if (jumpState === 'ground') {
      const bobFactor = Math.sin(runPhase);
      charScales.butcher.x = 1 + bobFactor * 0.03;
      charScales.butcher.y = 1 - bobFactor * 0.04;
    }

    const sheepPhase  = (performance.now() * 0.018 * speedFactor) % (Math.PI * 2);
    const sheepBob    = Math.sin(sheepPhase + 0.6) * (6 * perspScaleFast(SHEEP_PROGRESS));
    if (!isSheepJumping) {
      const sbf = Math.sin(sheepPhase);
      charScales.sheep.x = 1 + sbf * 0.04;
      charScales.sheep.y = 1 - sbf * 0.05;
    }

    /* ── Variable gravity jump arc (BUG #2 FIX: reads charScales) ── */
    if (jumpState === 'jump') {
      const gravity = jumpVelocity > 0 ? GRAVITY_ASCENT : GRAVITY_DESCENT;
      jumpVelocity -= gravity * delta;
      jumpYOffset  += jumpVelocity * delta;

      /* Peak hang time — drag near apex */
      if (Math.abs(jumpVelocity) < 80) {
        jumpVelocity *= 0.92;
      }

      /* Squash prep while descending */
      if (jumpVelocity < 0 && charScales.butcher.y > 1.0) {
        gsap.to(charScales.butcher, {
          x: 0.95, y: 1.05,
          duration: 0.2, ease: 'power1.inOut',
          overwrite: true,
        });
      }

      if (jumpYOffset <= 0) {
        const landVelocity = jumpVelocity;
        jumpYOffset  = 0;
        jumpVelocity = 0;
        jumpState    = 'landing';
        onLand(landVelocity);
      }
    }

    /* ── Sheep jump arc ── */
    if (isSheepJumping) {
      sheepJumpVelocity -= 720 * delta;
      sheepJumpYOffset  += sheepJumpVelocity * delta;
      if (sheepJumpYOffset <= 0) {
        sheepJumpYOffset  = 0;
        sheepJumpVelocity = 0;
        isSheepJumping    = false;

        gsap.killTweensOf(charScales.sheep);
        charScales.sheep.x = 1.15;
        charScales.sheep.y = 0.85;
        gsap.to(charScales.sheep, { x: 1, y: 1, duration: 0.15, ease: 'power2.out' });
      }
    }

    /* ── Stagger shake ── */
    let staggerX = 0;
    if (staggerTimer > 0) {
      staggerTimer -= delta;
      staggerX = Math.sin(t * 22) * 0.018;
    }

    /* ── Trip dip ── */
    let tripDip = 0;
    if (tripTimer > 0) {
      tripTimer -= delta;
      tripDip = Math.sin(tripTimer * Math.PI / 0.35) * 8;
    }

    /* ── Panic sheep shake ── */
    let sheepShakeX = 0;
    if (panicShakeTimer > 0) {
      panicShakeTimer -= delta;
      sheepShakeX = Math.sin(t * 28) * 0.022;
    }

    /* ── Catch-up override ── */
    if (isCatchingUp) {
      lerpSheepX = lerp(lerpSheepX, LANE_X[catchupLane], delta * 4);
    }

    /* ── Butcher tilt ── */
    const butcherTilt = (LANE_X[playerLane] - lerpButcherX) * -35;

    /* Final jump offset blended with bob */
    const finalBobY = butcherBob + jumpYOffset * 0.6 + tripDip;

    applyCharTransform(
      butcherEl,
      lerpButcherX + staggerX,
      BUTCHER_PROGRESS + butcherProgressOffset,
      finalBobY,
      charScales.butcher.x,  /* BUG #2 FIX: reads from unified charScales */
      charScales.butcher.y,
      catchRatio,
      butcherTilt
    );

    /* ── Sheep ── */
    const sheepTilt = (LANE_X[sheepLane] - lerpSheepX) * -30;
    applyCharTransform(
      sheepEl,
      lerpSheepX + sheepShakeX,
      SHEEP_PROGRESS,
      sheepBob + sheepJumpYOffset * 0.55,
      charScales.sheep.x,
      charScales.sheep.y,
      0,
      sheepTilt
    );
  }

  /* ════════════════════════════════════════════════════════
     LANDING IMPACT HOOK
     ════════════════════════════════════════════════════════ */
  function onLand(velocity) {
    const impact = Math.min(1, Math.abs(velocity) / 700);

    /* 1. Screen shake */
    if (window.triggerScreenShake) {
      window.triggerScreenShake(impact * 0.4);
    }

    /* 2. Dust burst at feet */
    const world = document.getElementById('game-world');
    if (world && window._burstDust) {
      const pos = perspPos(lerpButcherX, BUTCHER_PROGRESS);
      window._burstDust(
        pos.x * world.clientWidth,
        pos.y * world.clientHeight,
        Math.floor(impact * 8 + 3)
      );
    }

    /* 3. Proportional squash */
    const squashX = 1.0 + impact * 0.45;
    const squashY = 1.0 - impact * 0.35;
    gsap.killTweensOf(charScales.butcher);
    charScales.butcher.x = squashX;
    charScales.butcher.y = squashY;
    gsap.to(charScales.butcher, {
      x: 1, y: 1,
      duration: 0.22 + impact * 0.1,
      ease: 'elastic.out(1, 0.6)',
    });

    /* 4. Land SFX */
    if (window.Game && window.Game.audio) {
      window.Game.audio.playSFX('land');
    }

    jumpState = 'ground';
    if (typeof ControllerManager !== 'undefined' && ControllerManager.checkBufferedGesture) {
      ControllerManager.checkBufferedGesture();
    }
  }

  /* ════════════════════════════════════════════════════════
     ANTICIPATION LEAN ON LANE CHANGE
     ════════════════════════════════════════════════════════ */
  function onLaneChangeStart(direction) {
    // Disabled to guarantee 100% instant lane changing response with no visual lag or scaling tweens
  }

  /* ════════════════════════════════════════════════════════
     SHEEP JUMP
     ════════════════════════════════════════════════════════ */
  function doSheepJump() {
    if (isSheepJumping) return;
    isSheepJumping    = true;
    sheepJumpVelocity = 420; // slightly higher jump for evasion flare

    gsap.killTweensOf(charScales.sheep);
    charScales.sheep.x = 0.75;
    charScales.sheep.y = 1.30;
    
    // Squash & Stretch
    gsap.to(charScales.sheep, {
      x: 0.75, y: 1.30,
      duration: 0.15,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(charScales.sheep, { x: 1, y: 1, duration: 0.35, ease: 'elastic.out(1, 0.4)' });
      }
    });

    // 360 degree spin animation on the sheep image container
    if (sheepEl) {
      gsap.killTweensOf(sheepEl, 'rotation');
      gsap.fromTo(sheepEl, 
        { rotation: 0 },
        { rotation: 360, duration: 0.65, ease: 'power2.out' }
      );
    }

    if (window.Game && window.Game.audio) {
      window.Game.audio.playSFX('jump');
    }
  }

  /* ════════════════════════════════════════════════════════
     ANIMATIONS
     ════════════════════════════════════════════════════════ */
  function sheepAlert() {
    if (!sheepEl) return;
    gsap.timeline()
      .to(sheepEl, { scaleX: 1.15, scaleY: 0.88, duration: 0.12, ease: 'power2.out' })
      .to(sheepEl, { scaleX: 0.90, scaleY: 1.18, duration: 0.18, ease: 'power2.inOut' })
      .to(sheepEl, { scaleX: 1.05, scaleY: 0.95, duration: 0.14 })
      .to(sheepEl, { scaleX: 1,    scaleY: 1,    duration: 0.20, ease: 'elastic.out(1,0.5)' });
  }

  function doJump() {
    if (jumpState !== 'ground') return;
    jumpState = 'anticipation';

    gsap.killTweensOf(charScales.butcher);
    charScales.butcher.x = 1.18;
    charScales.butcher.y = 0.72;

    gsap.to(charScales.butcher, {
      x: 1.18, y: 0.72,
      duration: 0.08,
      ease: 'power1.out',
      onComplete: () => {
        jumpState    = 'jump';
        jumpVelocity = JUMP_VELOCITY;
        jumpYOffset  = 0;

        gsap.to(charScales.butcher, {
          x: 0.82, y: 1.22,
          duration: 0.16,
          ease: 'power2.out',
        });

        if (window.Game && window.Game.audio) {
          window.Game.audio.playSFX('jump');
        }
      }
    });
  }

  function playStaggerAnim() {
    staggerTimer = 0.55;
    if (butcherEl) {
      gsap.killTweensOf(butcherEl);
      gsap.fromTo(butcherEl,
        { filter: 'drop-shadow(0 0 22px rgba(255,60,40,0.95)) brightness(1.5)' },
        { filter: 'drop-shadow(0 5px 20px rgba(0,0,0,0.6))', duration: 0.5 }
      );
    }

    const knockbackObj = { offset: 0 };
    gsap.killTweensOf(knockbackObj);
    gsap.to(knockbackObj, {
      offset: -0.09,
      duration: 0.12,
      yoyo: true,
      repeat: 1,
      ease: 'power2.out',
      onUpdate: () => { butcherProgressOffset = knockbackObj.offset; },
      onComplete: () => { butcherProgressOffset = 0; }
    });
  }

  function playTripAnim() {
    tripTimer = 0.35;
    if (butcherEl) {
      gsap.killTweensOf(butcherEl);
      gsap.fromTo(butcherEl,
        { filter: 'brightness(1.8) sepia(0.4)' },
        { filter: 'drop-shadow(0 5px 20px rgba(0,0,0,0.6))', duration: 0.3 }
      );
    }

    const knockbackObj = { offset: 0 };
    gsap.killTweensOf(knockbackObj);
    gsap.to(knockbackObj, {
      offset: -0.05,
      duration: 0.08,
      yoyo: true,
      repeat: 1,
      ease: 'power1.out',
      onUpdate: () => { butcherProgressOffset = knockbackObj.offset; },
      onComplete: () => { butcherProgressOffset = 0; }
    });
  }

  function triggerSheepPanic() {
    panicShakeTimer = 0.7;
    if (sheepEl) {
      gsap.fromTo(sheepEl,
        { filter: 'drop-shadow(0 0 15px rgba(255,120,0,0.7))' },
        { filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))', duration: 0.6 }
      );
    }
  }

  function setCatchProximity(ratio) {
    catchRatio = Math.max(0, Math.min(1, ratio));
  }

  function getPlayerBounds() {
    return { lane: currentPlayerLane };
  }

  /* ════════════════════════════════════════════════════════
     CINEMATIC: CATCH UP
     ════════════════════════════════════════════════════════ */
  function animateCatchUp(sheepLane, duration) {
    isCatchingUp = true;
    catchupLane  = sheepLane;

    const animObj = { progress: BUTCHER_PROGRESS };

    const tl = gsap.timeline({
      onComplete: () => { isCatchingUp = false; }
    });

    /* BUG #5 FIX: applyCharTransform called with 8 args (was 7, missing extraScaleY) */
    applyCharTransform(
      sheepEl,
      LANE_X[sheepLane],
      SHEEP_PROGRESS,
      0,    // bobYPx
      1.0,  // extraScaleX
      1.0,  // extraScaleY  ← was missing
      0,    // glowIntensity
      0     // tiltDeg
    );

    tl.to(animObj, {
      progress: SHEEP_PROGRESS + 0.04,
      duration: duration * 0.75,
      ease: 'power2.out',
      onUpdate: () => {
        applyCharTransform(
          butcherEl,
          LANE_X[sheepLane],
          animObj.progress,
          0,
          1.0,
          1.0,  // extraScaleY  ← was missing
          catchRatio,
          0
        );
      }
    }, 0);

    tl.to(sheepEl, {
      filter: 'drop-shadow(0 0 25px rgba(255,80,20,0.7)) brightness(1.2)',
      duration: 0.3,
    }, 0);

    tl.add(() => {
      const world = document.getElementById('game-world');
      if (window._burstParticles && world) {
        const endPos = perspPos(LANE_X[sheepLane], SHEEP_PROGRESS + 0.04);
        const x = endPos.x * world.clientWidth;
        const y = endPos.y * world.clientHeight;
        window._burstParticles(x, y, 40);
      }
    }, duration * 0.55);
  }

  /* ════════════════════════════════════════════════════════
     CINEMATIC: FINAL FIGHT
     ════════════════════════════════════════════════════════ */
  function triggerFinalFight(sheepLane, onComplete) {
    const duration = 3.2;

    const charContainer = document.getElementById('gw-chars');
    const finalChild = document.createElement('img');
    finalChild.src = Assets['sprite_child1'];
    finalChild.className = 'obstacle-sprite';
    finalChild.style.transformOrigin = 'bottom center';
    charContainer.appendChild(finalChild);

    const childPos   = perspPos(LANE_X[sheepLane], SHEEP_PROGRESS + 0.01);
    const childScale = perspScaleFast(SHEEP_PROGRESS + 0.01);
    finalChild.style.left      = `${childPos.x * 100}%`;
    finalChild.style.top       = `${childPos.y * 100}%`;
    finalChild.style.transform = `translateX(-50%) scale(${childScale})`;
    finalChild.style.zIndex    = Math.floor((SHEEP_PROGRESS + 0.01) * 90);

    if (window.Game && window.Game.audio) {
      window.Game.audio.playSFX('trip');
      window.Game.audio.playSFX('bump');
      window.Game.audio.playBaaa(true);
    }

    gsap.timeline()
      .to(sheepEl, { x: '+=12', rotation: 7, duration: 0.1, yoyo: true, repeat: 5 })
      .to(sheepEl, { x: 0, rotation: 0, duration: 0.15 });

    animateCatchUp(sheepLane, duration * 0.7);

    gsap.delayedCall(duration * 0.55, () => {
      const flash = document.getElementById('victory-flash');
      if (flash) {
        gsap.fromTo(flash,
          { opacity: 1 },
          { opacity: 0, duration: 0.6, delay: 0.15 }
        );
      }
      if (window._burstParticles) {
        const w = document.getElementById('game-world');
        if (w) window._burstParticles(w.clientWidth * 0.5, w.clientHeight * 0.55, 60);
      }
      finalChild.remove();
    });

    gsap.delayedCall(duration, () => {
      if (typeof onComplete === 'function') onComplete();
    });
  }

  /* ════════════════════════════════════════════════════════
     CINEMATIC: ESCAPE
     ════════════════════════════════════════════════════════ */
  function animateEscape(sheepLane, duration, onComplete) {
    isCatchingUp = false;

    const tl = gsap.timeline({
      onComplete: () => {
        if (typeof onComplete === 'function') onComplete();
      }
    });

    tl.to(butcherEl, {
      top: '+=35px',
      filter: 'grayscale(0.6) drop-shadow(0 5px 15px rgba(0,0,0,0.5))',
      duration: duration * 0.4,
      ease: 'power2.out'
    }, 0);

    const endPos   = perspPos(LANE_X[sheepLane], 0.05);
    const endScale = perspScaleFast(0.05);

    tl.to(sheepEl, {
      left:    `${endPos.x * 100}%`,
      top:     `${endPos.y * 100}%`,
      scale:   endScale,
      opacity: 0,
      duration: duration * 0.8,
      ease: 'power3.in'
    }, 0);
  }

  /* ════════════════════════════════════════════════════════
     RESET
     ════════════════════════════════════════════════════════ */
  function reset() {
    lerpSheepX         = LANE_X[1];
    lerpButcherX       = LANE_X[1];
    butcherSpringV     = 0;
    sheepSpringV       = 0;
    currentPlayerLane  = 1;
    currentSheepLane   = 1;
    lastPlayerLane     = 1;
    jumpState          = 'ground';
    jumpYOffset        = 0;
    jumpVelocity       = 0;
    isSheepJumping     = false;
    sheepJumpYOffset   = 0;
    sheepJumpVelocity  = 0;
    staggerTimer       = 0;
    tripTimer          = 0;
    catchRatio         = 0;
    isPanicked         = false;
    panicShakeTimer    = 0;
    isCatchingUp       = false;
    butcherProgressOffset = 0;

    charScales.butcher.x = 1;
    charScales.butcher.y = 1;
    charScales.sheep.x   = 1;
    charScales.sheep.y   = 1;

    if (butcherEl) {
      gsap.killTweensOf(butcherEl);
      butcherEl.style.filter  = '';
      butcherEl.style.skewX   = '';
      butcherEl.style.cssText = '';
    }
    if (sheepEl) {
      gsap.killTweensOf(sheepEl);
      sheepEl.style.filter  = '';
      sheepEl.style.opacity = '';
      sheepEl.style.cssText = '';
    }

    update(0, 1, 1, 20);
  }

  /* ════════════════════════════════════════════════════════
     INIT
     ════════════════════════════════════════════════════════ */
  function init(sceneManager) {
    container = document.getElementById('gw-chars');

    butcherEl           = document.createElement('img');
    butcherEl.src       = Assets['sprite_butcher'];
    butcherEl.className = 'char-sprite';
    butcherEl.id        = 'char-butcher';
    butcherEl.alt       = 'Butcher';
    butcherEl.draggable = false;
    container.appendChild(butcherEl);

    sheepEl           = document.createElement('img');
    sheepEl.src       = Assets['sprite_sheep'];
    sheepEl.className = 'char-sprite';
    sheepEl.id        = 'char-sheep';
    sheepEl.alt       = 'Sheep';
    sheepEl.draggable = false;
    container.appendChild(sheepEl);

    update(0, 1, 1, 20);

    return {
      update,
      sheepAlert,
      doJump,
      doSheepJump,
      playStaggerAnim,
      playTripAnim,
      getPlayerBounds,
      reset,
      animateCatchUp,
      triggerFinalFight,
      animateEscape,
      setCatchProximity,
      triggerSheepPanic,
      getPlayerState: () => jumpState,
    };
  }

  return { init };

})();
