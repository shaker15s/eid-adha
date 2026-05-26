/**
 * loader.js — Royal Ram: Eid Rush v2
 * Cinematic 3.4s Loader Sequence
 *
 * Timeline:
 *  0.0s  — Glow blob fades in (radial warmth)
 *  0.5s  — "ع" bounces in with elastic overshoot (Amiri font)
 *  1.1s  — "id" slides from right to snap alongside "ع"
 *  1.4s  — "MUBARAK" chars stagger in one by one from below
 *  1.95s — Sheep SVG fades in, paths draw (stroke-dashoffset)
 *  2.4s  — Progress bar fills
 *  2.7s  — Status text typewriter: "جاري تحضير المطاردة…"
 *  3.2s  — All elements fade out → callback fires
 *
 * Professional touches:
 *  • getTotalLength() measured at runtime — path draw always correct
 *  • Typewriter uses setTimeout recursion (no jank on low-end)
 *  • SVG fade + path draw are separate so they compound
 *  • Progress bar easing: power1.inOut feels "real"
 */

'use strict';

const LoaderManager = (() => {

  const TOTAL_MS      = 3400;
  let onCompleteCb    = null;
  let typeTimer       = null;

  function init() {
    return { start };
  }

  function start(onComplete) {
    onCompleteCb = onComplete;
    runSequence();
  }

  /* ════════════════════════════════════════════════════════
     FULL SEQUENCE
     ════════════════════════════════════════════════════════ */
  function runSequence() {
    const screen   = document.getElementById('screen-loader');
    const glow     = document.getElementById('loader-glow');
    const ain      = document.getElementById('loader-ain');
    const idLatin  = document.getElementById('loader-id');
    const muChars  = document.querySelectorAll('.mubarak-char');
    const svgWrap  = document.getElementById('loader-sheep-wrap');
    const footer   = document.getElementById('loader-footer');
    const progFill = document.getElementById('loader-progress-fill');
    const statusEl = document.getElementById('loader-status-text');

    /* ── Master GSAP timeline ── */
    const tl = gsap.timeline();

    /* [0.0] Glow warmth */
    tl.to(glow, {
      opacity: 1,
      duration: 0.9,
      ease: 'power2.out',
    }, 0);

    /* [0.5] "ع" elastic entrance */
    tl.to(ain, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 1.1,
      ease: 'elastic.out(1, 0.55)',
    }, 0.4);

    /* [1.1] "id" slides in from right */
    tl.to(idLatin, {
      opacity: 1,
      x: 0,
      duration: 0.5,
      ease: 'power3.out',
    }, 1.0);

    /* [1.4] MUBARAK chars stagger from below */
    tl.to(muChars, {
      opacity: 1,
      y: 0,
      duration: 0.52,
      ease: 'power2.out',
      stagger: { each: 0.07, from: 'start' },
    }, 1.3);

    /* [1.95] Premium Ram Image appears with scale bounce */
    gsap.set(svgWrap, { scale: 0.8, opacity: 0 });
    tl.to(svgWrap, {
      opacity: 1,
      scale: 1,
      duration: 0.8,
      ease: 'back.out(1.5)',
    }, 1.85);

    /* [2.4] Footer appears */
    tl.to(footer, {
      opacity: 1,
      duration: 0.4,
      ease: 'power2.out',
    }, 2.3);

    /* [2.4] Progress bar fills */
    tl.to(progFill, {
      width: '100%',
      duration: (TOTAL_MS / 1000) - 0.8,
      ease: 'power1.inOut',
    }, 0.4);

    /* [2.7] Typewriter status text */
    tl.add(() => {
      typewriteText(statusEl, 'جاري تحضير المطاردة…', 62);
    }, 2.6);

    /* [3.2] Fade out → callback */
    tl.to(screen, {
      opacity: 0,
      duration: 0.65,
      ease: 'power2.inOut',
      onComplete: () => {
        screen.classList.remove('active');
        screen.style.opacity = '';
        clearTimeout(typeTimer);
        if (onCompleteCb) onCompleteCb();
      },
    }, TOTAL_MS / 1000 - 0.25);
  }

  /* ════════════════════════════════════════════════════════
     TYPEWRITER UTILITY
     ════════════════════════════════════════════════════════ */
  function typewriteText(el, text, intervalMs) {
    if (!el) return;
    el.textContent = '';
    let i = 0;
    const chars = [...text]; // Unicode-safe

    function next() {
      if (i < chars.length) {
        el.textContent += chars[i++];
        typeTimer = setTimeout(next, intervalMs);
      }
    }
    next();
  }

  return { init };

})();
