// ═══════════════════════════════════════════════════════════
//  SpiritBlade — Rendering Engine
//  Canvas, particles, audio synthesis, game loop
// ═══════════════════════════════════════════════════════════
window.SB = window.SB || {};

SB.Engine = (function () {
    let canvas, ctx;
    const W = 480, H = 780;          // virtual resolution
    let scale = 1, offsetX = 0, offsetY = 0;
    let lastTime = 0, running = false;

    // ── Shake ───────────────────────────────────────────
    const shake = { x: 0, y: 0, intensity: 0, dur: 0, t: 0 };

    // ── Particles ───────────────────────────────────────
    const particles = [];
    const MAX_P = 250;

    // ── Audio ───────────────────────────────────────────
    let audioCtx = null;

    /* ===================================================
       INIT
       =================================================== */
    function init(id) {
        canvas = document.getElementById(id);
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);

        const initA = () => {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        };
        document.addEventListener('click', initA, { once: true });
        document.addEventListener('touchstart', initA, { once: true });
    }

    function resize() {
        const ww = window.innerWidth, wh = window.innerHeight;
        const aspect = W / H;
        let cw, ch;
        if (ww / wh < aspect) { cw = ww; ch = ww / aspect; }
        else { ch = wh; cw = wh * aspect; }
        canvas.width = W;
        canvas.height = H;
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.style.left = ((ww - cw) / 2) + 'px';
        canvas.style.top = ((wh - ch) / 2) + 'px';
        scale = cw / W;
        offsetX = (ww - cw) / 2;
        offsetY = (wh - ch) / 2;
    }

    /* ===================================================
       DRAWING HELPERS
       =================================================== */
    const draw = {
        clear() {
            ctx.clearRect(0, 0, W, H);
        },

        rect(x, y, w, h, color, a) {
            if (a !== undefined) ctx.globalAlpha = a;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
            if (a !== undefined) ctx.globalAlpha = 1;
        },

        roundedRect(x, y, w, h, r, color, a) {
            if (a !== undefined) ctx.globalAlpha = a;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
            ctx.fill();
            if (a !== undefined) ctx.globalAlpha = 1;
        },

        circle(x, y, r, color, a) {
            if (a !== undefined) ctx.globalAlpha = a;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            if (a !== undefined) ctx.globalAlpha = 1;
        },

        line(x1, y1, x2, y2, color, width, a) {
            if (a !== undefined) ctx.globalAlpha = a;
            ctx.strokeStyle = color;
            ctx.lineWidth = width || 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            if (a !== undefined) ctx.globalAlpha = 1;
        },

        arc(cx, cy, r, start, end, color, width, a) {
            if (a !== undefined) ctx.globalAlpha = a;
            ctx.strokeStyle = color;
            ctx.lineWidth = width || 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(cx, cy, r, start, end);
            ctx.stroke();
            if (a !== undefined) ctx.globalAlpha = 1;
        },

        text(str, x, y, opts) {
            opts = opts || {};
            if (opts.a !== undefined) ctx.globalAlpha = opts.a;
            ctx.fillStyle = opts.color || '#fff';
            ctx.font = (opts.weight || '400') + ' ' + (opts.size || 14) + 'px ' + (opts.font || "'Inter', sans-serif");
            ctx.textAlign = opts.align || 'center';
            ctx.textBaseline = opts.baseline || 'middle';
            if (opts.shadow) {
                ctx.shadowColor = opts.shadow;
                ctx.shadowBlur = opts.shadowBlur || 10;
            }
            ctx.fillText(str, x, y);
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            if (opts.a !== undefined) ctx.globalAlpha = 1;
        },

        gradient(x, y, w, h, c1, c2, vertical) {
            const g = vertical
                ? ctx.createLinearGradient(x, y, x, y + h)
                : ctx.createLinearGradient(x, y, x + w, y);
            g.addColorStop(0, c1);
            g.addColorStop(1, c2);
            ctx.fillStyle = g;
            ctx.fillRect(x, y, w, h);
        },

        bar(x, y, w, h, pct, fg, bg, r) {
            r = r || 3;
            // background
            this.roundedRect(x, y, w, h, r, bg || 'rgba(255,255,255,0.08)');
            // fill
            if (pct > 0) {
                this.roundedRect(x, y, Math.max(r * 2, w * Math.min(1, pct)), h, r, fg);
            }
        }
    };

    /* ===================================================
       PARTICLES
       =================================================== */
    function emitParticles(x, y, count, cfg) {
        cfg = cfg || {};
        for (let i = 0; i < count && particles.length < MAX_P; i++) {
            const angle = cfg.angle != null ? cfg.angle + (Math.random() - 0.5) * (cfg.spread || 1)
                : Math.random() * Math.PI * 2;
            const spd = (cfg.speed || 80) * (0.5 + Math.random() * 0.8);
            particles.push({
                x, y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                size: cfg.size || 2 + Math.random() * 2,
                color: cfg.color || '#f6c742',
                life: cfg.life || 0.6 + Math.random() * 0.4,
                maxLife: cfg.life || 0.6 + Math.random() * 0.4,
                gravity: cfg.gravity || 0,
                friction: cfg.friction || 0.98,
                shrink: cfg.shrink !== false
            });
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.vx *= p.friction;
            p.vy *= p.friction;
            p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) { particles.splice(i, 1); }
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const a = Math.max(0, p.life / p.maxLife);
            const s = p.shrink ? p.size * a : p.size;
            ctx.globalAlpha = a * 0.85;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function clearParticles() { particles.length = 0; }

    /* ===================================================
       SCREEN SHAKE
       =================================================== */
    function triggerShake(intensity, duration) {
        shake.intensity = intensity || 6;
        shake.dur = duration || 0.25;
        shake.t = 0;
    }

    function updateShake(dt) {
        if (shake.t < shake.dur) {
            shake.t += dt;
            const progress = 1 - (shake.t / shake.dur);
            const i = shake.intensity * progress;
            shake.x = (Math.random() - 0.5) * i * 2;
            shake.y = (Math.random() - 0.5) * i * 2;
        } else {
            shake.x = 0; shake.y = 0;
        }
    }

    /* ===================================================
       AUDIO SYNTHESIS (no external files)
       =================================================== */
    function playSound(name) {
        if (!audioCtx) return;
        try {
            switch (name) {
                case 'swing': _noise(0.12, 2200, 0.18); _tone(300, 0.08, 'sawtooth', 0.06); break;
                case 'thrust': _noise(0.08, 3200, 0.15); _tone(500, 0.06, 'square', 0.08); break;
                case 'block': _tone(900, 0.15, 'sine', 0.12); _tone(1350, 0.08, 'sine', 0.06); break;
                case 'hit': _noise(0.18, 900, 0.22); _tone(180, 0.12, 'sawtooth', 0.1); break;
                case 'levelUp':
                    _tone(523, 0.18, 'sine', 0.1);
                    setTimeout(() => _tone(659, 0.18, 'sine', 0.1), 120);
                    setTimeout(() => _tone(784, 0.25, 'sine', 0.12), 240);
                    break;
                case 'ghostActivate':
                    _tone(120, 0.8, 'sine', 0.12);
                    _tone(80, 1.2, 'sawtooth', 0.05);
                    _noise(0.6, 400, 0.06);
                    break;
                case 'victory':
                    _tone(523, 0.15, 'sine', 0.1);
                    setTimeout(() => _tone(659, 0.15, 'sine', 0.1), 100);
                    setTimeout(() => _tone(784, 0.15, 'sine', 0.1), 200);
                    setTimeout(() => _tone(1047, 0.35, 'sine', 0.12), 300);
                    break;
                case 'defeat':
                    _tone(300, 0.4, 'sine', 0.1);
                    setTimeout(() => _tone(200, 0.6, 'sine', 0.08), 300);
                    setTimeout(() => _tone(120, 0.8, 'sine', 0.06), 600);
                    break;
                case 'possess':
                    _tone(200, 0.5, 'sine', 0.1);
                    _tone(400, 0.4, 'sine', 0.08);
                    _noise(0.3, 600, 0.05);
                    break;
                case 'step':
                    _noise(0.04, 1800, 0.06);
                    break;
            }
        } catch (e) { /* swallow audio errors gracefully */ }
    }

    function _tone(freq, dur, type, vol) {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(vol || 0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + dur + 0.01);
    }

    function _noise(dur, filterFreq, vol) {
        const sr = audioCtx.sampleRate;
        const len = sr * dur;
        const buf = audioCtx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const flt = audioCtx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = filterFreq || 2000;
        const gain = audioCtx.createGain();
        const now = audioCtx.currentTime;
        gain.gain.setValueAtTime(vol || 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        src.connect(flt).connect(gain).connect(audioCtx.destination);
        src.start(now);
    }

    /* ===================================================
       GAME LOOP
       =================================================== */
    function start() {
        if (running) return;
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(loop);
    }

    function stop() { running = false; }

    function loop(ts) {
        if (!running) return;
        const dt = Math.min((ts - lastTime) / 1000, 0.05);
        lastTime = ts;

        // Update
        updateShake(dt);
        updateParticles(dt);
        if (SB.Game && SB.Game.update) SB.Game.update(dt);

        // Draw
        ctx.save();
        ctx.translate(shake.x, shake.y);
        draw.clear();
        if (SB.Game && SB.Game.draw) SB.Game.draw(ctx, W, H);
        drawParticles();
        ctx.restore();

        requestAnimationFrame(loop);
    }

    /* ===================================================
       MATH UTILITIES
       =================================================== */
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    /* ===================================================
       PUBLIC API
       =================================================== */
    return {
        init, start, stop, resize,
        draw,
        particles: { emit: emitParticles, clear: clearParticles },
        shake: triggerShake,
        audio: { play: playSound },
        lerp, clamp, easeOutCubic, easeInOutQuad,
        get canvas() { return canvas; },
        get ctx() { return ctx; },
        W, H, scale: () => scale
    };
})();
