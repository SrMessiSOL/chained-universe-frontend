/**
 * combat-engine.ts
 * OGame-accurate combat simulation for Chained Universe.
 *
 * References:
 * - OGame combat formula: https://ogame.fandom.com/wiki/Combat
 * - Rapid fire table from OGame wiki
 *
 * Combat runs in rounds (max 6). Each round:
 *   1. Each unit fires at a random enemy unit.
 *   2. Damage = attacker.attack * (1 + weaponsTech * 0.1)
 *   3. If damage < 1% of target shield → absorbed (no damage).
 *   4. Else reduce shield first, then hull.
 *   5. If hull < 70% → roll for explosion: chance = 1 - hull/fullHull.
 *   6. After round: shields regenerate to full if still alive.
 *   7. After 6 rounds or one side wiped → determine winner.
 *   8. Attacker gets debris field = 30% of destroyed ships/defenses metal+crystal.
 *
 * Tech modifiers:
 *   - Weapons: +10% attack per level
 *   - Shielding: +10% shield per level
 *   - Armor: +10% hull per level
 */

export interface CombatUnit {
  id: string;          // unique identifier
  name: string;
  icon: string;
  count: number;
  baseAttack: number;
  baseShield: number;
  baseHull: number;    // structural integrity
  rapidFire: Record<string, number>; // target_id → rapid fire value
}

export interface CombatSide {
  units: CombatUnit[];
  weaponsTech: number;
  shieldingTech: number;
  armorTech: number;
}

export interface CombatRoundResult {
  round: number;
  attackerFired: number;
  defenderFired: number;
  attackerLosses: Record<string, number>;  // unit id → count destroyed
  defenderLosses: Record<string, number>;
  attackerRemaining: Record<string, number>;
  defenderRemaining: Record<string, number>;
}

export interface CombatResult {
  winner: "attacker" | "defender" | "draw";
  rounds: CombatRoundResult[];
  attackerLosses: Record<string, number>;
  defenderLosses: Record<string, number>;
  attackerRemaining: Record<string, number>;
  defenderRemaining: Record<string, number>;
  debrisField: { metal: number; crystal: number };
  moonChance: number; // 0–20%
  combatLog: string[];
}

// ─── OGame unit stats ──────────────────────────────────────────────────────────

export const SHIP_STATS: Record<string, { attack: number; shield: number; hull: number; rapidFire: Record<string, number>; metal: number; crystal: number }> = {
  smallCargo:    { attack: 5,      shield: 10,   hull: 400,    metal: 2000,    crystal: 2000,    rapidFire: { espionageProbe: 5, solarSatellite: 5 } },
  largeCargo:    { attack: 5,      shield: 25,   hull: 1200,   metal: 6000,    crystal: 6000,    rapidFire: { espionageProbe: 5, solarSatellite: 5 } },
  lightFighter:  { attack: 50,     shield: 10,   hull: 400,    metal: 3000,    crystal: 1000,    rapidFire: { espionageProbe: 5, solarSatellite: 5 } },
  heavyFighter:  { attack: 150,    shield: 25,   hull: 1000,   metal: 6000,    crystal: 4000,    rapidFire: { espionageProbe: 5, solarSatellite: 5, smallCargo: 3 } },
  cruiser:       { attack: 400,    shield: 50,   hull: 2700,   metal: 20000,   crystal: 7000,    rapidFire: { espionageProbe: 5, solarSatellite: 5, lightFighter: 6 } },
  battleship:    { attack: 1000,   shield: 200,  hull: 6000,   metal: 45000,   crystal: 15000,   rapidFire: { espionageProbe: 5, solarSatellite: 5 } },
  battlecruiser: { attack: 700,    shield: 400,  hull: 7000,   metal: 30000,   crystal: 40000,   rapidFire: { espionageProbe: 5, solarSatellite: 5, heavyFighter: 4, cruiser: 4, battleship: 7 } },
  bomber:        { attack: 1000,   shield: 500,  hull: 7500,   metal: 50000,   crystal: 25000,   rapidFire: { espionageProbe: 5, solarSatellite: 5, rocketLauncher: 20, lightLaser: 20, heavyLaser: 10 } },
  destroyer:     { attack: 2000,   shield: 500,  hull: 11000,  metal: 60000,   crystal: 50000,   rapidFire: { espionageProbe: 5, solarSatellite: 5, battlecruiser: 2 } },
  deathstar:     { attack: 200000, shield: 50000, hull: 900000, metal: 5000000, crystal: 4000000, rapidFire: { espionageProbe: 1250, solarSatellite: 1250, smallCargo: 250, largeCargo: 250, lightFighter: 200, heavyFighter: 100, cruiser: 33, battleship: 30, battlecruiser: 15, bomber: 25, destroyer: 5, recycler: 250, rocketLauncher: 200, lightLaser: 200, heavyLaser: 100, gaussCannon: 50, ionCannon: 100, plasmaTurret: 10 } },
  recycler:      { attack: 1,      shield: 10,   hull: 1600,   metal: 10000,   crystal: 6000,    rapidFire: { espionageProbe: 5, solarSatellite: 5 } },
  espionageProbe:{ attack: 0,      shield: 0,    hull: 100,    metal: 0,       crystal: 1000,    rapidFire: {} },
  colonyShip:    { attack: 50,     shield: 100,  hull: 3000,   metal: 10000,   crystal: 20000,   rapidFire: { espionageProbe: 5, solarSatellite: 5 } },
  solarSatellite:{ attack: 1,      shield: 1,    hull: 200,    metal: 0,       crystal: 2000,    rapidFire: {} },
};

