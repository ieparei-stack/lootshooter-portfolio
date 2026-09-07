import * as THREE from 'three';
import { config } from '../config.js';
import { computeDamage } from '../weapon/damage.js';
import { resolveCircleVsBlocks } from '../player/collision.js';
import { raycastWorld } from '../weapon/raycast.js';
import { emit } from '../core/events.js';
import { textTexture } from '../stage/range.js';   // T46 정예 표지

// 몬스터 (T22 2종 + T26 보스). 데이터는 코드에 둔다 (무기만 파일). 수치는 config.monster — 슬라이더가 직접 바꾼다.
//   melee  근접형: 인지하면 달려와 reach 안에서 windup 동안 몸을 내밀고 때린다. cooldown 뒤 반복.
//   ranged 원거리형: preferDist까지 접근해 정지, retreatDist보다 가까우면 물러난다.
//          fireRange 안 + 시야가 있으면 조준선(빨간 선)을 플레이어 눈에 붙이고 aimDelay 뒤 즉시 판정으로 쏜다.
//   boss   큰 원거리형(T26, 사용자 결정): 원거리 로직 그대로 + 조준선 2개(총구 좌우 오프셋) 동시 발사,
//          HP가 summonHpRatio 이하면 근접형을 summonCount마리씩 summonInterval마다 단 앞 바닥에 소환 (살아있는 소환수 summonMax까지).
//   피격: 플래시만(경직·넉백 없음, 사용자 결정). 머리 박스 별도 → 헤드샷 ×1.5. HP 0 → 앞으로 쓰러지고 1초 뒤 사라짐 (부활 없음).
//   인지: aggroRange 안 + 시야(레이캐스트) 또는 피격 시 즉시.
// 표적(targets.js)과 같은 인터페이스: colliders() / applyHit(hit, weapon) / update(dt, camera). shooter는 hit.collider.system으로 이 모듈을 찾는다.
// 이동은 xz 평면, 벽 충돌은 플레이어와 같은 resolveCircleVsBlocks. 몬스터끼리·플레이어와는 원 분리.
// onPlayerHit(damage, kind, monster)는 main.js가 넘긴다 (T24 health.damage).
// 스폰은 stage/waves.js가 spawn()/reset()/aliveCount()로 부른다.
// T25: spawn 옵션 floorY(단 높이)·bounds(단 위 이동 제한). 단 위 몬스터는 블록 충돌 대신 bounds로 갇힌다 (단 자체가 블록이라 밀려나므로).

const SHAPE = {
  melee:  { body: { w: 0.7, h: 1.6, d: 0.5 }, head: 0.3, color: { body: 0xb0453a, head: 0x7d2f27 }, muzzles: [0], barScale: 1 },
  ranged: { body: { w: 0.6, h: 1.5, d: 0.4 }, head: 0.3, color: { body: 0x4a6cb0, head: 0x2e4a80 }, muzzles: [0], barScale: 1 },
  boss:   { body: { w: 1.6, h: 3.0, d: 1.2 }, head: 0.6, color: { body: 0x7a3fb0, head: 0x4e2575 }, muzzles: [-0.8, 0.8], barScale: 2.5 },
};
const COLOR = { flash: 0xffe08a, bar: 0x3ddc84, barBg: 0x202020, laser: 0xff3030, laserFlash: 0xffffff };
// T46 정예 티어 외형 (Claude 결정): 크기 ×1.25, 색 ×0.6 (진하게), HP 바 위 '정예' 표지. HP는 config.monster[kind].eliteHp. 속도·피해·행동은 일반과 같다
const ELITE = { scale: 1.25, colorMul: 0.6, label: '정예', labelBg: '#5a1010' };
const darken = (hex, k) => ((Math.round(((hex >> 16) & 255) * k) << 16) | (Math.round(((hex >> 8) & 255) * k) << 8) | Math.round((hex & 255) * k));
function eliteShape(S) {
  const k = ELITE.scale;
  return { body: { w: S.body.w * k, h: S.body.h * k, d: S.body.d * k }, head: S.head * k, color: { body: darken(S.color.body, ELITE.colorMul), head: darken(S.color.head, ELITE.colorMul) }, muzzles: S.muzzles.map((o) => o * k), barScale: S.barScale * k };
}
const FLASH_TIME = 0.1;        // 피격 플래시 (s)
const FALL_TIME = 0.25;        // 쓰러지는 애니메이션 (s)
const REMOVE_TIME = 1.0;       // 쓰러진 뒤 사라지기까지 (s)
const LASER_FLASH_TIME = 0.1;  // 발사 순간 조준선이 희게 번쩍 (s)
const LASER_AIM_DROP = 0.6;    // 조준선 끝 = 플레이어 눈보다 이만큼 아래(가슴). 눈을 정확히 향하면 화면에서 점으로만 보인다
const LASER_RADIUS = 0.015;    // 조준선 굵기 (m). WebGL 선은 1px 고정이라 원기둥으로 그린다
const MUZZLE_FWD = 0.45;       // 총구를 몸 앞으로 내미는 거리 (m) — 머리 앞
const LUNGE = 0.45;            // 근접 공격 준비 시 몸을 내미는 거리 (m)
const PLAYER_RADIUS = 0.35;    // config.player.radius와 같음 — 몬스터가 카메라 안으로 파고들지 않게

