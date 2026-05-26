/**
 * audio.js — Royal Ram: Eid Rush — UPGRADED v2
 * Web Audio API AudioManager
 *
 * Upgrades:
 *  • Dynamic BPM (updatePercussionTempo) — lerps BPM 118→165 with game time
 *  • Audio ducking (duck) — dips master gain on important events
 *  • Positional audio (playBaaaPositional) — stereo panning by sheep lane
 */

'use strict';

const AudioManager = (() => {

  /* ── Internal state ── */
  let ctx = null;
  let masterGain = null;
  let percBPM    = 118;
  let percActive = false;
  let percTimer  = null;
  let nextBeat   = 0;
  let melodyActive = false;
  let melodyTimer  = null;
  let ambienceActive = false;
  let ambienceNodes = [];

  const LOOKAHEAD_MS  = 25;
  const SCHEDULE_SEC  = 0.15;

  /* ── Lazy AudioContext init ── */
  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.6, ctx.currentTime);
    masterGain.connect(ctx.destination);
  }

  function makeGain(value) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(value, ctx.currentTime);
    g.connect(masterGain);
    return g;
  }

  function applyEnvelope(gainNode, peakVal, attackSec, decaySec, startTime) {
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(peakVal, startTime + attackSec);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + attackSec + decaySec);
  }

  /* ══════════════════════════════════════════════════════
     TABLA — bayan (low bass stroke)
     ══════════════════════════════════════════════════════ */
  function playBayan(time, vel) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, time);
    osc.frequency.exponentialRampToValueAtTime(55, time + 0.12);
    env.connect(masterGain);
    osc.connect(env);
    applyEnvelope(env, vel * 0.9, 0.001, 0.25, time);
    osc.start(time);
    osc.stop(time + 0.30);

    const click = ctx.createOscillator();
    const clickEnv = ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(320, time);
    clickEnv.connect(masterGain);
    click.connect(clickEnv);
    applyEnvelope(clickEnv, vel * 0.3, 0.0005, 0.02, time);
    click.start(time);
    click.stop(time + 0.03);
  }

  function playTun(time, vel) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, time);
    osc.frequency.exponentialRampToValueAtTime(160, time + 0.15);
    env.connect(masterGain);
    osc.connect(env);
    applyEnvelope(env, vel * 0.55, 0.001, 0.22, time);
    osc.start(time);
    osc.stop(time + 0.28);
  }

  function playDeff(time, vel) {
    const bufSize = ctx.sampleRate * 0.05;
    const buffer  = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data    = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 900;
    bpf.Q.value = 3;
    const noiseEnv = ctx.createGain();
    src.connect(bpf);
    bpf.connect(noiseEnv);
    noiseEnv.connect(masterGain);
    applyEnvelope(noiseEnv, vel * 0.5, 0.001, 0.08, time);
    src.start(time);
    src.stop(time + 0.10);

    const ring = ctx.createOscillator();
    const ringEnv = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(1800, time);
    ringEnv.connect(masterGain);
    ring.connect(ringEnv);
    applyEnvelope(ringEnv, vel * 0.12, 0.001, 0.18, time);
    ring.start(time);
    ring.stop(time + 0.22);
  }

  /* ══════════════════════════════════════════════════════
     PERCUSSION PATTERN
     ══════════════════════════════════════════════════════ */
  const PATTERN = [
    { type: 'bayan', vel: 1.0 },
    { type: 'rest',  vel: 0 },
    { type: 'deff',  vel: 0.7 },
    { type: 'tun',   vel: 0.6 },

    { type: 'bayan', vel: 0.9 },
    { type: 'deff',  vel: 0.5 },
    { type: 'rest',  vel: 0 },
    { type: 'tun',   vel: 0.7 },

    { type: 'bayan', vel: 1.0 },
    { type: 'rest',  vel: 0 },
    { type: 'deff',  vel: 0.8 },
    { type: 'bayan', vel: 0.5 },

    { type: 'tun',   vel: 0.7 },
    { type: 'deff',  vel: 0.9 },
    { type: 'bayan', vel: 0.8 },
    { type: 'deff',  vel: 0.6 },
  ];

  let beatIndex = 0;

  function scheduleBeats() {
    if (!percActive) return;
    const secPerBeat = 60 / percBPM;
    const secPer16th = secPerBeat / 4;

    while (nextBeat < ctx.currentTime + SCHEDULE_SEC) {
      const beat = PATTERN[beatIndex % PATTERN.length];
      if (beat.type === 'bayan')  playBayan(nextBeat, beat.vel);
      else if (beat.type === 'tun')   playTun(nextBeat, beat.vel);
      else if (beat.type === 'deff')  playDeff(nextBeat, beat.vel);

      nextBeat += secPer16th;
      beatIndex++;
    }

    percTimer = setTimeout(scheduleBeats, LOOKAHEAD_MS);
  }

  function startPercussion() {
    ensureCtx();
    if (percActive) return;
    percActive = true;
    beatIndex  = 0;
    nextBeat   = ctx.currentTime + 0.05;
    scheduleBeats();
  }

  function stopPercussion() {
    percActive = false;
    clearTimeout(percTimer);
    percTimer = null;
  }

  function accelerateTempo() {
    percBPM = Math.min(200, percBPM + 8);
  }

  /* ── NEW: Dynamic BPM tied to game timeLeft ── */
  function updatePercussionTempo(timeLeft) {
    if (!percActive) return;
    const progress = Math.max(0, Math.min(1, 1 - (timeLeft / 20)));
    const newBPM   = Math.round(118 + (165 - 118) * progress);
    if (Math.abs(newBPM - percBPM) >= 3) {
      percBPM = newBPM;
    }
  }

  /* ── NEW: Audio ducking — dip then recover ── */
  function duck(duration) {
    if (!ctx || !masterGain) return;
    duration = duration || 0.3;
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0.25, now + 0.06);
    masterGain.gain.linearRampToValueAtTime(0.6,  now + duration);
  }

  /* ══════════════════════════════════════════════════════
     SHEEP BAAA BLEAT
     ══════════════════════════════════════════════════════ */
  function playBaaa(isScream) {
    isScream = !!isScream;
    ensureCtx();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const vib = ctx.createOscillator();
    const vibGain = ctx.createGain();
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    if (isScream) {
      osc.frequency.setValueAtTime(680, t);
      osc.frequency.setValueAtTime(650, t + 0.08);
      osc.frequency.linearRampToValueAtTime(320, t + 0.95);
    } else {
      osc.frequency.setValueAtTime(450, t);
      osc.frequency.setValueAtTime(420, t + 0.05);
      osc.frequency.linearRampToValueAtTime(240, t + 0.6);
    }

    vib.type = 'sine';
    vib.frequency.setValueAtTime(isScream ? 16 : 12, t);
    vibGain.gain.setValueAtTime(isScream ? 45 : 22, t);
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isScream ? 1600 : 1250, t);
    filter.frequency.exponentialRampToValueAtTime(isScream ? 900 : 700, t + (isScream ? 0.9 : 0.6));
    filter.Q.setValueAtTime(isScream ? 1.8 : 2.2, t);

    env.connect(masterGain);
    osc.connect(filter);
    filter.connect(env);
    applyEnvelope(env, isScream ? 0.75 : 0.45, 0.015, isScream ? 0.95 : 0.6, t);

    const osc2 = ctx.createOscillator();
    const env2 = ctx.createGain();
    const filter2 = ctx.createBiquadFilter();

    osc2.type = 'square';
    if (isScream) {
      osc2.frequency.setValueAtTime(340, t);
      osc2.frequency.linearRampToValueAtTime(160, t + 0.9);
    } else {
      osc2.frequency.setValueAtTime(225, t);
      osc2.frequency.linearRampToValueAtTime(120, t + 0.55);
    }

    vibGain.connect(osc2.frequency);

    filter2.type = 'bandpass';
    filter2.frequency.setValueAtTime(isScream ? 2200 : 1600, t);
    filter2.frequency.exponentialRampToValueAtTime(isScream ? 1200 : 900, t + (isScream ? 0.9 : 0.55));
    filter2.Q.setValueAtTime(isScream ? 2.2 : 2.8, t);

    env2.connect(masterGain);
    osc2.connect(filter2);
    filter2.connect(env2);
    applyEnvelope(env2, isScream ? 0.25 : 0.12, 0.02, isScream ? 0.85 : 0.5, t);

    osc.start(t);  osc.stop(t + (isScream ? 1.05 : 0.7));
    osc2.start(t); osc2.stop(t + (isScream ? 1.0 : 0.65));
    vib.start(t);  vib.stop(t + (isScream ? 1.05 : 0.7));
  }

  /* ── NEW: Positional bleat with stereo pan based on lane ── */
  function playBaaaPositional(sheepLane) {
    ensureCtx();
    // sheepLane: 0 = left, 1 = center, 2 = right
    const pan = (sheepLane - 1) * 0.7; // -0.7, 0, +0.7

    const panner = ctx.createStereoPanner
      ? ctx.createStereoPanner()
      : null;

    if (!panner) {
      // Fallback to regular bleat if StereoPanner not supported
      playBaaa(false);
      return;
    }

    panner.pan.setValueAtTime(pan, ctx.currentTime);
    panner.connect(masterGain);

    // Synthesize into panner instead of masterGain directly
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, t);
    osc.frequency.setValueAtTime(420, t + 0.05);
    osc.frequency.linearRampToValueAtTime(240, t + 0.6);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1250, t);
    filter.frequency.exponentialRampToValueAtTime(700, t + 0.6);
    filter.Q.setValueAtTime(2.2, t);

    osc.connect(filter);
    filter.connect(env);
    env.connect(panner);
    applyEnvelope(env, 0.45, 0.015, 0.6, t);
    osc.start(t);
    osc.stop(t + 0.7);
  }

  /* ══════════════════════════════════════════════════════
     SFX SOUNDS
     ══════════════════════════════════════════════════════ */
  function playSFX(name) {
    ensureCtx();
    const t = ctx.currentTime;

    switch (name) {

      case 'jump': {
        const o = ctx.createOscillator();
        const e = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(660, t + 0.18);
        e.connect(masterGain);
        o.connect(e);
        applyEnvelope(e, 0.25, 0.01, 0.22, t);
        o.start(t); o.stop(t + 0.25);
        break;
      }

      case 'bump': {
        const o = ctx.createOscillator();
        const e = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(80, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
        e.connect(masterGain);
        o.connect(e);
        applyEnvelope(e, 0.8, 0.001, 0.18, t);
        o.start(t); o.stop(t + 0.22);

        const o2 = ctx.createOscillator();
        const e2  = ctx.createGain();
        o2.type = 'square';
        o2.frequency.setValueAtTime(180, t);
        o2.frequency.exponentialRampToValueAtTime(60, t + 0.04);
        e2.connect(masterGain);
        o2.connect(e2);
        applyEnvelope(e2, 0.2, 0.001, 0.05, t);
        o2.start(t); o2.stop(t + 0.07);
        break;
      }

      case 'trip': {
        [0, 0.06, 0.12].forEach((offset, i) => {
          const o = ctx.createOscillator();
          const e = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(300 - i * 40, t + offset);
          e.connect(masterGain);
          o.connect(e);
          applyEnvelope(e, 0.3, 0.001, 0.06, t + offset);
          o.start(t + offset); o.stop(t + offset + 0.08);
        });
        break;
      }

      case 'shutter': {
        const bufSize = Math.floor(ctx.sampleRate * 0.008);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d   = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hpf = ctx.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.value = 2200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(1.8, t);
        src.connect(hpf);
        hpf.connect(g);
        g.connect(masterGain);
        src.start(t);

        const o = ctx.createOscillator();
        const e = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(1200, t);
        e.connect(masterGain);
        o.connect(e);
        applyEnvelope(e, 0.15, 0.0001, 0.01, t);
        o.start(t); o.stop(t + 0.015);
        break;
      }

      case 'swipe': {
        const o = ctx.createOscillator();
        const e = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(320, t);
        o.frequency.exponentialRampToValueAtTime(140, t + 0.12);
        e.connect(masterGain);
        o.connect(e);
        applyEnvelope(e, 0.18, 0.005, 0.10, t);
        o.start(t); o.stop(t + 0.13);
        break;
      }

      case 'dodge': {
        const notes = [1046.50, 1318.51, 1567.98];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const env = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + idx * 0.02);
          env.connect(masterGain);
          osc.connect(env);
          applyEnvelope(env, 0.08, 0.002, 0.45, t + idx * 0.02);
          osc.start(t + idx * 0.02);
          osc.stop(t + idx * 0.02 + 0.5);
        });
        break;
      }

      case 'milestone': {
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const env = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.015, t + 0.8);
          env.connect(masterGain);
          osc.connect(env);
          env.gain.setValueAtTime(0, t);
          env.gain.linearRampToValueAtTime(0.12, t + 0.08);
          env.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
          osc.start(t);
          osc.stop(t + 0.95);
        });
        break;
      }

      case 'land': {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(85, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
        env.connect(masterGain);
        osc.connect(env);
        applyEnvelope(env, 0.55, 0.001, 0.12, t);
        osc.start(t); osc.stop(t + 0.15);
        break;
      }

      case 'combo': {
        /* Quick ascending arpeggio for combo hits */
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, idx) => {
          const o = ctx.createOscillator();
          const e = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, t + idx * 0.06);
          e.connect(masterGain);
          o.connect(e);
          applyEnvelope(e, 0.06, 0.005, 0.18, t + idx * 0.06);
          o.start(t + idx * 0.06);
          o.stop(t + idx * 0.06 + 0.22);
        });
        break;
      }
    }
  }

  /* ══════════════════════════════════════════════════════
     ATMOSPHERIC DESERT DRONE & WIND
     ══════════════════════════════════════════════════════ */
  function playAmbience() {
    ensureCtx();
    if (ambienceActive) return;
    ambienceActive = true;

    const t = ctx.currentTime;

    const droneOsc1 = ctx.createOscillator();
    const droneOsc2 = ctx.createOscillator();
    const droneGain = ctx.createGain();

    droneOsc1.type = 'sine';
    droneOsc1.frequency.setValueAtTime(55, t);
    droneOsc2.type = 'sine';
    droneOsc2.frequency.setValueAtTime(57.5, t);

    droneGain.gain.setValueAtTime(0, t);
    droneGain.gain.linearRampToValueAtTime(0.12, t + 1.5);

    droneOsc1.connect(droneGain);
    droneOsc2.connect(droneGain);
    droneGain.connect(masterGain);

    droneOsc1.start(t);
    droneOsc2.start(t);

    ambienceNodes.push(droneOsc1, droneOsc2, droneGain);

    try {
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.8;

      const windGain = ctx.createGain();
      windGain.gain.setValueAtTime(0, t);
      windGain.gain.linearRampToValueAtTime(0.05, t + 2.0);

      noise.connect(filter);
      filter.connect(windGain);
      windGain.connect(masterGain);

      noise.start(t);

      ambienceNodes.push(noise, filter, windGain);

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.08, t);

      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(220, t);

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      filter.frequency.setValueAtTime(450, t);

      lfo.start(t);
      ambienceNodes.push(lfo, lfoGain);
    } catch (e) {
      console.warn('Could not start wind synth:', e);
    }
  }

  function stopAmbience() {
    if (!ambienceActive) return;
    ambienceActive = false;

    const t = ctx.currentTime;
    const stopNodes = [];

    ambienceNodes.forEach(node => {
      if (node.gain) {
        node.gain.setValueAtTime(node.gain.value, t);
        node.gain.linearRampToValueAtTime(0.0001, t + 0.8);
      } else if (node.stop) {
        stopNodes.push(node);
      }
    });

    setTimeout(() => {
      stopNodes.forEach(n => { try { n.stop(); } catch(e){} });
      ambienceNodes = [];
    }, 900);
  }

  /* ══════════════════════════════════════════════════════
     FOOTSTEPS
     ══════════════════════════════════════════════════════ */
  function playFootstep(isButcher) {
    if (!ctx || ambienceActive === false) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    if (isButcher) {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.05);
      applyEnvelope(env, 0.05, 0.001, 0.04, t);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.03);
      applyEnvelope(env, 0.035, 0.001, 0.03, t);
    }

    env.connect(masterGain);
    osc.connect(env);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  /* ══════════════════════════════════════════════════════
     EID MELODY
     ══════════════════════════════════════════════════════ */
  const MELODY_NOTES = [
    261.63, 293.66, 329.63, 392.00, 440.00,
    523.25, 440.00, 392.00,
    329.63, 261.63, 293.66, 392.00,
  ];
  let melodyNoteIndex = 0;

  function scheduleMelodyNote() {
    if (!melodyActive) return;
    const t = ctx.currentTime;
    const freq = MELODY_NOTES[melodyNoteIndex % MELODY_NOTES.length];

    const o1 = ctx.createOscillator();
    const e1 = ctx.createGain();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(freq, t);
    e1.connect(masterGain);
    o1.connect(e1);
    e1.gain.setValueAtTime(0, t);
    e1.gain.linearRampToValueAtTime(0.18, t + 0.08);
    e1.gain.setValueAtTime(0.18, t + 0.3);
    e1.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o1.start(t); o1.stop(t + 1.0);

    const o2 = ctx.createOscillator();
    const e2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 2, t);
    e2.connect(masterGain);
    o2.connect(e2);
    e2.gain.setValueAtTime(0, t);
    e2.gain.linearRampToValueAtTime(0.05, t + 0.12);
    e2.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o2.start(t); o2.stop(t + 0.75);

    melodyNoteIndex++;
    const interval = melodyNoteIndex % 4 === 0 ? 700 : 420;
    melodyTimer = setTimeout(scheduleMelodyNote, interval);
  }

  function startEidMelody() {
    ensureCtx();
    if (melodyActive) return;
    melodyActive    = true;
    melodyNoteIndex = 0;

    masterGain.gain.setValueAtTime(0.1, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 1.5);

    setTimeout(scheduleMelodyNote, 300);
  }

  function stopEidMelody() {
    melodyActive = false;
    clearTimeout(melodyTimer);
  }

  function stopAll() {
    stopPercussion();
    stopEidMelody();
    stopAmbience();
    percBPM = 118;
    if (ctx && masterGain) {
      masterGain.gain.setValueAtTime(0.6, ctx.currentTime);
    }
  }

  /* ── Public API ── */
  function init() {
    return {
      startPercussion,
      stopPercussion,
      accelerateTempo,
      updatePercussionTempo,
      duck,
      playBaaa,
      playBaaaPositional,
      playSFX,
      startEidMelody,
      stopEidMelody,
      playAmbience,
      stopAmbience,
      playFootstep,
      stopAll,
    };
  }

  return { init };

})();