export const DEFENSE_STATS: Record<string, { attack: number; shield: number; hull: number; metal: number; crystal: number }> = {
  rocketLauncher: { attack: 80,    shield: 20,   hull: 200,    metal: 2000,   crystal: 0      },
  lightLaser:     { attack: 100,   shield: 25,   hull: 200,    metal: 1500,   crystal: 500    },
  heavyLaser:     { attack: 250,   shield: 100,  hull: 800,    metal: 6000,   crystal: 2000   },
  gaussCannon:    { attack: 1100,  shield: 200,  hull: 3500,   metal: 20000,  crystal: 15000  },
  ionCannon:      { attack: 150,   shield: 500,  hull: 800,    metal: 5000,   crystal: 3000   },
  plasmaTurret:   { attack: 3000,  shield: 300,  hull: 10000,  metal: 50000,  crystal: 50000  },
  smallShieldDome:{ attack: 1,     shield: 2000, hull: 20000,  metal: 10000,  crystal: 10000  },
  largeShieldDome:{ attack: 1,     shield: 10000,hull: 100000, metal: 50000,  crystal: 50000  },
};

// ─── Tech tree requirements (OGame-accurate) ───────────────────────────────────

export interface Requirement { type: "building" | "research"; key: string; level: number; }

export const SHIP_REQUIREMENTS: Record<string, Requirement[]> = {
  smallCargo:    [{ type: "building", key: "shipyard", level: 2 }, { type: "research", key: "combustionDrive", level: 2 }],
  largeCargo:    [{ type: "building", key: "shipyard", level: 4 }, { type: "research", key: "combustionDrive", level: 6 }],
  lightFighter:  [{ type: "building", key: "shipyard", level: 1 }, { type: "research", key: "combustionDrive", level: 1 }],
  heavyFighter:  [{ type: "building", key: "shipyard", level: 3 }, { type: "research", key: "armourTech", level: 2 }, { type: "research", key: "impulseDrive", level: 2 }],
  cruiser:       [{ type: "building", key: "shipyard", level: 5 }, { type: "research", key: "impulseDrive", level: 4 }, { type: "research", key: "ionTech", level: 2 }],
  battleship:    [{ type: "building", key: "shipyard", level: 7 }, { type: "research", key: "hyperspaceDrive", level: 4 }],
  battlecruiser: [{ type: "building", key: "shipyard", level: 8 }, { type: "research", key: "hyperspaceDrive", level: 5 }, { type: "research", key: "hyperspaceTech", level: 5 }, { type: "research", key: "laserTech", level: 5 }],
  bomber:        [{ type: "building", key: "shipyard", level: 8 }, { type: "research", key: "impulseDrive", level: 6 }, { type: "research", key: "plasmaTech", level: 5 }],
  destroyer:     [{ type: "building", key: "shipyard", level: 9 }, { type: "research", key: "hyperspaceDrive", level: 6 }, { type: "research", key: "hyperspaceTech", level: 5 }],
  deathstar:     [{ type: "building", key: "shipyard", level: 12 }, { type: "research", key: "hyperspaceDrive", level: 7 }, { type: "research", key: "hyperspaceTech", level: 6 }, { type: "research", key: "gravitonTech", level: 1 }],
  recycler:      [{ type: "building", key: "shipyard", level: 4 }, { type: "research", key: "combustionDrive", level: 6 }, { type: "research", key: "shieldingTech", level: 2 }],
  espionageProbe:[{ type: "building", key: "shipyard", level: 3 }, { type: "research", key: "espionageTech", level: 2 }],
  colonyShip:    [{ type: "building", key: "shipyard", level: 4 }, { type: "research", key: "impulseDrive", level: 3 }, { type: "research", key: "astrophysics", level: 3 }],
  solarSatellite:[{ type: "building", key: "shipyard", level: 1 }],
};

