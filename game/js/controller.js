/**
 * controller.js — Royal Ram: Eid Rush
 * Touch/Swipe Input Manager — UPGRADED v2
 *
 * Fixes:
 *  • BUG #6: touchstart/touchend passive:false + e.preventDefault() on touchstart
 *  • touchcancel handler for swipe-away on iOS
 *  • Early input prediction on touchmove (fires at 70% threshold)
 *  • Screen-relative swipe thresholds with resize listener
 *
 * Key features:
 *  • Velocity-based gesture recognition
 *  • Dead-zone to prevent accidental diagonal triggers
 *  • First-gesture callback for swipe-hint dismissal
 *  • Keyboard support for desktop testing (Arrow keys)
 *  • Prevents scroll/bounce on mobile during gameplay
 */

'use strict';

const ControllerManager = (() => {

  /* ── Constants — screen-relative (recalculated on resize) ── */
  let SWIPE_THRESHOLD_X  = Math.min(window.innerWidth  * 0.08, 40);
  let SWIPE_THRESHOLD_Y  = Math.min(window.innerHeight * 0.06, 50);
  const MAX_DIAGONAL_RATIO  = 1.4;
  const MIN_SWIPE_DURATION  = 15;   // ms — faster than this = accidental
  const MAX_SWIPE_DURATION  = 500;  // ms — slower = scroll intent

  /* ── State ── */
  let enabled = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let firstGestureFired = false;
  let firstGestureCallback = null;
  let earlyFired = false; // track if we already early-fired on this touch

  /* ── Input Buffer State ── */
  let bufferedGesture = null;
  let bufferTimestamp = 0;
  const BUFFER_WINDOW = 180; // ms

  const target = document.documentElement;

  /* Update thresholds on orientation/resize */
  window.addEventListener('resize', () => {
    SWIPE_THRESHOLD_X = Math.min(window.innerWidth  * 0.08, 40);
    SWIPE_THRESHOLD_Y = Math.min(window.innerHeight * 0.06, 50);
  }, { passive: true });

  /* ══════════════════════════════════════════════════════
     GESTURE RECOGNITION
     ══════════════════════════════════════════════════════ */
  function onTouchStart(e) {
    if (!enabled) return;
    e.preventDefault(); // Fix: prevents 300ms delay on iOS Safari
    const t = e.changedTouches[0];
    touchStartX    = t.clientX;
    touchStartY    = t.clientY;
    touchStartTime = performance.now();
    earlyFired     = false;
  }

  function onTouchEnd(e) {
    if (!enabled) return;
    e.preventDefault(); // Fix: consistent with touchstart

    const t  = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const dt = performance.now() - touchStartTime;

    /* TAP detection (short press, minimal movement) */
    if (dt < 250 && Math.abs(dx) < 25 && Math.abs(dy) < 25) {
      earlyFired = false; // Reset early fired flag
      const screenW = window.innerWidth;
      if (t.clientX < screenW * 0.35) {
        fireGesture('left');
        return;
      }
      if (t.clientX > screenW * 0.65) {
        fireGesture('right');
        return;
      }
      return; // center tap = ignore
    }

    if (earlyFired) { earlyFired = false; return; } // already handled

    /* Duration gate for swipes */
    if (dt < MIN_SWIPE_DURATION || dt > MAX_SWIPE_DURATION) return;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    /* Classify gesture */
    if (absDy > SWIPE_THRESHOLD_Y && dy < 0 && absDx / absDy < 1.0) {
      fireGesture('up');
    } else if (absDx > SWIPE_THRESHOLD_X && absDy / absDx < 0.7) {
      if (dx < 0) fireGesture('left');
      else         fireGesture('right');
    }
  }

  /* BUG #6 FIX: Handle touchcancel so gestures don't get stuck */
  function onTouchCancel(e) {
    // Reset touch state — prevents stuck swipe on iOS when finger leaves screen
    touchStartX    = 0;
    touchStartY    = 0;
    touchStartTime = 0;
    earlyFired     = false;
  }

  /* Early swipe prediction — fire at 70% of threshold before touchend */
  function onTouchMove(e) {
    if (!enabled) return;
    e.preventDefault(); // prevent scroll during gameplay

    if (earlyFired) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const dt = performance.now() - touchStartTime;

    if (dt < MIN_SWIPE_DURATION) return; // too fast, wait

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    /* Early horizontal detection at 70% of threshold */
    if (absDx > SWIPE_THRESHOLD_X * 0.70 && absDy / absDx < 0.7) {
      earlyFired = true;
      if (dx < 0) fireGesture('left');
      else         fireGesture('right');
      // Reset X reference so a continuing drag doesn't re-trigger
      touchStartX = t.clientX;
    }
  }

  /* ── Fire to app.js globals with input buffering ── */
  function fireGesture(direction) {
    if (!firstGestureFired) {
      firstGestureFired = true;
      if (firstGestureCallback) firstGestureCallback();
    }

    if (window.Game && window.Game.isRunning && window.Game.characters && window.Game.characters.getPlayerState) {
      const state = window.Game.characters.getPlayerState();
      if (state !== 'ground') {
        bufferedGesture = direction;
        bufferTimestamp = performance.now();
        return;
      }
    }

    switch (direction) {
      case 'left':  if (window.onSwipeLeft)  window.onSwipeLeft();  break;
      case 'right': if (window.onSwipeRight) window.onSwipeRight(); break;
      case 'up':    if (window.onSwipeUp)    window.onSwipeUp();    break;
    }
  }

  function checkBufferedGesture() {
    if (!bufferedGesture) return;
    const now = performance.now();
    if (now - bufferTimestamp <= BUFFER_WINDOW) {
      const gesture = bufferedGesture;
      bufferedGesture = null;
      fireGesture(gesture);
    } else {
      bufferedGesture = null;
    }
  }

  /* ══════════════════════════════════════════════════════
     KEYBOARD (desktop preview / testing)
     ══════════════════════════════════════════════════════ */
  function onKeyDown(e) {
    if (!enabled) return;
    switch (e.key) {
      case 'ArrowLeft':  e.preventDefault(); fireGesture('left');  break;
      case 'ArrowRight': e.preventDefault(); fireGesture('right'); break;
      case 'ArrowUp':
      case ' ':          e.preventDefault(); fireGesture('up');    break;
    }
  }

  /* ══════════════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════════════ */
  function enable() {
    enabled = true;
    firstGestureFired = false;
    bufferedGesture = null;
    bufferTimestamp = 0;
    earlyFired = false;
  }

  function disable() {
    enabled = false;
  }

  function onFirstGesture(cb) {
    firstGestureCallback = cb;
  }

  function init() {
    /* BUG #6 FIX: passive:false on touchstart and touchend for iOS */
    target.addEventListener('touchstart',  onTouchStart,  { passive: false });
    target.addEventListener('touchend',    onTouchEnd,    { passive: false });
    target.addEventListener('touchmove',   onTouchMove,   { passive: false });
    target.addEventListener('touchcancel', onTouchCancel, { passive: true  });
    document.addEventListener('keydown',   onKeyDown);

    return { enable, disable, onFirstGesture, checkBufferedGesture };
  }

  return { init, checkBufferedGesture };

})();
