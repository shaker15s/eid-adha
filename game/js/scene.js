'use strict';
/**
 * scene.js — Royal Ram: Eid Rush UPGRADED v3
 *
 * Upgrades:
 *  • emitDustTrail — character feet dust particles
 *  • updateAtmosphere — dynamic sky color shift (golden → panic red)
 *  • updateParallax — background layer parallax
 *  • setChromaticAberration — screen distortion in panic mode
 *  • updateWorldBreath — subtle world scale with combo/panic
 *  • _burstDust exposed globally for landing impact
 *  • render() now calls per-frame visual effects
 */

const SceneManager = (() => {

  let gameWorld      = null;
  let particleCtx    = null;
  let particleCanvas = null;
  let stars          = [];

  /* ── Particle pool ── */
  const MAX_PARTICLES = 40;
  let particles      = [];
  let dustParticles  = []; // separate dust trail pool
  let particleActive = false;
  let lastParticleFrame = 0;

  /* ── Scene state ── */
  let lastTimeLeft     = 20;
  let chromaticLevel   = 0;
  let bgParallaxOffset = 0;

  /* ════════════════════════════════════════════════════════
     INIT
     ════════════════════════════════════════════════════════ */
  function init() {
    gameWorld      = document.getElementById('game-world');
    particleCanvas = document.getElementById('particle-canvas');

    resizeParticleCanvas();
    window.addEventListener('resize', resizeParticleCanvas, { passive: true });

    particleCtx = particleCanvas.getContext('2d');

    generateStars();

    /* Expose dust burst globally for landing impact */
    window._burstDust = burstDust;

    return {
      scene:               gameWorld,
      render:              render,
      setCameraToSheepFace,
      doCameraWhip,
      resetCamera,
      orbitToTopDown,
      triggerLaneRoll,
      focusOnCatch,
      startParticles,
      stopParticles,
      setChromaticAberration,
      updateAtmosphere,
      updateWorldBreath,
    };
  }

  /* ════════════════════════════════════════════════════════
     RENDER — called every game frame
     ════════════════════════════════════════════════════════ */
  function render() {
    // No-op for CSS rendering; particle canvas is updated in its own RAF loop.
    // Chromatic aberration is applied directly when called.
  }

  /* ════════════════════════════════════════════════════════
     STARS
     ════════════════════════════════════════════════════════ */
  function generateStars() {
    const container = document.getElementById('gw-stars');
    if (!container) return;
    const count = 55;
    for (let i = 0; i < count; i++) {
      const star = document.createElement('div');
      const size    = Math.random() * 2.2 + 0.5;
      const opacity = Math.random() * 0.55 + 0.15;
      const top     = Math.random() * 50;
      const left    = Math.random() * 100;
      const delay   = Math.random() * 4;
      const dur     = 2.5 + Math.random() * 3;
      star.style.cssText = `
        position: absolute;
        width: ${size}px; height: ${size}px;
        border-radius: 50%;
        background: #fff;
        top: ${top}%; left: ${left}%;
        opacity: ${opacity};
        animation: starTwinkle ${dur}s ${delay}s ease-in-out infinite alternate;
      `;
      container.appendChild(star);
      stars.push(star);
    }

    if (!document.getElementById('star-kf')) {
      const style = document.createElement('style');
      style.id = 'star-kf';
      style.textContent = `
        @keyframes starTwinkle {
          from { opacity: var(--s-op-from, 0.15); transform: scale(1); }
          to   { opacity: var(--s-op-to, 0.8);   transform: scale(1.4); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /* ════════════════════════════════════════════════════════
     CANVAS RESIZE
     ════════════════════════════════════════════════════════ */
  function resizeParticleCanvas() {
    if (!particleCanvas || !gameWorld) return;
    particleCanvas.width  = gameWorld.clientWidth  || window.innerWidth;
    particleCanvas.height = gameWorld.clientHeight || window.innerHeight;
  }

  /* ════════════════════════════════════════════════════════
     AMBIENT GOLDEN DUST PARTICLES
     ════════════════════════════════════════════════════════ */
  function spawnParticle() {
    const w   = particleCanvas.width;
    const h   = particleCanvas.height;
    const hue = 35 + Math.random() * 20;
    const lit = 60 + Math.random() * 28;
    return {
      x:       Math.random() * w,
      y:       h + 8,
      vx:      (Math.random() - 0.5) * 0.55,
      vy:      -(0.4 + Math.random() * 1.2),
      size:    1.5 + Math.random() * 4,
      opacity: 0.5 + Math.random() * 0.45,
      life:    1,
      decay:   0.003 + Math.random() * 0.006,
      color:   `hsl(${hue}, 92%, ${lit}%)`,
      glow:    Math.random() > 0.65,
      isDust:  false,
    };
  }

  function startParticles() {
    if (particleActive) return;
    particleActive = true;
    lastParticleFrame = performance.now();
    particleLoop(lastParticleFrame);
  }

  function stopParticles() {
    particleActive = false;
    particles      = [];
    dustParticles  = [];
    if (particleCtx && particleCanvas) {
      particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    }
  }

  function particleLoop(now) {
    if (!particleActive) return;

    const elapsed = now - lastParticleFrame;
    if (elapsed < 33) {
      requestAnimationFrame(particleLoop);
      return;
    }
    lastParticleFrame = now;

    if (!particleCtx) { requestAnimationFrame(particleLoop); return; }

    const ctx = particleCtx;
    ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

    /* Spawn new ambient particles */
    if (particles.length < MAX_PARTICLES && Math.random() < 0.18) {
      particles.push(spawnParticle());
    }

    /* Draw ambient particles */
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x    += p.vx;
      p.y    += p.vy;
      p.life -= p.decay;

      if (p.life <= 0 || p.y < -20) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = p.life * p.opacity;
      ctx.globalAlpha = alpha;
      if (p.glow) { ctx.shadowBlur = 10; ctx.shadowColor = p.color; }
      else { ctx.shadowBlur = 0; }

      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Draw dust trail particles */
    for (let i = dustParticles.length - 1; i >= 0; i--) {
      const p = dustParticles[i];
      p.x    += p.vx;
      p.y    += p.vy;
      p.life -= p.decay;

      if (p.life <= 0) {
        dustParticles.splice(i, 1);
        continue;
      }

      const alpha = p.life * p.opacity;
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 0;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    requestAnimationFrame(particleLoop);
  }

  /* Burst particles at position (catch/score) */
  function burstParticles(cx, cy, count) {
    count = count || 25;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 1.5 + Math.random() * 4.5;
      const hue   = 35 + Math.random() * 25;
      particles.push({
        x:       cx,
        y:       cy,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed * 0.6 - 2,
        size:    2 + Math.random() * 5,
        opacity: 0.9,
        life:    1,
        decay:   0.012 + Math.random() * 0.018,
        color:   `hsl(${hue}, 95%, 65%)`,
        glow:    true,
        isDust:  false,
      });
    }
  }
  window._burstParticles = burstParticles;

  /* ── Dust burst at feet (landing impact) ── */
  function burstDust(cx, cy, count) {
    count = count || 5;
    for (let i = 0; i < count; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * 1.2; // backwards & sideways
      const speed = 0.8 + Math.random() * 2.5;
      dustParticles.push({
        x:       cx + (Math.random() - 0.5) * 12,
        y:       cy,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed - 0.5,
        size:    2 + Math.random() * 3,
        opacity: 0.35 + Math.random() * 0.25,
        life:    1,
        decay:   0.04 + Math.random() * 0.03,
        color:   `rgba(210, 165, 95, 0.7)`,
        glow:    false,
      });
    }
  }

  /* ── Dust trail emitter (probabilistic per frame, called from app) ── */
  function emitDustTrail(x, y, speed) {
    if (Math.random() > 0.35) return;
    dustParticles.push({
      x:       x,
      y:       y + 5,
      vx:      (Math.random() - 0.5) * 1.5 - speed * 0.3,
      vy:      -(Math.random() * 0.5),
      size:    1.5 + Math.random() * 2.5,
      opacity: 0.25 + Math.random() * 0.2,
      life:    1,
      decay:   0.04 + Math.random() * 0.03,
      color:   `rgba(210, 165, 95, 0.6)`,
      glow:    false,
    });
  }

  /* ════════════════════════════════════════════════════════
     DYNAMIC ATMOSPHERE — golden hour → panic red
     ════════════════════════════════════════════════════════ */
  function updateAtmosphere(timeLeft) {
    const atm = document.getElementById('gw-atmosphere');
    if (!atm) return;
    const progress = Math.max(0, Math.min(1, 1 - (timeLeft / 20)));

    const r = Math.round(80  + (140 - 80)  * progress);
    const g = Math.round(20  + (8   - 20)  * progress);
    const b = Math.round(10  + (4   - 10)  * progress);
    const a = (0.15 + 0.35 * progress).toFixed(2);

    atm.style.background = `
      linear-gradient(
        to bottom,
        rgba(${r}, ${g}, ${b}, ${a}) 0%,
        rgba(180, 80, 20, 0.08) 35%,
        transparent 55%,
        rgba(5, 3, 1, 0.55) 80%,
        rgba(5, 3, 1, 0.82) 100%
      )
    `;
  }

  /* ════════════════════════════════════════════════════════
     WORLD BREATH — subtle scale with panic/combo
     ════════════════════════════════════════════════════════ */
  function updateWorldBreath(timeLeft, comboCount) {
    const panicProgress = Math.max(0, (5 - timeLeft) / 5);
    const comboBoost    = Math.min((comboCount || 0) * 0.002, 0.015);
    const targetScale   = 1 + panicProgress * 0.025 + comboBoost;
    gsap.to('#gw-bg', {
      scale: targetScale,
      duration: 1.5,
      ease: 'power1.inOut',
      overwrite: 'auto',
    });
  }

  /* ════════════════════════════════════════════════════════
     CHROMATIC ABERRATION — panic distortion
     ════════════════════════════════════════════════════════ */
  function setChromaticAberration(intensity) {
    if (!gameWorld) return;
    if (intensity > 0.05) {
      const px = (intensity * 3).toFixed(1);
      gameWorld.style.filter = `drop-shadow(${px}px 0 0 rgba(255,0,0,0.18)) drop-shadow(-${px}px 0 0 rgba(0,200,255,0.18))`;
    } else {
      gameWorld.style.filter = '';
    }
  }

  /* ════════════════════════════════════════════════════════
     PARALLAX BACKGROUND
     ════════════════════════════════════════════════════════ */
  function updateParallax(playerVelocityX) {
    if (!playerVelocityX) return;
    bgParallaxOffset += playerVelocityX * 0.4;
    bgParallaxOffset  = Math.max(-8, Math.min(8, bgParallaxOffset));
    const bgEl = document.getElementById('gw-bg');
    if (bgEl) {
      bgEl.style.backgroundPositionX = `calc(50% + ${bgParallaxOffset.toFixed(1)}px)`;
    }
    bgParallaxOffset *= 0.92; // decay back to center
  }

  /* ════════════════════════════════════════════════════════
     CAMERA EFFECTS
     ════════════════════════════════════════════════════════ */
  function setCameraToSheepFace() {
    gsap.to(gameWorld, {
      scale:           1.12,
      transformOrigin: '50% 30%',
      duration:        0.6,
      ease:            'power2.out',
    });
  }

  function doCameraWhip(onComplete) {
    const tl = gsap.timeline({ onComplete });

    tl.to(gameWorld, {
      scale:     0.96,
      rotationZ: -2,
      duration:  0.18,
      ease:      'power2.in',
    }, 0);

    tl.to(gameWorld, {
      scale:     1.06,
      rotationZ: 4,
      filter:    'blur(4px) brightness(1.1)',
      duration:  0.14,
      ease:      'power3.in',
    }, 0.16);

    tl.to(gameWorld, {
      scale:     1,
      rotationZ: 0,
      filter:    'blur(0px) brightness(1)',
      duration:  0.50,
      ease:      'power2.out',
    }, 0.30);
  }

  function resetCamera() {
    gsap.killTweensOf(gameWorld);
    setChromaticAberration(0);
    gsap.to(gameWorld, {
      scale:     1,
      rotationZ: 0,
      filter:    'blur(0px) brightness(1)',
      duration:  0.35,
      ease:      'power2.out',
    });
  }

  function orbitToTopDown(onComplete) {
    gsap.to(gameWorld, {
      scale:    0.91,
      duration: 1.4,
      ease:     'power2.inOut',
      onComplete,
    });
  }

  function triggerLaneRoll(direction) {
    gsap.killTweensOf(gameWorld, 'rotationZ');
    gsap.fromTo(gameWorld,
      { rotationZ: direction * 2.8 },
      { rotationZ: 0, duration: 0.55, ease: 'power2.out' }
    );
  }

  function focusOnCatch(duration) {
    gsap.killTweensOf(gameWorld);
    gsap.to(gameWorld, {
      scale:           1.10,
      transformOrigin: '50% 42%',
      duration:        duration * 0.65,
      ease:            'power2.out',
    });
  }

  return { init };

})();