export const DEFENSE_REQUIREMENTS: Record<string, Requirement[]> = {
  rocketLauncher: [{ type: "building", key: "shipyard", level: 1 }],
  lightLaser:     [{ type: "building", key: "shipyard", level: 2 }, { type: "research", key: "energyTech", level: 1 }, { type: "research", key: "laserTech", level: 3 }],
  heavyLaser:     [{ type: "building", key: "shipyard", level: 4 }, { type: "research", key: "energyTech", level: 3 }, { type: "research", key: "laserTech", level: 6 }],
  gaussCannon:    [{ type: "building", key: "shipyard", level: 6 }, { type: "research", key: "energyTech", level: 6 }, { type: "research", key: "weaponsTech", level: 3 }, { type: "research", key: "shieldingTech", level: 1 }],
  ionCannon:      [{ type: "building", key: "shipyard", level: 4 }, { type: "research", key: "ionTech", level: 4 }],
  plasmaTurret:   [{ type: "building", key: "shipyard", level: 8 }, { type: "research", key: "plasmaTech", level: 7 }],
  smallShieldDome:[{ type: "building", key: "shipyard", level: 1 }, { type: "research", key: "shieldingTech", level: 2 }],
  largeShieldDome:[{ type: "building", key: "shipyard", level: 6 }, { type: "research", key: "shieldingTech", level: 6 }],
};

export const RESEARCH_REQUIREMENTS: Record<string, Requirement[]> = {
  energyTech:     [{ type: "building", key: "researchLab", level: 1 }],
  laserTech:      [{ type: "building", key: "researchLab", level: 1 }, { type: "research", key: "energyTech", level: 2 }],
  ionTech:        [{ type: "building", key: "researchLab", level: 4 }, { type: "research", key: "energyTech", level: 4 }, { type: "research", key: "laserTech", level: 5 }],
  hyperspaceTech: [{ type: "building", key: "researchLab", level: 7 }, { type: "research", key: "energyTech", level: 5 }, { type: "research", key: "shieldingTech", level: 5 }],
  plasmaTech:     [{ type: "building", key: "researchLab", level: 4 }, { type: "research", key: "energyTech", level: 8 }, { type: "research", key: "laserTech", level: 10 }, { type: "research", key: "ionTech", level: 5 }],
  espionageTech:  [{ type: "building", key: "researchLab", level: 3 }],
  computerTech:   [{ type: "building", key: "researchLab", level: 1 }],
  astrophysics:   [{ type: "building", key: "researchLab", level: 3 }, { type: "research", key: "espionageTech", level: 4 }, { type: "research", key: "impulseDrive", level: 3 }],
  igrNetwork:     [{ type: "building", key: "researchLab", level: 10 }, { type: "research", key: "computerTech", level: 8 }, { type: "research", key: "hyperspaceTech", level: 8 }],
  gravitonTech:   [{ type: "building", key: "researchLab", level: 12 }], // also needs 300k energy production
  weaponsTech:    [{ type: "building", key: "researchLab", level: 4 }],
  shieldingTech:  [{ type: "building", key: "researchLab", level: 6 }, { type: "research", key: "energyTech", level: 3 }],
  armourTech:     [{ type: "building", key: "researchLab", level: 2 }],
  combustionDrive:[{ type: "building", key: "researchLab", level: 1 }, { type: "research", key: "energyTech", level: 1 }],
  impulseDrive:   [{ type: "building", key: "researchLab", level: 2 }, { type: "research", key: "energyTech", level: 1 }],
  hyperspaceDrive:[{ type: "building", key: "researchLab", level: 7 }, { type: "research", key: "hyperspaceTech", level: 3 }],
};

export const BUILDING_REQUIREMENTS: Record<string, Requirement[]> = {
  metalMine:           [],
  crystalMine:         [],
  deuteriumSynthesizer:[],
  solarPlant:          [],
  fusionReactor:       [{ type: "building", key: "deuteriumSynthesizer", level: 5 }, { type: "research", key: "energyTech", level: 3 }],
  roboticsFactory:     [],
  naniteFactory:       [{ type: "building", key: "roboticsFactory", level: 10 }, { type: "research", key: "computerTech", level: 10 }],
  shipyard:            [{ type: "building", key: "roboticsFactory", level: 2 }],
  metalStorage:        [],
  crystalStorage:      [],
  deuteriumTank:       [],
  researchLab:         [],
  missileSilo:         [{ type: "building", key: "shipyard", level: 1 }],
};

