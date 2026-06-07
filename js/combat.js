// ═══════════════════════════════════════════════════════════
//  SpiritBlade — Combat System
//  Fighters, AI, hit detection, combat rendering
// ═══════════════════════════════════════════════════════════
window.SB = window.SB || {};

SB.Combat = (function () {
    const D = SB.DATA;
    const E = SB.Engine;

    /* ===================================================
       FIGHTER FACTORY
       =================================================== */
    function createFighter(opts) {
        const s = opts.isBoss ? D.bossStats(opts.level) : D.stats(opts.level);
        return {
            step: opts.step || 1,
            x: 0, y: 0,
            facing: opts.facing || 1,

            hp: s.maxHp, maxHp: s.maxHp,
            atk: s.atk, def: s.def,
            level: opts.level || 1,

            state: 'idle',        // idle | attacking | blocking | hit | dead
            action: null,         // swing | thrust
            actionTimer: 0,
            actionDur: 0,
            hitTimer: 0,

            isPlayer: !!opts.isPlayer,
            isGhost: !!opts.isGhost,
            isBoss: !!opts.isBoss,
            isSelfFight: !!opts.isSelfFight,

            bodyColor: opts.bodyColor || (opts.isPlayer ? D.C.playerBody : D.C.enemyBody),
            armorColor: opts.armorColor || (opts.isPlayer ? D.C.playerArmor : D.C.enemyArmor),

            aiTimer: 0.6 + Math.random() * 0.4,
            aiTelegraph: D.AI_TELEGRAPH[Math.min((opts.level || 1) - 1, 9)],
            aiBlockChance: D.AI_BLOCK_CHANCE[Math.min((opts.level || 1) - 1, 9)],
            aiAggression: D.AI_AGGRESSION[Math.min((opts.level || 1) - 1, 9)],

            breathe: Math.random() * 6.28,
            swordAngle: 0
        };
    }

    /* ===================================================
       SCENE  —  manages one fight
       =================================================== */
    const scene = {
        player: null, enemy: null,
        state: 'idle',          // idle | intro | fighting | win | lose | timeout
        timer: 0, maxTime: 0,
        isBoss: false, isGhost: false,
        introTimer: 0,
        resultShown: false,
        comboBuffer: [], comboTimer: 0,
        dmgNums: [],
        playerHit: false,       // flag for game.js damage-flash

        /* ── lifecycle ──────────────────────────────── */
        init(p, e, opts) {
            this.player = p; this.enemy = e;
            this.state = 'intro'; this.introTimer = 1.6;
            this.timer = opts.maxTime || D.FIGHT_TIME_NORMAL;
            this.maxTime = this.timer;
            this.isBoss = !!opts.isBoss;
            this.isGhost = !!opts.isGhost;
            this.resultShown = false;
            this.comboBuffer = []; this.comboTimer = 0;
            this.dmgNums = [];
            this.playerHit = false;
            p.step = 1; e.step = D.ARENA_STEPS - 1;
            p.facing = 1; e.facing = -1;
            E.particles.clear();
        },

        /* ── update ─────────────────────────────────── */
        update(dt) {
            if (this.state === 'intro') {
                this.introTimer -= dt;
                if (this.introTimer <= 0) this.state = 'fighting';
                this._animateFighters(dt);
                return { state: 'intro' };
            }
            if (this.state !== 'fighting') return { state: this.state };

            this.timer -= dt;
            if (this.timer <= 0) { this.state = 'timeout'; return { state: 'timeout' }; }

            this._animateFighters(dt);
            this._updateFighter(this.player, dt);
            this._updateFighter(this.enemy, dt);
            this._runAI(dt);

            if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.comboBuffer = []; }

            if (this.player.hp <= 0) { this.player.state = 'dead'; this.state = 'lose'; E.audio.play('defeat'); return { state: 'lose' }; }
            if (this.enemy.hp <= 0) {
                this.enemy.state = 'dead'; this.state = 'win'; E.audio.play('victory');
                E.particles.emit(this.enemy.x, this.enemy.y - 40, 35, { color: '#f6c742', speed: 160, life: 1.2, gravity: -60 });
                return { state: 'win' };
            }
            return { state: 'fighting' };
        },

        _animateFighters(dt) {
            [this.player, this.enemy].forEach(f => {
                if (!f) return;
                f.breathe += dt * 2.5;
                const arenaL = (E.W - D.ARENA_STEPS * D.STEP_SIZE) / 2;
                f.x = arenaL + f.step * D.STEP_SIZE;
                f.y = 490;
            });
        },

        _updateFighter(f, dt) {
            if (f.state === 'hit') { f.hitTimer -= dt; if (f.hitTimer <= 0) f.state = 'idle'; return; }
            if (f.state === 'attacking') { f.actionTimer -= dt; if (f.actionTimer <= 0) { f.state = 'idle'; f.action = null; } }
        },

        /* ── AI ─────────────────────────────────────── */
        _runAI(dt) {
            const e = this.enemy, p = this.player;
            if (e.state !== 'idle' || e.hp <= 0) return;
            const gap = Math.abs(e.step - p.step);

            e.aiTimer -= dt;
            if (e.aiTimer > 0) {
                // React-block while waiting
                if (p.state === 'attacking' && Math.random() < e.aiBlockChance * dt * 10) {
                    e.state = 'blocking';
                    setTimeout(() => { if (e.state === 'blocking') e.state = 'idle'; }, 500 + Math.random() * 400);
                }
                return;
            }

            const r = Math.random();
            if (r < e.aiAggression) {
                if (gap <= D.THRUST.range) {
                    this._attack(e, p, (gap > D.SWING.range || Math.random() > 0.45) ? 'thrust' : 'swing');
                } else { this._moveToward(e, p); }
                e.aiTimer = e.aiTelegraph * (0.7 + Math.random() * 0.6);
            } else if (r < e.aiAggression + e.aiBlockChance) {
                e.state = 'blocking';
                setTimeout(() => { if (e.state === 'blocking') e.state = 'idle'; }, 350 + Math.random() * 450);
                e.aiTimer = e.aiTelegraph;
            } else {
                if (gap > 3) this._moveToward(e, p);
                else if (gap <= D.MIN_GAP) this._moveAway(e, p);
                e.aiTimer = e.aiTelegraph * (0.4 + Math.random() * 0.5);
            }
        },

        _moveToward(f, t) {
            const d = t.step > f.step ? 1 : -1;
            const ns = f.step + d;
            if (Math.abs(ns - t.step) >= D.MIN_GAP && ns >= 0 && ns <= D.ARENA_STEPS) { f.step = ns; }
        },
        _moveAway(f, t) {
            const d = t.step > f.step ? -1 : 1;
            const ns = f.step + d;
            if (ns >= 0 && ns <= D.ARENA_STEPS) f.step = ns;
        },

        /* ── actions ────────────────────────────────── */
        handleAction(act) {
            if (this.state !== 'fighting') return;
            const p = this.player;
            if (act === 'block') { if (p.state === 'idle') p.state = 'blocking'; return; }
            if (act === 'block_release') { if (p.state === 'blocking') p.state = 'idle'; return; }
            if (p.state !== 'idle') return;
            if (act === 'left') { this._moveAway(p, this.enemy); return; }
            if (act === 'right') { this._moveToward(p, this.enemy); return; }
            if (act === 'swing' || act === 'thrust') {
                this._attack(p, this.enemy, act);
                this.comboBuffer.push(act); this.comboTimer = 0.9;
                this._checkCombo();
            }
        },

        _attack(atk, def, type) {
            const w = type === 'thrust' ? D.THRUST : D.SWING;
            atk.state = 'attacking'; atk.action = type;
            atk.actionTimer = w.speed; atk.actionDur = w.speed;
            E.audio.play(type);

            const gap = Math.abs(atk.step - def.step);
            if (gap <= w.range) {
                if (def.state === 'blocking') {
                    E.audio.play('block');
                    E.particles.emit(def.x + def.facing * -15, def.y - 40, 8, { color: '#4ade80', speed: 60, life: 0.3 });
                    if (def.isPlayer) { this.comboBuffer.push('block_absorb'); this.comboTimer = 0.9; }
                } else {
                    let dmg = Math.max(1, Math.round(atk.atk * w.dmg - def.def * 0.3));
                    if (def.isBoss) dmg = Math.min(dmg, Math.ceil(def.maxHp * 0.11));
                    if (atk.isBoss) dmg = Math.round(dmg * 1.15);
                    def.hp = Math.max(0, def.hp - dmg);
                    def.state = 'hit'; def.hitTimer = 0.28;
                    if (def.isPlayer) this.playerHit = true;

                    E.audio.play('hit');
                    E.shake(type === 'thrust' ? 8 : 5, 0.2);
                    const hx = def.x + def.facing * -10, hy = def.y - 40;
                    E.particles.emit(hx, hy, 14, { color: atk.isGhost ? '#7c3aed' : '#f6c742', speed: 130, life: 0.5, gravity: 120 });
                    this.dmgNums.push({ x: hx, y: hy - 15, v: dmg, lbl: '', t: 1 });
                }
            }
        },

        _checkCombo() {
            for (const c of D.COMBOS) {
                if (c.lvl > 0 && this.player.level < c.lvl) continue;
                const b = this.comboBuffer, s = c.seq;
                if (b.length >= s.length) {
                    const tail = b.slice(-s.length);
                    if (tail.every((a, i) => a === s[i])) {
                        const bonus = Math.round(this.player.atk * (c.mult - 1));
                        if (this.enemy.hp > 0) {
                            this.enemy.hp = Math.max(0, this.enemy.hp - bonus);
                            this.dmgNums.push({ x: this.enemy.x, y: this.enemy.y - 70, v: bonus, lbl: c.name, t: 1.2 });
                            E.particles.emit(this.enemy.x, this.enemy.y - 40, 22, { color: '#f6c742', speed: 190, life: 0.9, gravity: -50 });
                            E.audio.play('hit');
                        }
                        this.comboBuffer = [];
                        break;
                    }
                }
            }
        },

        /* ── drawing ────────────────────────────────── */
        draw(ctx, W, H) {
            this._drawArena(ctx, W, H);
            this._drawFighter(ctx, this.player);
            this._drawFighter(ctx, this.enemy);
            this._drawFX(ctx);
            this._drawDmgNums(ctx);
            if (this.state === 'intro') this._drawIntro(ctx, W, H);
        },

        _drawArena(ctx, W, H) {
            const t = (SB.Game && SB.Game.currentTerritory) ? SB.Game.currentTerritory() : D.TERRITORIES[0];
            E.draw.gradient(0, 0, W, H, t.bg1, t.bg2, true);

            // Fog layers
            const now = performance.now() / 1000;
            for (let i = 0; i < 3; i++) {
                const fy = 300 + i * 55 + Math.sin(now * 0.35 + i * 1.1) * 12;
                E.draw.rect(0, fy, W, 35, t.fogColor || 'rgba(255,255,255,0.02)');
            }

            // Ground
            E.draw.rect(0, 505, W, H - 505, t.groundColor);
            E.draw.line(0, 505, W, 505, t.accent, 2, 0.35);

            // Step markers
            const arenaL = (W - D.ARENA_STEPS * D.STEP_SIZE) / 2;
            for (let i = 0; i <= D.ARENA_STEPS; i++) {
                E.draw.line(arenaL + i * D.STEP_SIZE, 505, arenaL + i * D.STEP_SIZE, 514, 'rgba(255,255,255,0.05)', 1);
            }

            // Ambient particles
            if (Math.random() < 0.05) {
                E.particles.emit(Math.random() * W, 80 + Math.random() * 380, 1,
                    { color: t.accent, speed: 12, life: 3.5, gravity: 6, size: 1.3, friction: 0.995 });
            }
        },

        _drawFighter(ctx, f) {
            if (!f) return;
            const x = f.x, y = f.y, dir = f.facing;
            const br = Math.sin(f.breathe) * 2;
            const isHit = f.state === 'hit';
            const blocking = f.state === 'blocking';
            const dead = f.state === 'dead';
            const ghost = f.isGhost;

            ctx.save();
            ctx.translate(x, y);
            if (dir === -1) ctx.scale(-1, 1);
            if (ghost) { ctx.shadowColor = '#7c3aed'; ctx.shadowBlur = 22; ctx.globalAlpha = 0.72 + Math.sin(performance.now() / 280) * 0.1; }
            if (isHit) ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 45) * 0.35;
            if (dead) { ctx.globalAlpha = 0.25; ctx.translate(0, 12); }

            // Legs
            ctx.strokeStyle = f.bodyColor; ctx.lineWidth = 5; ctx.lineCap = 'round';
            const ls = f.state === 'attacking' ? 9 : 4;
            ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-ls - 2, 26); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(ls + 2, 26); ctx.stroke();

            // Body
            E.draw.roundedRect(-16, -48 + br, 32, 46, 6, f.armorColor);
            E.draw.line(-12, -36 + br, 12, -36 + br, f.bodyColor, 1, 0.25);
            if (f.isBoss) { // Boss shoulder pads
                E.draw.roundedRect(-22, -48 + br, 10, 14, 3, f.armorColor);
                E.draw.roundedRect(12, -48 + br, 10, 14, 3, f.armorColor);
            }

            // Head
            const hy = -62 + br;
            E.draw.circle(0, hy, 13, f.bodyColor);
            E.draw.circle(4, hy - 2, 2.2, ghost ? '#7c3aed' : '#1a1a1a');
            if (f.isBoss) { // Boss helmet crest
                E.draw.line(-4, hy - 13, 0, hy - 22, f.armorColor, 3);
                E.draw.line(4, hy - 13, 0, hy - 22, f.armorColor, 3);
            }
            if (f.isSelfFight) { // Mirror-self glow
                ctx.shadowColor = '#f6c742'; ctx.shadowBlur = 18;
                E.draw.circle(0, hy, 15, 'rgba(246,199,66,0.08)');
                ctx.shadowBlur = ghost ? 22 : 0;
            }

            // Arm + sword
            const ax = 12, ay = -42 + br;
            ctx.save(); ctx.translate(ax, ay);
            let sa = -0.3, sl = 42, glow = false;
            if (f.action === 'swing' && f.state === 'attacking') {
                const p = 1 - f.actionTimer / f.actionDur;
                sa = -1.3 + p * 2.6; glow = true;
            } else if (f.action === 'thrust' && f.state === 'attacking') {
                const p = 1 - f.actionTimer / f.actionDur;
                sa = 0; sl = 42 + (p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6) * 28; glow = true;
            } else if (blocking) { sa = -1.55; glow = true; }
            ctx.rotate(sa);

            // Blade
            ctx.strokeStyle = '#c0c8d0'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sl, 0); ctx.stroke();
            if (glow) {
                ctx.strokeStyle = ghost ? 'rgba(124,58,237,0.55)' : blocking ? 'rgba(74,222,128,0.5)' : 'rgba(246,199,66,0.5)';
                ctx.lineWidth = 7; ctx.globalAlpha = (ghost ? 0.55 : 0.35);
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sl, 0); ctx.stroke();
                ctx.globalAlpha = ghost ? 0.72 : 1;
            }
            // Hilt
            ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(-2, 5); ctx.stroke();
            ctx.restore();

            // Block shield arc
            if (blocking) {
                ctx.strokeStyle = ghost ? 'rgba(124,58,237,0.25)' : 'rgba(74,222,128,0.2)';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(16, -28 + br, 30, -1.4, 1.4); ctx.stroke();
            }

            // Ghost aura
            if (ghost && !dead) {
                ctx.globalAlpha = 0.06 + Math.sin(performance.now() / 350) * 0.03;
                ctx.fillStyle = '#7c3aed';
                ctx.beginPath(); ctx.arc(0, -25, 35, 0, Math.PI * 2); ctx.fill();
            }

            ctx.restore();

            // Label
            if (this.state === 'intro' || this.state === 'fighting') {
                const lbl = f.isPlayer
                    ? (f.isGhost ? '👻 GHOST' : 'YOU')
                    : (f.isSelfFight ? '🪞 PAST SELF' : f.isBoss ? '👹 BOSS' : 'ENEMY');
                E.draw.text(lbl, x, y - 90, { size: 10, weight: '700', color: f.isPlayer ? '#f6c742' : '#ef4444', a: 0.7 });
            }
        },

        _drawFX(ctx) {
            [this.player, this.enemy].forEach(f => {
                if (!f || f.state !== 'attacking') return;
                const p = 1 - f.actionTimer / f.actionDur;
                if (f.action === 'swing') {
                    const r = 52, st = f.facing === 1 ? -1.3 : Math.PI - 1.3;
                    E.draw.arc(f.x + f.facing * 12, f.y - 38, r, st, st + f.facing * p * 2.6,
                        f.isGhost ? 'rgba(124,58,237,0.5)' : 'rgba(246,199,66,0.4)', 3, 1 - p);
                } else if (f.action === 'thrust' && p < 0.5) {
                    const ext = (p / 0.4) * 65;
                    E.draw.line(f.x + f.facing * 22, f.y - 38,
                        f.x + f.facing * (22 + ext), f.y - 38,
                        f.isGhost ? 'rgba(124,58,237,0.6)' : 'rgba(96,165,250,0.5)', 4, 1 - p * 2);
                }
            });
        },

        _drawDmgNums(ctx) {
            for (let i = this.dmgNums.length - 1; i >= 0; i--) {
                const d = this.dmgNums[i];
                d.t -= 1 / 60;
                const a = E.clamp(d.t, 0, 1);
                E.draw.text('-' + d.v, d.x, d.y - (1 - a) * 45, { size: 20, weight: '900', color: '#ef4444', a });
                if (d.lbl) E.draw.text(d.lbl + '!', d.x, d.y - (1 - a) * 45 - 20, { size: 12, weight: '700', color: '#f6c742', a });
                if (d.t <= 0) this.dmgNums.splice(i, 1);
            }
        },

        _drawIntro(ctx, W, H) {
            const p = E.clamp(1 - this.introTimer / 1.6, 0, 1);
            E.draw.rect(0, 0, W, H, 'rgba(0,0,0,' + (0.5 * (1 - p)) + ')');
            if (p > 0.35 && p < 0.88) {
                const ta = p < 0.55 ? (p - 0.35) / 0.2 : (0.88 - p) / 0.33;
                const sc = 1 + (1 - ta) * 0.25;
                const label = this.isBoss ? '⚔ BOSS FIGHT!' : this.isGhost ? '👻 GHOST FIGHT' : '⚔ FIGHT!';
                E.draw.text(label, W / 2, H / 2 - 60,
                    { size: 42 * sc, weight: '900', color: this.isGhost ? '#c084fc' : '#f6c742', a: ta, shadow: this.isGhost ? 'rgba(124,58,237,0.5)' : 'rgba(246,199,66,0.5)', shadowBlur: 25 });
            }
        },

        /* ── helpers ────────────────────────────────── */
        playerHpPct() { return this.player ? this.player.hp / this.player.maxHp : 1; },
        enemyHpPct() { return this.enemy ? this.enemy.hp / this.enemy.maxHp : 1; },
        timerStr() {
            const m = Math.floor(Math.max(0, this.timer) / 60);
            const s = Math.floor(Math.max(0, this.timer) % 60);
            return m + ':' + (s < 10 ? '0' : '') + s;
        }
    };

    return { createFighter, scene };
})();