// 총구 높이: 몸 높이의 3/4 (근접·원거리 1.2 근처, 보스 2.25)
const muzzleY = (S) => S.body.h + S.head / 2;   // 조준선·발사 원점 높이 = 머리 중심 (사용자 결정 2026-09-07, 이전 몸통 0.75)

export function createMonsters(scene, { blocks = [], player, tracers = null, onPlayerHit = null } = {}) {
  const list = [];
  let nextId = 1;
  const api = { list, colliders, applyHit, update, spawn, reset, remove, hasLOS, aliveCount };

  function eye() { return { x: player.state.x, y: player.state.eyeHeight, z: player.state.z }; }

  // T46: elite = 정예 티어 (waves.js 정의의 elite: true로 실려 온다). HP는 eliteHp, 외형은 eliteShape. 보스에는 정예 없음
  function spawn(kind, x, z, { floorY = 0, bounds = null, summoned = false, elite = false } = {}) {
    elite = elite && kind !== 'boss';
    const S = elite ? eliteShape(SHAPE[kind]) : SHAPE[kind];
    const C = config.monster[kind];
    const hp = Math.round(elite ? (C.eliteHp ?? C.hp) : C.hp);
    const group = new THREE.Group();            // 위치·회전(플레이어를 향함)·쓰러짐
    const rig = new THREE.Group();              // 근접 공격 시 앞으로 내미는 몸
    group.add(rig);
    const bodyMat = new THREE.MeshLambertMaterial({ color: S.color.body });
    const headMat = new THREE.MeshLambertMaterial({ color: S.color.head });
    const body = new THREE.Mesh(new THREE.BoxGeometry(S.body.w, S.body.h, S.body.d), bodyMat);
    body.position.y = S.body.h / 2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(S.head, S.head, S.head), headMat);
    head.position.y = S.body.h + S.head / 2;
    rig.add(body, head);

    // HP 바 (머리 위, 카메라를 향함) — targets.js와 같은 모양. 보스는 크게
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.06), new THREE.MeshBasicMaterial({ color: COLOR.barBg }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.04), new THREE.MeshBasicMaterial({ color: COLOR.bar }));
    fill.position.z = 0.001;
    bar.add(bg, fill);
    bar.position.y = S.body.h + S.head + 0.25;
    bar.scale.setScalar(S.barScale);
    bar.visible = false;
    group.add(bar);
    // T46 정예 표지 — HP 바 위, 항상 보임 (바는 맞아야 보이므로 따로). 카메라를 향한다
    let tag = null;
    if (elite) {
      const tex = textTexture(ELITE.label, { w: 256, h: 128, bg: ELITE.labelBg });
      tag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), tex ? new THREE.MeshBasicMaterial({ map: tex, transparent: true }) : new THREE.MeshBasicMaterial({ color: 0x5a1010 }));
      tag.position.y = bar.position.y + 0.12 * S.barScale + 0.2;
      group.add(tag);
    }

    // 조준선(원거리·보스) — 월드 좌표라 group이 아닌 scene에 붙인다. 길이 1의 원기둥(y축)을 scale·quaternion으로 맞춘다. 총구마다 하나
    const lasers = [];
    if (kind !== 'melee') {
      for (let i = 0; i < S.muzzles.length; i++) {
        const laser = new THREE.Mesh(
          new THREE.CylinderGeometry(LASER_RADIUS, LASER_RADIUS, 1, 6, 1, true),
          new THREE.MeshBasicMaterial({ color: COLOR.laser }),
        );
        laser.frustumCulled = false;
        laser.visible = false;
        scene.add(laser);
        lasers.push(laser);
      }
    }

    group.position.set(x, floorY, z);
    scene.add(group);

    const m = {
      id: `${kind}-${nextId++}`, kind, group, rig, bar, fill, lasers, tag, elite,
      pos: { x, z }, yaw: 0, floorY, bounds, summoned,
      hp, hpMax: hp, alive: true, dead: false,
      state: 'idle',       // idle | chase | attack(근접 준비) | cooldown | dead
      timer: 0,            // 상태 타이머 (s)
      aimT: 0,             // 원거리: 조준을 시작한 뒤 경과 (s). laserDelay 전엔 조준선 없음 (T55)
      aiming: false,       // 원거리: 조준 진행 중 (T55 — 시작엔 시야가 필요하지만, 시작한 뒤엔 시야를 잃어도 aimDelay에 쏜다. 벽에 막히면 벽 피격)
      cooldownT: 0,        // 원거리: 발사 후 남은 대기 (s)
      laserFlash: 0,
      summonT: -1,         // 보스: 다음 소환까지 (s). −1 = 아직 소환 단계 아님
      flash: { body: 0, head: 0 },
      mats: { body: bodyMat, head: headMat },
      colors: S.color,
      shape: S,
      colliders: [
        { part: 'body', min: [0, 0, 0], max: [0, 0, 0], target: null, system: api },
        { part: 'head', min: [0, 0, 0], max: [0, 0, 0], target: null, system: api },
      ],
    };
    for (const c of m.colliders) c.target = m;
    updateColliders(m);
    list.push(m);
    return m;
  }

  // AABB를 현재 위치로. 회전은 무시(박스가 작아 오차가 작다). 근접 공격 중 내민 몸은 반영하지 않는다.
  function updateColliders(m) {
    const { body, head } = m.shape;
    const hw = Math.max(body.w, body.d) / 2;
    const [cb, ch] = m.colliders;
    const fy = m.floorY;
    cb.min[0] = m.pos.x - hw; cb.min[1] = fy;          cb.min[2] = m.pos.z - hw;
    cb.max[0] = m.pos.x + hw; cb.max[1] = fy + body.h; cb.max[2] = m.pos.z + hw;
    ch.min[0] = m.pos.x - head / 2; ch.min[1] = fy + body.h;        ch.min[2] = m.pos.z - head / 2;
    ch.max[0] = m.pos.x + head / 2; ch.max[1] = fy + body.h + head; ch.max[2] = m.pos.z + head / 2;
  }

  // 살아서 싸우는 수 (쓰러지는 연출 중은 제외) — 웨이브 종료 판정(T23). T47: elite를 주면 그 티어만 (true = 정예, false = 일반)
  function aliveCount(elite = null) {
    let n = 0;
    for (const m of list) if (m.alive && !m.dead && (elite === null || !!m.elite === elite)) n++;
    return n;
  }

  function colliders() {
    const out = [];
    for (const m of list) if (m.alive && !m.dead) for (const c of m.colliders) out.push(c);
    return out;
  }

  // 총구 위치. off = 몬스터가 보는 방향 기준 좌우 오프셋 (m)
  function muzzleOf(m, ux, uz, off = 0) {
    return {
      x: m.pos.x + ux * MUZZLE_FWD + uz * off,
      y: m.floorY + muzzleY(m.shape),
      z: m.pos.z + uz * MUZZLE_FWD - ux * off,
    };
  }

  // 몬스터 총구/눈에서 플레이어 눈까지 벽에 막히지 않는가
  function hasLOS(m) {
    const e = eye();
    const o = { x: m.pos.x, y: m.floorY + muzzleY(m.shape), z: m.pos.z };
    const dx = e.x - o.x, dy = e.y - o.y, dz = e.z - o.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-6) return true;
    const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
    const hit = raycastWorld(o, dir, blocks, dist, []);
    return !hit || hit.distance >= dist - 0.01;
  }

  function applyHit(hit, weapon) {
    const m = hit.target;
    if (!m || !m.alive || m.dead) return { damage: 0, part: hit.part, killed: false, ratio: 1 };
    const { damage, ratio } = computeDamage(weapon, hit.part, hit.distance, hit.damageMul ?? 1);   // T38 강화 배율
    m.hp = Math.max(0, m.hp - damage);
    m.flash[hit.part] = FLASH_TIME;
    if (m.state === 'idle') m.state = 'chase';   // 맞으면 즉시 인지
    let killed = false;
    if (m.hp === 0) { die(m); killed = true; }
    return { damage, part: hit.part, killed, ratio };
  }

  function die(m) {
    m.dead = true; m.state = 'dead'; m.timer = 0;
    m.bar.visible = false;
    for (const l of m.lasers) l.visible = false;
    m.rig.position.z = 0;
  }

  function remove(m) {
    m.alive = false;
    scene.remove(m.group);
    for (const l of m.lasers) scene.remove(l);
    const i = list.indexOf(m);
    if (i >= 0) list.splice(i, 1);
  }

  function reset(defs) {
    for (const m of list.slice()) remove(m);
    for (const d of defs) spawn(d.kind, d.x, d.z, d);
  }

  const _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function setLaser(laser, from, to, color) {
    _dir.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = _dir.length() || 1e-6;
    _dir.divideScalar(len);
    laser.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    laser.scale.set(1, len, 1);
    laser.quaternion.setFromUnitVectors(_up, _dir);
    laser.material.color.setHex(color);
    laser.visible = true;
  }
  // 조준선 끝점: 플레이어 가슴
  function laserEnd(e) { return { x: e.x, y: e.y - LASER_AIM_DROP, z: e.z }; }
  // T55: 머리 중심 → 플레이어 눈 직선이 벽에 막히는지. 막히면 { blocked: true, point } (조준선·발사 끝점을 벽에서 끊는다 — 벽 너머로 새어 보이지 않게)
  function wallBetween(m) {
    const e = eye();
    const o = { x: m.pos.x, y: m.floorY + muzzleY(m.shape), z: m.pos.z };
    const wx = e.x - o.x, wy = e.y - o.y, wz = e.z - o.z;
    const len = Math.hypot(wx, wy, wz) || 1;
    const hit = raycastWorld(o, { x: wx / len, y: wy / len, z: wz / len }, blocks, len, []);
    return hit && hit.distance < len - 0.01 ? { blocked: true, point: hit.point } : { blocked: false, point: laserEnd(e) };
  }

  // 총구 전부에서 동시에 발사 (보스는 2발 → 각각 피해)
  // 발사: 총구 → 플레이어 눈. T55: 벽이 먼저 맞으면(플레이어가 숨음) 트레이서·섬광은 벽까지, 피해 없음.
  //   막힘 판정은 hasLOS와 같이 몸 중심(벽에 붙어 서도 벽 안에 들어가지 않는 점)에서 쏜다 — 총구 끝은 벽을 뚫고 나갈 수 있다
  function fireRanged(m, C, ux, uz) {
    const { blocked, point: end } = wallBetween(m);
    m.lastShotBlocked = blocked;
    m.shape.muzzles.forEach((off, i) => {
      const muzzle = muzzleOf(m, ux, uz, off);
      const vx = end.x - muzzle.x, vy = end.y - muzzle.y, vz = end.z - muzzle.z;
      const len = Math.hypot(vx, vy, vz) || 1;
      if (tracers) tracers.add(muzzle, end, { x: vx / len, y: vy / len, z: vz / len });
      setLaser(m.lasers[i], muzzle, end, COLOR.laserFlash);
      if (!blocked && onPlayerHit) onPlayerHit(C.damage, m.kind, m);
    });
    m.laserFlash = LASER_FLASH_TIME;
  }

  // 보스 소환: 단 앞 바닥에 근접형 summonCount마리. 살아있는 소환수가 summonMax면 건너뛴다
  function summon(m, C) {
    const alive = list.filter((x) => x.summoned && x.alive && !x.dead).length;
    const n = Math.min(C.summonCount, C.summonMax - alive);
    const z = m.bounds ? m.bounds.maxZ + 2 : m.pos.z + 3;
    for (let i = 0; i < n; i++) {
      const x = m.pos.x + (i - (n - 1) / 2) * 3;
      spawn('melee', x, z, { summoned: true }).state = 'chase';   // 소환수는 일반 티어 (T46)
    }
  }

  function update(dt, camera) {
    const e = eye();
    const R = config.monster.radius;

    for (const m of list.slice()) {   // 소환으로 list가 늘어도 이 프레임은 원래 목록만
      if (!m.alive) continue;

      // 피격 플래시
      for (const part of ['body', 'head']) {
        if (m.flash[part] > 0) {
          m.flash[part] -= dt;
          m.mats[part].color.setHex(m.flash[part] > 0 ? COLOR.flash : m.colors[part]);
        }
      }

      // 사망: 앞으로 쓰러진 뒤 사라짐
      if (m.dead) {
        m.timer += dt;
        m.group.rotation.x = Math.PI / 2 * Math.min(1, m.timer / FALL_TIME);
        if (m.timer >= FALL_TIME + REMOVE_TIME) remove(m);
        continue;
      }

      const C = config.monster[m.kind];
      const dx = e.x - m.pos.x, dz = e.z - m.pos.z;
      const dist = Math.hypot(dx, dz);
      const ux = dist > 1e-6 ? dx / dist : 0, uz = dist > 1e-6 ? dz / dist : 0;
      let mvx = 0, mvz = 0;   // 이 프레임 이동 방향 (단위)

      if (m.state === 'idle') {
        if (dist <= config.monster.aggroRange && hasLOS(m)) m.state = 'chase';
      }

      if (m.kind === 'melee') {
        if (m.state === 'chase') {
          if (dist <= C.reach) { m.state = 'attack'; m.timer = 0; emit('meleeWindup', { dist }); }
          else { mvx = ux; mvz = uz; }
        }
        if (m.state === 'attack') {
          m.timer += dt;
          const k = Math.min(1, m.timer / C.windup);
          m.rig.position.z = LUNGE * k;
          if (m.timer >= C.windup) {
            if (dist <= C.hitRange && onPlayerHit) onPlayerHit(C.damage, 'melee', m);
            m.state = 'cooldown'; m.timer = 0;
          }
        } else if (m.state === 'cooldown') {
          m.timer += dt;
          m.rig.position.z = LUNGE * Math.max(0, 1 - m.timer / 0.15);
          if (m.timer >= C.cooldown) m.state = 'chase';
        }
      } else {
        // 원거리형·보스: 거리 유지
        if (m.state !== 'idle') {
          if (dist > C.preferDist) { mvx = ux; mvz = uz; }
          else if (dist < C.retreatDist) { mvx = -ux; mvz = -uz; }
        }
        // 조준 → 발사
        if (m.laserFlash > 0) {
          m.laserFlash -= dt;
          if (m.laserFlash <= 0) for (const l of m.lasers) l.visible = false;
        }
        // T55: 조준 시작에는 사거리 + 시야가 필요. 시작한 뒤엔 시야를 잃어도(플레이어가 벽 뒤로) 멈추지 않고 aimDelay에 쏜다(벽에 막히면 벽 피격).
        //   → 플레이어가 다시 나와도 몬스터가 조준을 붙들고 기다리는 일이 없다. 조준선은 laserDelay가 지난 뒤부터 보인다.
        if (m.cooldownT > 0) {
          m.cooldownT -= dt;
          m.aimT = 0; m.aiming = false;
        } else {
          if (!m.aiming && m.state !== 'idle' && dist <= C.fireRange && hasLOS(m)) { m.aiming = true; m.aimT = 0; m.lastShotBlocked = false; }
          if (m.aiming) {
            m.aimT += dt;
            if (m.aimT >= C.aimDelay) {
              fireRanged(m, C, ux, uz);
              emit('rangedFire', { dist });
              m.aimT = 0; m.aiming = false;
              m.cooldownT = C.cooldown;
            } else if (m.aimT >= config.monster.laserDelay) {
              const end = wallBetween(m).point;   // 벽 뒤면 조준선이 벽에서 끊긴다
              m.shape.muzzles.forEach((off, i) => setLaser(m.lasers[i], muzzleOf(m, ux, uz, off), end, COLOR.laser));
            } else if (m.laserFlash <= 0) {
              for (const l of m.lasers) l.visible = false;
            }
          } else if (m.laserFlash <= 0) {
            for (const l of m.lasers) l.visible = false;
          }
        }
        // 보스 소환 단계: HP가 기준 이하로 떨어진 순간 1회, 이후 summonInterval마다
        if (m.kind === 'boss' && m.state !== 'idle' && m.hp <= m.hpMax * C.summonHpRatio) {
          if (m.summonT < 0) { summon(m, C); m.summonT = C.summonInterval; }
          else {
            m.summonT -= dt;
            if (m.summonT <= 0) { summon(m, C); m.summonT = C.summonInterval; }
          }
        }
      }

      // 이동 + 벽 충돌 + 플레이어와 겹치지 않게
      if (mvx || mvz) {
        m.pos.x += mvx * C.speed * dt;
        m.pos.z += mvz * C.speed * dt;
        if (!m.bounds) resolveCircleVsBlocks(m.pos, R, blocks);
      }
      if (m.bounds) {   // 단 위: 가장자리 안쪽에 가둔다
        const b = m.bounds;
        m.pos.x = Math.min(b.maxX - R, Math.max(b.minX + R, m.pos.x));
        m.pos.z = Math.min(b.maxZ - R, Math.max(b.minZ + R, m.pos.z));
      }
      const minD = R + PLAYER_RADIUS;
      const ddx = m.pos.x - e.x, ddz = m.pos.z - e.z;
      const dd = Math.hypot(ddx, ddz);
      if (dd < minD && dd > 1e-6) { m.pos.x = e.x + ddx / dd * minD; m.pos.z = e.z + ddz / dd * minD; }

      if (dist > 1e-6) m.yaw = Math.atan2(dx, dz);   // local +Z가 플레이어를 향하게
    }

    // 몬스터끼리 원 분리 (한 번). 단 위와 바닥은 서로 밀지 않는다
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; if (!a.alive || a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]; if (!b.alive || b.dead || b.floorY !== a.floorY) continue;
        const sx = b.pos.x - a.pos.x, sz = b.pos.z - a.pos.z;
        const d = Math.hypot(sx, sz), min = R * 2;
        if (d < min && d > 1e-6) {
          const push = (min - d) / 2;
          a.pos.x -= sx / d * push; a.pos.z -= sz / d * push;
          b.pos.x += sx / d * push; b.pos.z += sz / d * push;
        }
      }
    }

    // 씬 반영 + 콜라이더 + HP 바
    for (const m of list) {
      if (!m.alive) continue;
      m.group.position.set(m.pos.x, m.floorY, m.pos.z);
      m.group.rotation.y = m.yaw;
      if (!m.dead) updateColliders(m);
      const ratio = m.hp / m.hpMax;
      m.bar.visible = !m.dead && ratio < 1;
      if (m.bar.visible) {
        m.fill.scale.x = Math.max(0.001, ratio);
        m.fill.position.x = -(1 - ratio) * 0.29;
        if (camera) { m.group.updateMatrixWorld(); m.bar.lookAt(camera.position); }
      }
      if (m.tag) {
        m.tag.visible = !m.dead;
        if (m.tag.visible && camera) { if (!m.bar.visible) m.group.updateMatrixWorld(); m.tag.lookAt(camera.position); }
      }
    }
  }

  return api;
}