// ─── Combat simulation ─────────────────────────────────────────────────────────

interface ActiveUnit {
  id: string;
  name: string;
  icon: string;
  baseId: string;
  attack: number;
  shield: number;
  maxShield: number;
  hull: number;
  maxHull: number;
  rapidFire: Record<string, number>;
  cost: { metal: number; crystal: number };
  isDefense: boolean;
}

function makeActiveUnits(side: CombatSide, isDefender: boolean): ActiveUnit[] {
  const units: ActiveUnit[] = [];
  const wMult = 1 + side.weaponsTech * 0.1;
  const sMult = 1 + side.shieldingTech * 0.1;
  const aMult = 1 + side.armorTech * 0.1;

  for (const unit of side.units) {
    const stats = SHIP_STATS[unit.id] ?? (DEFENSE_STATS[unit.id] ? { ...DEFENSE_STATS[unit.id], rapidFire: {} } : null);
    if (!stats || unit.count <= 0) continue;

    for (let i = 0; i < unit.count; i++) {
      units.push({
        id: `${unit.id}_${i}`,
        name: unit.name,
        icon: unit.icon,
        baseId: unit.id,
        attack: stats.attack * wMult,
        shield: stats.shield * sMult,
        maxShield: stats.shield * sMult,
        hull: stats.hull * aMult,
        maxHull: stats.hull * aMult,
        rapidFire: (stats as any).rapidFire ?? {},
        cost: { metal: stats.metal, crystal: stats.crystal },
        isDefense: !Object.keys(SHIP_STATS).includes(unit.id),
      });
    }
  }
  return units;
}

function rand(): number { return Math.random(); }
function randInt(min: number, max: number): number { return Math.floor(rand() * (max - min + 1)) + min; }

function fireAtTarget(attacker: ActiveUnit, defender: ActiveUnit): void {
  let damage = attacker.attack;

  // Shield absorption: if damage < 1% of max shield → blocked
  if (damage < defender.maxShield * 0.01) return;

  // Reduce shield first
  if (defender.shield > 0) {
    const absorbed = Math.min(defender.shield, damage);
    defender.shield -= absorbed;
    damage -= absorbed;
  }

  // Remaining damage hits hull
  defender.hull -= damage;
}

function shouldExplosion(unit: ActiveUnit): boolean {
  if (unit.hull <= 0) return true;
  const ratio = unit.hull / unit.maxHull;
  if (ratio >= 0.7) return false;
  // Probability of explosion = 1 - hull/fullHull (capped)
  const explodeChance = 1 - ratio;
  return rand() < explodeChance;
}

function getRapidFireCount(attacker: ActiveUnit, defender: ActiveUnit): number {
  const rf = attacker.rapidFire[defender.baseId];
  if (!rf || rf <= 1) return 1;
  // Expected shots = rf / (rf - 1) but simulated as probability each shot
  let shots = 1;
  while (rand() < (rf - 1) / rf) shots++;
  return shots;
}

