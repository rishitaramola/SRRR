// ═══════════════════════════════════════════════════════════
//  SpiritBlade — Game Controller
//  State management, progression, screens, input, save/load
// ═══════════════════════════════════════════════════════════
window.SB = window.SB || {};

SB.Game = (function () {
    const D = SB.DATA;
    const E = SB.Engine;
    const C = SB.Combat;

    /* ===================================================
       STATE
       =================================================== */
    const st = {
        screen: 'title',
        territory: 0,
        fightIndex: 0,          // 0–9  current fight within territory
        playerLevel: 1,
        playerXp: 0,
        energy: D.ENERGY_MAX,
        lastEnergyTs: Date.now(),
        loseStreak: 0,
        bossLosses: 0,
        ghostMode: false,
        ghostLevel: 0,
        ghostLosses: 0,
        ghostUsed: false,
        completedTerritories: [],
        sqDone: [],             // "territory-questIndex"
        materials: 0,
        inBoss: false,
        inSQ: false,
        sqIdx: -1,
        lastPlayerHp: Infinity  // for damage-flash detection
    };

    /* ===================================================
       SCREEN HELPERS
       =================================================== */
    function show(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const el = document.getElementById('screen-' + name);
        if (el) el.classList.add('active');
        st.screen = name;
        document.body.classList.toggle('ghost-mode', st.ghostMode);
    }

    function currentTerritory() {
        return D.TERRITORIES[st.territory] || D.TERRITORIES[0];
    }

    /* ===================================================
       ENERGY
       =================================================== */
    function regenEnergy() {
        const now = Date.now();
        const gain = Math.floor((now - st.lastEnergyTs) / D.ENERGY_REGEN_MS);
        if (gain > 0) {
            st.energy = Math.min(D.ENERGY_MAX, st.energy + gain);
            st.lastEnergyTs += gain * D.ENERGY_REGEN_MS;
        }
    }
    function spend(cost) {
        regenEnergy();
        if (st.energy < cost) return false;
        st.energy -= cost;
        return true;
    }

    /* ===================================================
       XP / LEVELING
       =================================================== */
    function addXp(n) {
        st.playerXp += n;
        if (st.playerXp < 0) st.playerXp = 0;
        while (st.playerLevel < D.MAX_LEVEL && st.playerXp >= D.XP_TABLE[st.playerLevel]) {
            st.playerXp -= D.XP_TABLE[st.playerLevel];
            st.playerLevel++;
            E.audio.play('levelUp');
        }
        if (st.playerLevel >= D.MAX_LEVEL) st.playerXp = 0;
    }
    function xpPct() {
        if (st.playerLevel >= D.MAX_LEVEL) return 1;
        return st.playerXp / (D.XP_TABLE[st.playerLevel] || 1);
    }

    /* ===================================================
       TERRITORY MAP
       =================================================== */
    function renderMap() {
        regenEnergy();
        const list = document.getElementById('territory-list');
        list.innerHTML = '';
        D.TERRITORIES.forEach((t, i) => {
            const done = st.completedTerritories.includes(i);
            const cur = i === st.territory && !done;
            const locked = i > 0 && !st.completedTerritories.includes(i - 1) && i !== st.territory;

            const c = document.createElement('div');
            c.className = 'card' + (done ? ' completed' : '') + (cur ? ' current' : '') + (locked ? ' locked' : '');

            const bossReady = st.playerLevel >= D.BOSS_MIN_LEVEL && st.fightIndex >= 10 && cur;
            const progress = cur ? (st.ghostMode ? 'Ghost Lv.' + st.ghostLevel : 'Fight ' + Math.min(st.fightIndex + 1, 10) + '/10') : '';

            c.innerHTML =
                '<div class="card-title" style="color:' + t.accent + '">' + t.name + '</div>' +
                '<div class="card-sub">Boss: ' + t.boss + (progress ? ' · ' + progress : '') + '</div>' +
                (done ? '<span class="card-badge badge-done">Done</span>'
                    : cur ? '<span class="card-badge badge-current">' + (bossReady ? '👹 Boss!' : 'Current') + '</span>'
                    : '<span class="card-badge badge-locked">Locked</span>');

            if (!locked) c.addEventListener('click', () => { st.territory = i; showPreFight(); });
            list.appendChild(c);
        });

        document.getElementById('hud-energy').textContent = '⚡ ' + st.energy + '/' + D.ENERGY_MAX;
        document.getElementById('hud-level').textContent = 'Lv. ' + st.playerLevel;
        document.getElementById('hud-xp').textContent = 'XP: ' + st.playerXp;
    }

    /* ===================================================
       PRE-FIGHT
       =================================================== */
    function showPreFight() {
        const isBoss = st.fightIndex >= 10 || st.inBoss;
        const selfFight = st.ghostMode && st.ghostLevel >= D.MAX_LEVEL - 1;
        const eLvl = selfFight ? st.playerLevel : Math.min(st.fightIndex + 1, 10);
        const pS = D.stats(st.playerLevel);
        const eS = isBoss ? D.bossStats(eLvl) : D.stats(eLvl);
        const t = currentTerritory();

        document.getElementById('pf-plv').textContent = st.playerLevel;
        document.getElementById('pf-php').textContent = pS.maxHp;
        document.getElementById('pf-patk').textContent = pS.atk;

        const eName = selfFight ? '🪞 Your Past Self'
            : isBoss ? '👹 ' + t.boss
            : (st.ghostMode ? '👻 Ghost Target' : t.theme.charAt(0).toUpperCase() + t.theme.slice(1) + ' Fighter');
        document.getElementById('pf-ename').textContent = eName;
        document.getElementById('pf-elv').textContent = eLvl;
        document.getElementById('pf-ehp').textContent = eS.maxHp;
        document.getElementById('pf-eatk').textContent = eS.atk;

        const cost = isBoss ? D.ENERGY_BOSS : st.ghostMode ? D.ENERGY_GHOST : D.ENERGY_FIGHT;
        document.getElementById('pf-cost').textContent = '⚡ ' + cost;

        const badge = selfFight ? '🪞 Self-Fight' : st.ghostMode ? '👻 Ghost Fight' : isBoss ? '👹 Boss Fight' : 'Main Story';
        document.getElementById('pf-type').textContent = badge;

        document.getElementById('pf-enemy-avatar').style.background =
            selfFight ? 'linear-gradient(135deg,#f6c742,#b8860b)' : 'linear-gradient(135deg,' + t.enemy + ',' + t.accent + ')';
        document.getElementById('pf-player-avatar').style.background =
            st.ghostMode ? 'linear-gradient(135deg,#7c3aed,#5b21b6)' : '';

        show('prefight');
    }

    /* ===================================================
       START FIGHT
       =================================================== */
    function startFight() {
        const isBoss = st.fightIndex >= 10 || st.inBoss;
        const selfFight = st.ghostMode && st.ghostLevel >= D.MAX_LEVEL - 1;
        const cost = isBoss ? D.ENERGY_BOSS : st.ghostMode ? D.ENERGY_GHOST : D.ENERGY_FIGHT;
        if (!spend(cost)) { alert('Not enough energy! Wait for regen.'); return; }

        const eLvl = selfFight ? st.playerLevel : Math.min(st.fightIndex + 1, 10);
        const t = currentTerritory();

        const player = C.createFighter({
            level: st.playerLevel, step: 1, facing: 1, isPlayer: true, isGhost: st.ghostMode,
            bodyColor: st.ghostMode ? '#9f7aea' : D.C.playerBody,
            armorColor: st.ghostMode ? '#5b21b6' : D.C.playerArmor
        });

        const enemy = C.createFighter({
            level: eLvl, step: D.ARENA_STEPS - 1, facing: -1,
            isBoss: isBoss, isSelfFight: selfFight,
            bodyColor: selfFight ? D.C.playerBody : t.enemy,
            armorColor: selfFight ? D.C.playerArmor : t.accent
        });

        // Impossible difficulty if under-leveled for boss
        if (isBoss && st.playerLevel < D.BOSS_MIN_LEVEL && !selfFight) {
            enemy.atk *= 3; enemy.maxHp *= 2; enemy.hp = enemy.maxHp;
        }

        st.inBoss = isBoss;
        C.scene.init(player, enemy, {
            maxTime: isBoss ? D.FIGHT_TIME_BOSS : D.FIGHT_TIME_NORMAL,
            isBoss, isGhost: st.ghostMode
        });
        st.lastPlayerHp = player.maxHp;

        show('combat');
        document.getElementById('c-pname').textContent = st.ghostMode ? '👻 Ghost' : 'You';
        const eLabel = selfFight ? '🪞 Past Self' : isBoss ? t.boss : 'Fighter Lv.' + eLvl;
        document.getElementById('c-ename').textContent = eLabel;
    }

    /* ===================================================
       SIDE QUEST FIGHT
       =================================================== */
    function startSQ(idx) {
        const key = st.territory + '-' + idx;
        if (st.sqDone.includes(key)) return;
        st.inSQ = true; st.sqIdx = idx;
        const t = currentTerritory();
        const eLvl = Math.min(st.fightIndex + idx + 2, 10);

        const player = C.createFighter({
            level: st.playerLevel, step: 1, facing: 1, isPlayer: true, isGhost: st.ghostMode,
            bodyColor: st.ghostMode ? '#9f7aea' : D.C.playerBody,
            armorColor: st.ghostMode ? '#5b21b6' : D.C.playerArmor
        });
        const enemy = C.createFighter({
            level: eLvl, step: D.ARENA_STEPS - 1, facing: -1,
            bodyColor: '#b8860b', armorColor: t.accent
        });

        C.scene.init(player, enemy, { maxTime: D.FIGHT_TIME_NORMAL });
        st.lastPlayerHp = player.maxHp;
        show('combat');
        document.getElementById('c-pname').textContent = 'You';
        document.getElementById('c-ename').textContent = D.SIDE_QUESTS[idx].name;
    }

    /* ===================================================
       FIGHT END
       =================================================== */
    function onEnd(result) {
        const win = result === 'win';
        const rewards = [];

        if (win) {
            st.loseStreak = 0;

            if (st.inSQ) {
                const q = D.SIDE_QUESTS[st.sqIdx];
                addXp(q.xp); rewards.push({ l: 'XP Gained', v: '+' + q.xp, c: 'positive' });
                st.materials += 2; rewards.push({ l: 'Materials', v: '+2', c: 'positive' });
                st.sqDone.push(st.territory + '-' + st.sqIdx);
                st.inSQ = false;

            } else if (st.inBoss) {
                // BOSS DEFEATED — territory complete
                st.inBoss = false; st.bossLosses = 0;
                if (!st.completedTerritories.includes(st.territory))
                    st.completedTerritories.push(st.territory);

                for (let i = 0; i < D.BOSS_LEVEL_BONUS && st.playerLevel < D.MAX_LEVEL; i++) st.playerLevel++;
                st.playerXp = 0; st.materials += 10;
                st.fightIndex = 0; st.ghostMode = false; st.ghostUsed = false;

                document.getElementById('tw-rewards').innerHTML =
                    '<div class="tw-reward-line">⬆ +' + D.BOSS_LEVEL_BONUS + ' Levels!</div>' +
                    '<div class="tw-reward-line">🗡️ New Weapon Unlocked</div>' +
                    '<div class="tw-reward-line">📦 +10 Materials</div>';
                show('territory-win');
                save(); return;

            } else if (st.ghostMode) {
                addXp(D.XP_GHOST_FIGHT);
                rewards.push({ l: 'Ghost XP', v: '+' + D.XP_GHOST_FIGHT, c: 'positive' });
                st.ghostLevel++; st.ghostLosses = 0; st.fightIndex++;
                if (st.ghostLevel >= D.MAX_LEVEL) {
                    // SOUL RECLAIMED
                    st.ghostMode = false;
                    st.playerLevel = Math.max(st.playerLevel, D.GHOST_EMERGE_LEVEL);
                    st.fightIndex = 10; st.inBoss = true;
                    rewards.push({ l: '🪞 SOUL RECLAIMED', v: 'Lv.' + D.GHOST_EMERGE_LEVEL, c: 'levelup' });
                }

            } else {
                // Normal win
                const xpG = D.XP_PER_FIGHT[Math.min(st.fightIndex, 9)] || 10;
                addXp(xpG); rewards.push({ l: 'XP Gained', v: '+' + xpG, c: 'positive' });
                st.fightIndex++;
                if (Math.random() < 0.3) { st.materials++; rewards.push({ l: 'Material', v: '+1', c: 'positive' }); }
                if (st.fightIndex >= 10) { st.inBoss = true; rewards.push({ l: 'Boss Fight', v: 'Unlocked!', c: 'levelup' }); }
            }

        } else {
            // LOSS
            st.loseStreak++;
            if (st.loseStreak >= D.LOSS_STREAK_THRESHOLD) {
                addXp(D.XP_PENALTY);
                rewards.push({ l: 'Lose Streak ×' + st.loseStreak, v: D.XP_PENALTY + ' XP', c: 'negative' });
            }

            if (st.inSQ) { st.inSQ = false; rewards.push({ l: 'Side Quest', v: 'Failed', c: 'negative' }); }
            else if (st.inBoss && !st.ghostMode) {
                st.bossLosses++;
                rewards.push({ l: 'Boss Losses', v: st.bossLosses + '/2', c: 'negative' });
                if (st.bossLosses >= 2 && !st.ghostUsed) {
                    // Trigger ghost transition
                    renderPostFight(false, rewards);
                    setTimeout(() => { E.audio.play('ghostActivate'); show('ghost'); }, 2200);
                    save(); return;
                }
            } else if (st.ghostMode) {
                st.ghostLosses++;
                if (st.ghostLosses >= D.GHOST_MAX_LOSSES) {
                    st.ghostMode = false; st.ghostUsed = true;
                    st.playerLevel = Math.max(st.playerLevel, D.BOSS_MIN_LEVEL);
                    st.fightIndex = 10; st.inBoss = true;
                    rewards.push({ l: 'Ghost Failed', v: 'Back to Lv.' + D.BOSS_MIN_LEVEL, c: 'negative' });
                }
            }
        }

        rewards.push({ l: 'Level', v: 'Lv.' + st.playerLevel, c: '' });
        renderPostFight(win, rewards);
        save();
    }

    function renderPostFight(win, rewards) {
        const el = document.getElementById('pf-result');
        el.textContent = win ? 'VICTORY' : 'DEFEATED';
        el.className = 'pf-result ' + (win ? 'win' : 'lose');

        const rw = document.getElementById('pf-rewards');
        rw.innerHTML = '';
        rewards.forEach(r => {
            const d = document.createElement('div');
            d.className = 'reward-line';
            d.innerHTML = '<span>' + r.l + '</span><span class="reward-val ' + r.c + '">' + r.v + '</span>';
            rw.appendChild(d);
        });
        show('postfight');
    }

    /* ===================================================
       SIDE QUEST BOARD
       =================================================== */
    function renderSQ() {
        const list = document.getElementById('sq-list');
        list.innerHTML = '';
        D.SIDE_QUESTS.forEach((q, i) => {
            const done = st.sqDone.includes(st.territory + '-' + i);
            const c = document.createElement('div');
            c.className = 'sq-card card' + (done ? ' done' : '');
            c.innerHTML = '<div class="sq-name">' + q.name + '</div><div class="sq-desc">' + q.desc + '</div><div class="sq-reward">+' + q.xp + ' XP · Free</div>';
            if (!done) c.addEventListener('click', () => startSQ(i));
            list.appendChild(c);
        });
        show('sq');
    }

    /* ===================================================
       GHOST MODE ENTRY
       =================================================== */
    function enterGhost() {
        st.ghostMode = true; st.ghostLevel = 0; st.ghostLosses = 0;
        st.ghostUsed = true; st.fightIndex = 0; st.inBoss = false; st.bossLosses = 0;
        E.audio.play('possess');
        showPreFight();
    }

    /* ===================================================
       SAVE / LOAD
       =================================================== */
    function save() {
        try {
            const d = {};
            ['territory', 'fightIndex', 'playerLevel', 'playerXp', 'energy', 'lastEnergyTs',
                'loseStreak', 'bossLosses', 'ghostMode', 'ghostLevel', 'ghostLosses', 'ghostUsed',
                'completedTerritories', 'sqDone', 'materials', 'inBoss'].forEach(k => d[k] = st[k]);
            localStorage.setItem('spiritblade', JSON.stringify(d));
        } catch (e) { /* no-op */ }
    }
    function load() {
        try {
            const raw = localStorage.getItem('spiritblade');
            if (raw) Object.assign(st, JSON.parse(raw));
        } catch (e) { /* no-op */ }
    }

    /* ===================================================
       DAMAGE FLASH
       =================================================== */
    function flashDmg() {
        const f = document.createElement('div');
        f.className = 'damage-flash';
        document.body.appendChild(f);
        setTimeout(() => f.remove(), 250);
    }

    /* ===================================================
       UPDATE  (called by Engine every frame)
       =================================================== */
    function update(dt) {
        if (st.screen !== 'combat') return;

        const r = C.scene.update(dt);

        // HUD
        document.getElementById('c-php').style.width = (C.scene.playerHpPct() * 100) + '%';
        document.getElementById('c-ehp').style.width = (C.scene.enemyHpPct() * 100) + '%';
        document.getElementById('c-timer').textContent = C.scene.timerStr();
        document.getElementById('c-xp').style.width = (xpPct() * 100) + '%';
        document.getElementById('c-xplbl').textContent = 'Lv.' + st.playerLevel;

        // Low HP color
        document.getElementById('c-php').style.background =
            C.scene.playerHpPct() < 0.25 ? 'linear-gradient(90deg,#ef4444,#f87171)' : '';
        document.getElementById('c-timer').style.color = C.scene.timer < 30 ? '#ef4444' : '';

        // Damage flash
        if (C.scene.playerHit) { flashDmg(); C.scene.playerHit = false; }

        // Fight result
        if ((r.state === 'win' || r.state === 'lose' || r.state === 'timeout') && !C.scene.resultShown) {
            C.scene.resultShown = true;
            setTimeout(() => onEnd(r.state === 'timeout' ? 'lose' : r.state), 1300);
        }
    }

    /* ===================================================
       DRAW  (called by Engine every frame)
       =================================================== */
    function drawFn(ctx, W, H) {
        if (st.screen === 'combat') {
            C.scene.draw(ctx, W, H);
        } else {
            const t = currentTerritory();
            E.draw.gradient(0, 0, W, H, t.bg1, '#08080e', true);
            if (Math.random() < 0.018) {
                E.particles.emit(Math.random() * W, Math.random() * H, 1,
                    { color: t.accent, speed: 8, life: 5, gravity: -4, size: 1, friction: 0.998 });
            }
        }
    }

    /* ===================================================
       INPUT BINDING
       =================================================== */
    function bindInput() {
        const acts = { 'btn-swing': 'swing', 'btn-thrust': 'thrust', 'btn-left': 'left', 'btn-right': 'right' };
        Object.entries(acts).forEach(([id, a]) => {
            const b = document.getElementById(id);
            if (b) b.addEventListener('pointerdown', e => { e.preventDefault(); if (st.screen === 'combat') C.scene.handleAction(a); });
        });

        // Block (hold)
        const blk = document.getElementById('btn-block');
        if (blk) {
            blk.addEventListener('pointerdown', e => { e.preventDefault(); blk.classList.add('held'); if (st.screen === 'combat') C.scene.handleAction('block'); });
            const releaseBlock = () => { blk.classList.remove('held'); if (st.screen === 'combat') C.scene.handleAction('block_release'); };
            blk.addEventListener('pointerup', releaseBlock);
            blk.addEventListener('pointerleave', releaseBlock);
            blk.addEventListener('pointercancel', releaseBlock);
        }

        // Keyboard
        document.addEventListener('keydown', e => {
            if (st.screen !== 'combat') return;
            const k = e.key.toLowerCase();
            if (k === 'a' || k === 'arrowleft') C.scene.handleAction('left');
            else if (k === 'd' || k === 'arrowright') C.scene.handleAction('right');
            else if (k === 'j') C.scene.handleAction('swing');
            else if (k === 'k') C.scene.handleAction('thrust');
            else if (k === 'l') { C.scene.handleAction('block'); document.getElementById('btn-block')?.classList.add('held'); }
        });
        document.addEventListener('keyup', e => {
            if (e.key.toLowerCase() === 'l') { C.scene.handleAction('block_release'); document.getElementById('btn-block')?.classList.remove('held'); }
        });

        // Navigation
        document.getElementById('btn-start')?.addEventListener('click', () => {
            load(); regenEnergy(); renderMap(); show('map');
        });
        document.getElementById('btn-fight')?.addEventListener('click', startFight);
        document.getElementById('btn-back')?.addEventListener('click', () => { renderMap(); show('map'); });
        document.getElementById('btn-continue')?.addEventListener('click', () => {
            if (st.inBoss || st.fightIndex >= 10) showPreFight();
            else { renderMap(); show('map'); }
        });
        document.getElementById('btn-sidequests')?.addEventListener('click', renderSQ);
        document.getElementById('btn-sq-back')?.addEventListener('click', () => { renderMap(); show('map'); });
        document.getElementById('btn-ghost-enter')?.addEventListener('click', enterGhost);
        document.getElementById('btn-next-territory')?.addEventListener('click', () => {
            if (st.territory < D.TERRITORIES.length - 1) {
                st.territory++; st.fightIndex = 0; st.bossLosses = 0; st.ghostUsed = false;
            } else { show('complete'); return; }
            renderMap(); show('map'); save();
        });
        document.getElementById('btn-restart')?.addEventListener('click', () => {
            localStorage.removeItem('spiritblade');
            Object.assign(st, {
                screen: 'title', territory: 0, fightIndex: 0,
                playerLevel: 1, playerXp: 0,
                energy: D.ENERGY_MAX, lastEnergyTs: Date.now(),
                loseStreak: 0, bossLosses: 0,
                ghostMode: false, ghostLevel: 0, ghostLosses: 0, ghostUsed: false,
                completedTerritories: [], sqDone: [], materials: 0,
                inBoss: false, inSQ: false
            });
            show('title');
        });
    }

    /* ===================================================
       INIT
       =================================================== */
    function boot() {
        E.init('gameCanvas');
        bindInput();
        E.start();
        show('title');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    /* ===================================================
       PUBLIC
       =================================================== */
    return { update, draw: drawFn, currentTerritory, state: st };
})();
