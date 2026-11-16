// Damage and death: armour, helmets, kill rewards and the charge dropping from a fallen carrier.
// Every outcome goes out as an event for the HUD, audio and effects to show.
import { HITBOX, ARMOR_RATIO, ECONOMY, WEAPONS, GRENADES } from '../config.js';

const ZONE_MULT = { head: 1, chest: HITBOX.chest.mult, stomach: HITBOX.stomach.mult, legs: HITBOX.legs.mult };

// zone: 'head' | 'chest' | 'stomach' | 'legs' | 'blast'. armorPen: share of damage armour lets through.
export function applyDamage(state, victim, attacker, weaponId, base, zone, armorPen, headMult) {
	if (!victim.alive) return 0;
	let damage = base * (zone === 'blast' ? 1 : ZONE_MULT[zone]);
	if (zone === 'head') damage *= headMult;
	const armoured = victim.armor > 0 && zone !== 'legs' && (zone !== 'head' || victim.helmet);
	if (armoured) {
		const reduced = damage * armorPen;
		const soaked = (damage - reduced) * ARMOR_RATIO;
		victim.armor = Math.max(0, victim.armor - soaked);
		if (victim.armor <= 0) victim.helmet = false;
		damage = reduced;
	}
	damage = Math.max(1, Math.round(damage));
	const dealt = Math.min(victim.health, damage);
	victim.health -= dealt;
	victim.lastAttacker = attacker ? attacker.id : -1;
	victim.damageTime = state.time;
	if (attacker) {
		victim.damageYaw = Math.atan2(attacker.pos.x - victim.pos.x, -(attacker.pos.z - victim.pos.z));
		attacker.roundDamage += dealt;
	}
	victim.vel.x *= 0.45; victim.vel.z *= 0.45;
	if (victim.using > 0 && !victim.isPlayer) victim.using = 0;

	const e = state.events.emit('hit');
	e.actor = victim.id; e.other = attacker ? attacker.id : -1; e.amount = dealt; e.head = zone === 'head';
	e.weapon = weaponId; e.x = victim.pos.x; e.y = victim.pos.y; e.z = victim.pos.z;

	if (victim.health <= 0) kill(state, victim, attacker, weaponId, zone === 'head');
	return dealt;
}

export function kill(state, victim, attacker, weaponId, headshot) {
	victim.alive = false;
	victim.health = 0;
	victim.deaths += 1;
	victim.deathTime = state.time;
	victim.deathYaw = victim.damageYaw;
	victim.using = 0;
	victim.scoped = false;
	if (attacker && attacker !== victim && attacker.team !== victim.team) {
		attacker.kills += 1;
		attacker.roundKills += 1;
		const reward = WEAPONS[weaponId]?.kill ?? (GRENADES[weaponId] ? 300 : 300);
		attacker.money = Math.min(ECONOMY.max, attacker.money + reward);
	}
	if (victim.hasCharge) {
		victim.hasCharge = false;
		const c = state.charge;
		c.state = 'dropped';
		c.carrier = -1;
		c.pos.set(victim.pos.x, 0.05, victim.pos.z);
		const d = state.events.emit('chargeDropped');
		d.actor = victim.id;
	}
	const e = state.events.emit('kill');
	e.actor = victim.id; e.other = attacker ? attacker.id : -1; e.weapon = weaponId; e.head = headshot;
	e.x = victim.pos.x; e.y = victim.pos.y; e.z = victim.pos.z;
}