export function simulateCombat(attacker: CombatSide, defender: CombatSide, maxRounds = 6): CombatResult {
  const log: string[] = [];
  const roundResults: CombatRoundResult[] = [];

  let atkUnits = makeActiveUnits(attacker, false);
  let defUnits = makeActiveUnits(defender, true);

  const totalAttackerLosses: Record<string, number> = {};
  const totalDefenderLosses: Record<string, number> = {};

  const countByBase = (units: ActiveUnit[]): Record<string, number> => {
    const r: Record<string, number> = {};
    for (const u of units) r[u.baseId] = (r[u.baseId] ?? 0) + 1;
    return r;
  };

  for (let round = 1; round <= maxRounds; round++) {
    if (atkUnits.length === 0 || defUnits.length === 0) break;

    log.push(`--- Round ${round} ---`);

    const atkBeforeCount = countByBase(atkUnits);
    const defBeforeCount = countByBase(defUnits);

    // Attacker fires at defender
    for (const atk of atkUnits) {
      if (defUnits.length === 0) break;
      let shots = 1;
      for (let s = 0; s < shots; s++) {
        if (defUnits.length === 0) break;
        const target = defUnits[randInt(0, defUnits.length - 1)];
        fireAtTarget(atk, target);
        // Check rapid fire for next shot
        if (s === shots - 1) {
          const extra = getRapidFireCount(atk, target);
          if (extra > 1) shots += extra - 1;
        }
      }
    }

    // Defender fires at attacker
    for (const def of defUnits) {
      if (atkUnits.length === 0) break;
      let shots = 1;
      for (let s = 0; s < shots; s++) {
        if (atkUnits.length === 0) break;
        const target = atkUnits[randInt(0, atkUnits.length - 1)];
        fireAtTarget(def, target);
        if (s === shots - 1) {
          const extra = getRapidFireCount(def, target);
          if (extra > 1) shots += extra - 1;
        }
      }
    }

    // Explosion checks
    const atkDestroyed = atkUnits.filter(u => shouldExplosion(u));
    const defDestroyed = defUnits.filter(u => shouldExplosion(u));

    // Count losses
    const roundAtkLoss: Record<string, number> = {};
    const roundDefLoss: Record<string, number> = {};

    for (const u of atkDestroyed) {
      roundAtkLoss[u.baseId] = (roundAtkLoss[u.baseId] ?? 0) + 1;
      totalAttackerLosses[u.baseId] = (totalAttackerLosses[u.baseId] ?? 0) + 1;
    }
    for (const u of defDestroyed) {
      roundDefLoss[u.baseId] = (roundDefLoss[u.baseId] ?? 0) + 1;
      totalDefenderLosses[u.baseId] = (totalDefenderLosses[u.baseId] ?? 0) + 1;
    }

    // Remove destroyed units
    const atkDestroyedIds = new Set(atkDestroyed.map(u => u.id));
    const defDestroyedIds = new Set(defDestroyed.map(u => u.id));
    atkUnits = atkUnits.filter(u => !atkDestroyedIds.has(u.id));
    defUnits = defUnits.filter(u => !defDestroyedIds.has(u.id));

    // Regenerate shields
    for (const u of atkUnits) u.shield = u.maxShield;
    for (const u of defUnits) u.shield = u.maxShield;

    const atkAfterCount = countByBase(atkUnits);
    const defAfterCount = countByBase(defUnits);

    roundResults.push({
      round,
      attackerFired: atkUnits.length + atkDestroyed.length,
      defenderFired: defUnits.length + defDestroyed.length,
      attackerLosses: roundAtkLoss,
      defenderLosses: roundDefLoss,
      attackerRemaining: { ...atkAfterCount },
      defenderRemaining: { ...defAfterCount },
    });

    if (Object.keys(roundAtkLoss).length > 0) log.push(`Attacker lost: ${Object.entries(roundAtkLoss).map(([k, v]) => `${v}x ${k}`).join(", ")}`);
    if (Object.keys(roundDefLoss).length > 0) log.push(`Defender lost: ${Object.entries(roundDefLoss).map(([k, v]) => `${v}x ${k}`).join(", ")}`);
  }

  // Determine winner
  let winner: "attacker" | "defender" | "draw";
  if (atkUnits.length === 0 && defUnits.length === 0) {
    winner = "draw";
  } else if (defUnits.length === 0) {
    winner = "attacker";
  } else if (atkUnits.length === 0) {
    winner = "defender";
  } else {
    winner = "draw"; // 6 rounds, both sides remain
  }

  // Debris field: 30% of destroyed ships/defenses (metal+crystal)
  let debrisMetal = 0;
  let debrisCrystal = 0;

  for (const [baseId, count] of Object.entries(totalAttackerLosses)) {
    const stats = SHIP_STATS[baseId];
    if (stats) {
      debrisMetal += Math.floor(stats.metal * count * 0.3);
      debrisCrystal += Math.floor(stats.crystal * count * 0.3);
    }
  }
  for (const [baseId, count] of Object.entries(totalDefenderLosses)) {
    const stats = SHIP_STATS[baseId] ?? DEFENSE_STATS[baseId];
    if (stats) {
      debrisMetal += Math.floor(stats.metal * count * 0.3);
      debrisCrystal += Math.floor(stats.crystal * count * 0.3);
    }
  }

  // Moon chance: 1–20% based on destroyed debris
  const totalDebris = debrisMetal + debrisCrystal;
  const moonChance = Math.min(20, Math.floor(totalDebris / 1_000_000));

  log.push(`\nResult: ${winner.toUpperCase()}`);
  log.push(`Debris: ${debrisMetal.toLocaleString()} metal, ${debrisCrystal.toLocaleString()} crystal`);

  return {
    winner,
    rounds: roundResults,
    attackerLosses: totalAttackerLosses,
    defenderLosses: totalDefenderLosses,
    attackerRemaining: countByBase(atkUnits),
    defenderRemaining: countByBase(defUnits),
    debrisField: { metal: debrisMetal, crystal: debrisCrystal },
    moonChance,
    combatLog: log,
  };
}