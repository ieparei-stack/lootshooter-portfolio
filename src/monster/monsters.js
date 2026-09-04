import * as THREE from 'three';
import { config } from '../config.js';
import { computeDamage } from '../weapon/damage.js';
import { resolveCircleVsBlocks } from '../player/collision.js';
import { raycastWorld } from '../weapon/raycast.js';

// 몬스터 2종 (T22). 데이터는 코드에 둔다 (무기만 파일). 수치는 config.monster — 슬라이더가 직접 바꾼다.
//   melee  근접형: 인지하면 달려와 reach 안에서 windup 동안 몸을 내밀고 때린다. cooldown 뒤 반복.
//   ranged 원거리형: preferDist까지 접근해 정지, retreatDist보다 가까우면 물러난다.
//          fireRange 안 + 시야가 있으면 조준선(빨간 선)을 플레이어 눈에 붙이고 aimDelay 뒤 즉시 판정으로 쏜다.
//   피격: 플래시만(경직·넉백 없음, 사용자 결정). 머리 박스 별도 → 헤드샷 ×1.5. HP 0 → 앞으로 쓰러지고 1초 뒤 사라짐 (부활 없음).
//   인지: aggroRange 안 + 시야(레이캐스트) 또는 피격 시 즉시.
// 표적(targets.js)과 같은 인터페이스: colliders() / applyHit(hit, weapon) / update(dt, camera). shooter는 hit.collider.system으로 이 모듈을 찾는다.
// 이동은 xz 평면, 벽 충돌은 플레이어와 같은 resolveCircleVsBlocks. 몬스터끼리·플레이어와는 원 분리.
// onPlayerHit(damage, kind, monster)는 main.js가 넘긴다 — T22에서는 횟수 표시, T24에서 HP 감소로 연결.
// 스폰은 T23부터 stage/waves.js가 spawn()/reset()/aliveCount()로 부른다.
// T25: spawn 옵션 floorY(단 높이)·bounds(단 위 이동 제한). 단 위 몬스터는 블록 충돌 대신 bounds로 갇힌다 (단 자체가 블록이라 밀려나므로).

const SHAPE = {
  melee:  { body: { w: 0.7, h: 1.6, d: 0.5 }, head: 0.3, color: { body: 0xb0453a, head: 0x7d2f27 } },
  ranged: { body: { w: 0.6, h: 1.5, d: 0.4 }, head: 0.3, color: { body: 0x4a6cb0, head: 0x2e4a80 } },
};
const COLOR = { flash: 0xffe08a, bar: 0x3ddc84, barBg: 0x202020, laser: 0xff3030, laserFlash: 0xffffff };
const FLASH_TIME = 0.1;        // 피격 플래시 (s)
const FALL_TIME = 0.25;        // 쓰러지는 애니메이션 (s)
const REMOVE_TIME = 1.0;       // 쓰러진 뒤 사라지기까지 (s)
const LASER_FLASH_TIME = 0.1;  // 발사 순간 조준선이 희게 번쩍 (s)
const MUZZLE_Y = 1.2;          // 원거리형 총구 높이 (m)
const LASER_AIM_DROP = 0.6;    // 조준선 끝 = 플레이어 눈보다 이만큼 아래(가슴). 눈을 정확히 향하면 화면에서 점으로만 보인다
const LASER_RADIUS = 0.015;    // 조준선 굵기 (m). WebGL 선은 1px 고정이라 원기둥으로 그린다
const MUZZLE_FWD = 0.45;       // 총구를 몸 앞으로 내미는 거리 (m)
const LUNGE = 0.45;            // 근접 공격 준비 시 몸을 내미는 거리 (m)
const PLAYER_RADIUS = 0.35;    // config.player.radius와 같음 — 몬스터가 카메라 안으로 파고들지 않게

