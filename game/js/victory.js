/**
 * victory.js — Royal Ram: Eid Rush v2
 * Cinematic Victory Sequence (wasCaught-aware)
 *
 * Sequence:
 *  0.0s — vignette + blur backdrop
 *  0.6s — Camera orbit (SceneManager)
 *  1.0s — White shutter flash (0.15s) + shutter SFX
 *  1.2s — confetti burst
 *  1.3s — catch label (if wasCaught) with elastic pop
 *  1.5s — bonus badge (if wasCaught)
 *  1.6s — "عيد" word drops in
 *  1.9s — "مبارك" word drops in
 *  2.1s — stars stagger (3 stars)
 *  2.4s — score counts up from 0
 *  2.9s — buttons slide up from below
 *  3.2s — Eid melody starts
 *
 * Confetti: 2D canvas particle system
 *  • 90 particles, gravity + air resistance + wobble + spin
 *  • Gold/cream/white/warm-red palette
 *  • Respawn from top for continuous rain during victory
 *  • Stops after stopConfetti() call
 */

'use strict';

const VictoryManager = (() => {

  /* ── Confetti config ── */
  const PARTICLE_COUNT = 90;
  const GRAVITY        = 0.22;
  const AIR_RESIST     = 0.985;
  const COLORS = ['#F5C842','#FFE066','#ffffff','#F0A840','#FFD060','#FFCC44','#F8F4EE','#FF8833','#4ADB6C'];

  let confettiCtx    = null;
  let confettiRafId  = null;
  let confettiActive = false;
  let particles      = [];

  /* ── Particle factory ── */
  function makeParticle(canvas) {
    return {
      x:      Math.random() * canvas.width,
      y:      -10 - Math.random() * 80,
      vx:     (Math.random() - 0.5) * 3.6,
      vy:     Math.random() * 2.5 + 1.5,
      rot:    Math.random() * Math.PI * 2,
      rotV:   (Math.random() - 0.5) * 0.18,
      w:      Math.random() * 10 + 6,
      h:      Math.random() * 5 + 3,
      color:  COLORS[Math.floor(Math.random() * COLORS.length)],
      shape:  Math.random() > 0.35 ? 'rect' : 'circle',
      alpha:  1,
      wobble: Math.random() * Math.PI * 2,
      wobbleV: 0.05 + Math.random() * 0.05,
    };
  }

  function spawnBurst(canvas) {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = makeParticle(canvas);
      p.y -= Math.random() * 50; // staggered start heights
      particles.push(p);
    }
  }

  function updateAndDraw(canvas) {
    const ctx = confettiCtx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const h = canvas.height;

    for (const p of particles) {
      p.wobble += p.wobbleV;
      p.vx     += Math.sin(p.wobble) * 0.04;
      p.vy     += GRAVITY;
      p.vx     *= AIR_RESIST;
      p.vy     *= AIR_RESIST;
      p.x      += p.vx;
      p.y      += p.vy;
      p.rot    += p.rotV;

      if (p.y > h * 0.78) p.alpha = Math.max(0, p.alpha - 0.016);

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();

      /* Respawn when faded or off-screen (continuous rain) */
      if ((p.y > h + 20 || p.alpha <= 0) && confettiActive) {
        Object.assign(p, makeParticle(canvas));
      }
    }
  }

  function confettiLoop() {
    if (!confettiActive) {
      if (confettiCtx) {
        const c = confettiCtx.canvas;
        confettiCtx.clearRect(0, 0, c.width, c.height);
      }
      return;
    }
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    updateAndDraw(canvas);
    confettiRafId = requestAnimationFrame(confettiLoop);
  }

  function startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    confettiCtx   = canvas.getContext('2d');
    confettiActive = true;
    spawnBurst(canvas);
    confettiLoop();
  }

  function stopConfetti() {
    confettiActive = false;
    if (confettiRafId) { cancelAnimationFrame(confettiRafId); confettiRafId = null; }
  }

  /* ════════════════════════════════════════════════════════
     STATE — persisted between start() and downloadCard()
     ════════════════════════════════════════════════════════ */
  let savedScore = 0;
  let savedWasCaught = false;
  function animateScore(targetScore) {
    const el  = document.getElementById('victory-score-num');
    const obj = { val: 0 };
    gsap.to(obj, {
      val: targetScore,
      duration: 1.8,
      ease: 'power2.out',
      delay: 0.2,
      onUpdate() { el.textContent = Math.round(obj.val); },
    });
  }

  /* ════════════════════════════════════════════════════════
     CANVAS GREETING CARD EXPORT
     ════════════════════════════════════════════════════════ */
  function downloadCard() {
    try {
      const link = document.createElement('a');
      link.download = 'eid_mubarak_sheep_rush.png';
      link.href = 'greeting_card_template.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (window.showToast) {
        window.showToast('تم تحميل كارت المعايدة بنجاح! 🎉');
      }
    } catch (e) {
      console.error('Download failed', e);
      if (window.showToast) {
        window.showToast('تعذر التحميل، حاول مشاركة اللعبة! 🐑');
      }
    }
  }

  /* ════════════════════════════════════════════════════════
     MAIN SEQUENCE
     ════════════════════════════════════════════════════════ */
  function start(score, wasCaught) {
    wasCaught = !!wasCaught;
    savedScore = score;
    savedWasCaught = wasCaught;

    /* Elements */
    const flashEl     = document.getElementById('victory-flash');
    const buttons     = document.getElementById('victory-buttons-fixed-bottom');
    const screenVictory = document.getElementById('screen-victory');
    const downloadBtn = document.getElementById('btn-download-card');

    /* Toggle Loss/Victory Theme Classes & Labels */
    if (screenVictory) {
      if (wasCaught) {
        screenVictory.classList.remove('loss-theme');
      } else {
        screenVictory.classList.add('loss-theme');
      }
    }

    if (downloadBtn) {
      downloadBtn.style.display = wasCaught ? '' : 'none';
    }

    /* Pre-set initial states */
    gsap.set(buttons, { opacity: 0 });
    gsap.set(buttons, { y: 30 });

    const tl = gsap.timeline();

    /* [0.0] vignette is now pure CSS — no JS needed */
    tl.to({}, { duration: 0.1 }, 0);

    /* [0.6] Camera orbit */
    tl.add(() => {
      if (window.Game && window.Game.scene && window.Game.scene.orbitToTopDown) {
        window.Game.scene.orbitToTopDown(() => {});
      }
    }, 0.5);

    /* [1.0] Shutter flash */
    tl.to(flashEl, {
      opacity: 1, duration: 0.06, ease: 'none',
      onComplete: () => {
        if (window.Game && window.Game.audio) window.Game.audio.playSFX('shutter');
      },
    }, 0.95);
    tl.to(flashEl, { opacity: 0, duration: 0.18, ease: 'power2.in' }, 1.01);

    /* [1.2] Confetti - only if won! */
    if (wasCaught) {
      tl.add(startConfetti, 1.15);
    }

    /* [1.5] Buttons slide up */
    tl.to(buttons, {
      opacity: 1, y: 0,
      duration: 0.6, ease: 'back.out(1.5)',
    }, 1.45);

    /* [2.0] Eid melody - only if won! */
    if (wasCaught) {
      tl.add(() => {
        if (window.Game && window.Game.audio) window.Game.audio.startEidMelody();
      }, 1.9);
    }
  }

  /* ════════════════════════════════════════════════════════
     RESET
     ════════════════════════════════════════════════════════ */
  function reset() {
    stopConfetti();

    const buttons = document.getElementById('victory-buttons-fixed-bottom');
    const screenVictory = document.getElementById('screen-victory');
    const downloadBtn = document.getElementById('btn-download-card');

    if (screenVictory) {
      screenVictory.classList.remove('loss-theme');
    }

    if (downloadBtn) {
      downloadBtn.style.display = '';
    }

    gsap.killTweensOf(buttons);
    gsap.set(buttons, { opacity: 0, y: 30 });
  }

  /* ── Init ── */
  function init() {
    return { start, reset, downloadCard };
  }

  return { init };

})();
