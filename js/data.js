// ═══════════════════════════════════════════════════════════
//  SpiritBlade — Game Data & Constants
// ═══════════════════════════════════════════════════════════
window.SB = window.SB || {};

SB.DATA = {
    // XP required to advance from level N to N+1 (index 0 = level 1→2)
    XP_TABLE: [0, 10, 15, 20, 25, 30, 35, 45, 55, 65],

    // XP earned per main fight at each level
    XP_PER_FIGHT: [8, 8, 9, 9, 10, 10, 10, 10, 10, 10],
    XP_SIDE_QUEST: [15, 20, 25],
    XP_GHOST_FIGHT: 12,
    XP_PENALTY: -2,
    LOSS_STREAK_THRESHOLD: 2,

    BOSS_MIN_LEVEL: 8,
    BOSS_LEVEL_BONUS: 4,
    GHOST_EMERGE_LEVEL: 9,
    GHOST_MAX_LOSSES: 2,
    MAX_LEVEL: 10,

    ENERGY_MAX: 50,
    ENERGY_REGEN_MS: 1800000, // 30 min = 1 energy (2 per hour)
    ENERGY_FIGHT: 2,
    ENERGY_BOSS: 4,
    ENERGY_GHOST: 1,

    FIGHT_TIME_NORMAL: 180,
    FIGHT_TIME_BOSS: 300,

    STEP_SIZE: 60,
    ARENA_STEPS: 7,
    MIN_GAP: 1,

    SWING: { dmg: 1.0, speed: 0.45, range: 2.0, name: 'Swing' },
    THRUST: { dmg: 1.5, speed: 0.30, range: 2.8, name: 'Thrust' },

    // AI per level (0–9): telegraph delay(s), block chance, aggression
    AI_TELEGRAPH: [0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2],
    AI_BLOCK_CHANCE: [0, 0, 0.08, 0.12, 0.18, 0.22, 0.28, 0.32, 0.38, 0.44],
    AI_AGGRESSION: [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.62, 0.70, 0.80],

    stats(level) {
        return { maxHp: 80 + level * 22, atk: 8 + level * 3, def: 3 + level * 2 };
    },

    bossStats(level) {
        const s = this.stats(level + 2);
        return { maxHp: s.maxHp * 1.6 | 0, atk: s.atk * 1.3 | 0, def: s.def * 1.4 | 0 };
    },

    TERRITORIES: [
        { name: 'Bamboo Forest Dojo', boss: 'Ronin Kagura', theme: 'forest',
          bg1: '#1a3a1a', bg2: '#0d1f0d', accent: '#7cb342', enemy: '#8d6e63',
          groundColor: '#2d4a2d', fogColor: 'rgba(120,180,100,0.04)' },
        { name: 'Crimson Fortress', boss: 'General Tetsu', theme: 'fortress',
          bg1: '#3a1a1a', bg2: '#1f0d0d', accent: '#ef5350', enemy: '#78909c',
          groundColor: '#4a2d2d', fogColor: 'rgba(200,100,100,0.04)' },
        { name: 'Spirit Hollow', boss: 'The Hollow King', theme: 'spirit',
          bg1: '#1a1a3a', bg2: '#0d0d1f', accent: '#b388ff', enemy: '#4db6ac',
          groundColor: '#2d2d4a', fogColor: 'rgba(120,100,200,0.04)' }
    ],

    SIDE_QUESTS: [
        { type: 'bounty', name: 'Bounty Hunt', xp: 20, desc: 'Defeat the elite without blocking.' },
        { type: 'survival', name: 'Survival Wave', xp: 25, desc: 'Defeat 3 enemies in sequence.' },
        { type: 'training', name: 'Training Duel', xp: 15, desc: 'Spar with the boss shadow.' }
    ],

    COMBOS: [
        { name: 'Cross Slash', seq: ['swing', 'swing'], mult: 1.3, lvl: 0, hint: 'Swing → Swing' },
        { name: 'Rapid Thrust', seq: ['thrust', 'thrust'], mult: 1.4, lvl: 0, hint: 'Thrust → Thrust' },
        { name: 'Lunge Strike', seq: ['forward', 'thrust'], mult: 1.8, lvl: 3, hint: '► → Thrust' },
        { name: 'Counter', seq: ['block_absorb', 'thrust'], mult: 2.0, lvl: 5, hint: 'Block hit → Thrust' },
        { name: 'Storm Blade', seq: ['swing', 'thrust', 'swing'], mult: 2.2, lvl: 7, hint: 'Swing → Thrust → Swing' },
        { name: 'Death Blossom', seq: ['swing', 'swing', 'thrust', 'thrust'], mult: 2.8, lvl: 9, hint: '2×Swing → 2×Thrust' }
    ],

    WEAPON_UPGRADES: [
        { cost: 3, atk: 2, range: 0.1, name: 'Sharpen Blade' },
        { cost: 6, atk: 3, range: 0.1, name: 'Reinforce Edge' },
        { cost: 10, atk: 4, range: 0.15, name: 'Spirit Temper' },
        { cost: 15, atk: 5, range: 0.2, name: 'Dragon Forge' },
        { cost: 22, atk: 6, range: 0.25, name: 'Legendary Craft' }
    ],

    ARMOR_UPGRADES: [
        { cost: 2, hp: 15, def: 1, name: 'Padded Armor' },
        { cost: 5, hp: 20, def: 2, name: 'Chain Mail' },
        { cost: 9, hp: 25, def: 3, name: 'Spirit Guard' },
        { cost: 14, hp: 30, def: 4, name: 'Dragon Scale' },
        { cost: 20, hp: 40, def: 5, name: 'Immortal Plate' }
    ],

    C: { // Color palette
        gold: '#f6c742', crimson: '#dc2626',
        ghostPurple: '#7c3aed', ghostTeal: '#0d9488', ghostCyan: '#22d3ee',
        bg: '#08080e', panel: 'rgba(12,12,20,0.94)', border: 'rgba(255,255,255,0.07)',
        text: '#e8e0d4', dim: '#6b6058', accent: '#f6c742',
        hpGreen: '#22c55e', hpRed: '#ef4444', xp: '#3b82f6', energy: '#eab308',
        white: '#ffffff', black: '#000000',
        playerBody: '#e8d5b5', playerArmor: '#b8860b',
        enemyBody: '#8b7355', enemyArmor: '#5c4033'
    }
};