export function createMonsters(scene, { blocks = [], player, tracers = null, onPlayerHit = null } = {}) {
  const list = [];
  let nextId = 1;
  const api = { list, colliders, applyHit, update, spawn, reset, remove, hasLOS, aliveCount };

  function eye() { return { x: player.state.x, y: player.state.eyeHeight, z: player.state.z }; }

  function spawn(kind, x, z, { floorY = 0, bounds = null } = {}) {
    const S = SHAPE[kind];
    const C = config.monster[kind];
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

    // HP 바 (머리 위, 카메라를 향함) — targets.js와 같은 모양
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.06), new THREE.MeshBasicMaterial({ color: COLOR.barBg }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.04), new THREE.MeshBasicMaterial({ color: COLOR.bar }));
    fill.position.z = 0.001;
    bar.add(bg, fill);
    bar.position.y = S.body.h + S.head + 0.25;
    bar.visible = false;
    group.add(bar);

    // 원거리형 조준선 — 월드 좌표라 group이 아닌 scene에 붙인다. 길이 1의 원기둥(y축)을 scale·quaternion으로 맞춘다
    let laser = null;
    if (kind === 'ranged') {
      laser = new THREE.Mesh(
        new THREE.CylinderGeometry(LASER_RADIUS, LASER_RADIUS, 1, 6, 1, true),
        new THREE.MeshBasicMaterial({ color: COLOR.laser }),
      );
      laser.frustumCulled = false;
      laser.visible = false;
      scene.add(laser);
    }

    group.position.set(x, floorY, z);
    scene.add(group);

    const m = {
      id: `${kind}-${nextId++}`, kind, group, rig, bar, fill, laser,
      pos: { x, z }, yaw: 0, floorY, bounds,
      hp: C.hp, hpMax: C.hp, alive: true, dead: false,
      state: 'idle',       // idle | chase | attack(근접 준비) | cooldown | dead
      timer: 0,            // 상태 타이머 (s)
      aimT: 0,             // 원거리: 조준선이 보인 시간 (s)
      cooldownT: 0,        // 원거리: 발사 후 남은 대기 (s)
      laserFlash: 0,
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

  // 살아서 싸우는 수 (쓰러지는 연출 중은 제외) — 웨이브 종료 판정(T23)
  function aliveCount() {
    let n = 0;
    for (const m of list) if (m.alive && !m.dead) n++;
    return n;
  }

  function colliders() {
    const out = [];
    for (const m of list) if (m.alive && !m.dead) for (const c of m.colliders) out.push(c);
    return out;
  }

  // 몬스터 총구/눈(y MUZZLE_Y)에서 플레이어 눈까지 벽에 막히지 않는가
  function hasLOS(m) {
    const e = eye();
    const o = { x: m.pos.x, y: m.floorY + MUZZLE_Y, z: m.pos.z };
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
    const { damage, ratio } = computeDamage(weapon, hit.part, hit.distance);
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
    if (m.laser) m.laser.visible = false;
    m.rig.position.z = 0;
  }

  function remove(m) {
    m.alive = false;
    scene.remove(m.group);
    if (m.laser) scene.remove(m.laser);
    const i = list.indexOf(m);
    if (i >= 0) list.splice(i, 1);
  }

  function reset(defs) {
    for (const m of list.slice()) remove(m);
    for (const d of defs) spawn(d.kind, d.x, d.z, d);
  }

  const _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function setLaser(m, from, to, color) {
    _dir.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = _dir.length() || 1e-6;
    _dir.divideScalar(len);
    m.laser.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    m.laser.scale.set(1, len, 1);
    m.laser.quaternion.setFromUnitVectors(_up, _dir);
    m.laser.material.color.setHex(color);
    m.laser.visible = true;
  }
  // 조준선 끝점: 플레이어 가슴
  function laserEnd(e) { return { x: e.x, y: e.y - LASER_AIM_DROP, z: e.z }; }

  function fireRanged(m, C) {
    const e = eye();
    const dx = e.x - m.pos.x, dz = e.z - m.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const muzzle = { x: m.pos.x + dx / d * MUZZLE_FWD, y: m.floorY + MUZZLE_Y, z: m.pos.z + dz / d * MUZZLE_FWD };
    const vx = e.x - muzzle.x, vy = e.y - muzzle.y, vz = e.z - muzzle.z;
    const len = Math.hypot(vx, vy, vz) || 1;
    const dir = { x: vx / len, y: vy / len, z: vz / len };
    if (tracers) tracers.add(muzzle, laserEnd(e), dir);
    m.laserFlash = LASER_FLASH_TIME;
    setLaser(m, muzzle, laserEnd(e), COLOR.laserFlash);
    if (onPlayerHit) onPlayerHit(C.damage, 'ranged', m);
  }

  function update(dt, camera) {
    const e = eye();
    const R = config.monster.radius;

    for (const m of list) {
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
          if (dist <= C.reach) { m.state = 'attack'; m.timer = 0; }
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
        // 원거리형: 거리 유지
        if (m.state !== 'idle') {
          if (dist > C.preferDist) { mvx = ux; mvz = uz; }
          else if (dist < C.retreatDist) { mvx = -ux; mvz = -uz; }
        }
        // 조준 → 발사
        if (m.laserFlash > 0) {
          m.laserFlash -= dt;
          if (m.laserFlash <= 0) m.laser.visible = false;
        }
        if (m.cooldownT > 0) {
          m.cooldownT -= dt;
          m.aimT = 0;
        } else if (m.state !== 'idle' && dist <= C.fireRange && hasLOS(m)) {
          m.aimT += dt;
          if (m.aimT >= C.aimDelay) {
            fireRanged(m, C);
            m.aimT = 0;
            m.cooldownT = C.cooldown;
          } else {
            const muzzle = { x: m.pos.x + ux * MUZZLE_FWD, y: m.floorY + MUZZLE_Y, z: m.pos.z + uz * MUZZLE_FWD };
            setLaser(m, muzzle, laserEnd(e), COLOR.laser);
          }
        } else {
          m.aimT = 0;
          if (m.laserFlash <= 0) m.laser.visible = false;
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

    // 몬스터끼리 원 분리 (한 번)
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; if (!a.alive || a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]; if (!b.alive || b.dead) continue;
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
    }
  }

  return api;
}
