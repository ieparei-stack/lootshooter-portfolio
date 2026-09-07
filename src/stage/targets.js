import * as THREE from 'three';
import { computeDamage } from '../weapon/damage.js';
import { textTexture } from './range.js';

// 사격장 표적 (코드에 정의 — 데이터 파일은 무기만).
//   human: 몸통 박스 0.5×1.4×0.3 (y 0~1.4) + 머리 박스 0.3³ (y 1.4~1.7). HP 3000.
//          HP 0 → 뒤로 쓰러졌다가 3초 뒤 다시 선다. 쓰러진 동안은 맞지 않는다.
//   paper: 1.2m 정사각 세로 과녁판. 피해 없음, 탄자국만 남긴다. label이 있으면 판 위에 거리 표지판.
// 배치 (T17, 사용자 결정): 사격 라인 (0, 0) 기준 10 / 25 / 50m, 거리마다 과녁판(오른쪽) + 인간형(왼쪽).
// 먼 표적일수록 안쪽(x 작게)에 두어 앞 표적이 뒤 표적을 가리지 않는다 — 시작점에서 본 수평 각도 범위가
// 10m 19~25°, 25m 4~7°, 50m 0~1.5°로 서로 겹치지 않음 (레이캐스트 테스트로 확인).
export const TARGET_DEFS = [
  { id: 'paper-10m', kind: 'paper', pos: [4, 1.5, -10],    label: '10m' },
  { id: 'human-10m', kind: 'human', pos: [-4, 0, -10],     hp: 3000 },
  { id: 'paper-25m', kind: 'paper', pos: [2.5, 1.5, -25],  label: '25m' },
  { id: 'human-25m', kind: 'human', pos: [-2.5, 0, -25],   hp: 3000 },
  { id: 'paper-50m', kind: 'paper', pos: [0.7, 1.5, -50],  label: '50m' },
  { id: 'human-50m', kind: 'human', pos: [-0.7, 0, -50],   hp: 3000 },
];

const BODY = { w: 0.5, h: 1.4, d: 0.3 };
const HEAD = { s: 0.3 };
const PAPER = { size: 1.2, thick: 0.04 };
const DOWN_TIME = 3.0;      // 쓰러진 뒤 다시 서기까지 (s)
const FALL_TIME = 0.25;     // 쓰러지는 애니메이션 (s)
const FLASH_TIME = 0.1;     // 피격 반응 (s)
const COLOR = { body: 0xd8d8d8, head: 0xb0b0b0, flash: 0xffe08a, bar: 0x3ddc84, barBg: 0x202020 };

function paperTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 256, 256);
  const rings = [120, 96, 72, 48, 24];
  rings.forEach((r, i) => {
    g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2);
    g.fillStyle = i % 2 === 0 ? '#1e1e1e' : '#f4f1e8'; g.fill();
  });
  g.beginPath(); g.arc(128, 128, 8, 0, Math.PI * 2); g.fillStyle = '#c0392b'; g.fill();
  return new THREE.CanvasTexture(c);
}

export function createTargets(scene) {
  const targets = [];

  for (const def of TARGET_DEFS) {
    const group = new THREE.Group();
    group.position.set(def.pos[0], def.pos[1], def.pos[2]);
    scene.add(group);
    const [x, y, z] = def.pos;

    if (def.kind === 'human') {
      const bodyMat = new THREE.MeshLambertMaterial({ color: COLOR.body });
      const headMat = new THREE.MeshLambertMaterial({ color: COLOR.head });
      const body = new THREE.Mesh(new THREE.BoxGeometry(BODY.w, BODY.h, BODY.d), bodyMat);
      body.position.y = BODY.h / 2;
      const head = new THREE.Mesh(new THREE.BoxGeometry(HEAD.s, HEAD.s, HEAD.s), headMat);
      head.position.y = BODY.h + HEAD.s / 2;
      group.add(body, head);

      // HP 바 (머리 위, 카메라를 향함)
      const bar = new THREE.Group();
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.06), new THREE.MeshBasicMaterial({ color: COLOR.barBg }));
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.04), new THREE.MeshBasicMaterial({ color: COLOR.bar }));
      fill.position.z = 0.001;
      bar.add(bg, fill);
      bar.position.y = BODY.h + HEAD.s + 0.25;
      bar.visible = false;
      group.add(bar);

      targets.push({
        id: def.id, kind: 'human', def, group, hpMax: def.hp, hp: def.hp,
        down: false, downT: 0, flash: { body: 0, head: 0 },
        mats: { body: bodyMat, head: headMat }, bar, fill,
        colliders: [
          { part: 'body', min: [x - BODY.w / 2, y, z - BODY.d / 2], max: [x + BODY.w / 2, y + BODY.h, z + BODY.d / 2] },
          { part: 'head', min: [x - HEAD.s / 2, y + BODY.h, z - HEAD.s / 2], max: [x + HEAD.s / 2, y + BODY.h + HEAD.s, z + HEAD.s / 2] },
        ],
      });
    } else {
      const tex = paperTexture();
      const mat = tex ? new THREE.MeshLambertMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ color: 0xf4f1e8 });
      const plane = new THREE.Mesh(new THREE.BoxGeometry(PAPER.size, PAPER.size, PAPER.thick), mat);
      group.add(plane);
      if (def.label) {   // 판 위 거리 표지판 (T17). 먼 표적일수록 크게 — 50m에서도 읽히게
        const s = def.pos[2] <= -50 ? 2.0 : def.pos[2] <= -25 ? 1.4 : 1.0;
        const signTex = textTexture(def.label, { bg: '#2b2b2b' });
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(s, s / 4),
          signTex ? new THREE.MeshBasicMaterial({ map: signTex }) : new THREE.MeshBasicMaterial({ color: 0x2b2b2b }),
        );
        sign.position.y = PAPER.size / 2 + s / 8 + 0.1;
        group.add(sign);
      }
      targets.push({
        id: def.id, kind: 'paper', def, group, hpMax: 0, hp: 0, down: false,
        colliders: [
          { part: 'paper', min: [x - PAPER.size / 2, y - PAPER.size / 2, z - PAPER.thick / 2], max: [x + PAPER.size / 2, y + PAPER.size / 2, z + PAPER.thick / 2] },
        ],
      });
    }
    for (const c of targets[targets.length - 1].colliders) c.target = targets[targets.length - 1];
  }
  const api = { list: targets, colliders, applyHit, update };
  for (const t of targets) for (const c of t.colliders) c.system = api;   // T22: shooter가 명중한 시스템의 applyHit를 부른다

  // 지금 맞을 수 있는 콜라이더 목록 (쓰러진 표적 제외)
  function colliders() {
    const out = [];
    for (const t of targets) if (!t.down) for (const c of t.colliders) out.push(c);
    return out;
  }

  // 명중 처리. hit = raycastWorld 결과 (target, part, distance).
  function applyHit(hit, weapon) {
    const t = hit.target;
    if (!hit.part || !t || !t.kind) return { damage: 0, part: null, killed: false, ratio: 1 };   // 표적이 아닌 것
    if (t.kind === 'paper') return { damage: 0, part: 'paper', killed: false, ratio: 1 };
    if (t.down) return { damage: 0, part: hit.part, killed: false, ratio: 1 };
    const { damage, ratio } = computeDamage(weapon, hit.part, hit.distance, hit.damageMul ?? 1);   // T38 강화 배율
    t.hp = Math.max(0, t.hp - damage);
    t.flash[hit.part] = FLASH_TIME;
    let killed = false;
    if (t.hp === 0) { t.down = true; t.downT = 0; killed = true; }
    return { damage, part: hit.part, killed, ratio };
  }

  function update(dt, camera) {
    for (const t of targets) {
      if (t.kind !== 'human') continue;
      if (t.down) {
        t.downT += dt;
        t.group.rotation.x = -Math.PI / 2 * Math.min(1, t.downT / FALL_TIME);
        if (t.downT >= DOWN_TIME) { t.down = false; t.hp = t.hpMax; t.group.rotation.x = 0; }
      }
      for (const part of ['body', 'head']) {
        if (t.flash[part] > 0) {
          t.flash[part] -= dt;
          t.mats[part].color.setHex(t.flash[part] > 0 ? COLOR.flash : COLOR[part]);
        }
      }
      const ratio = t.hp / t.hpMax;
      t.bar.visible = !t.down && ratio < 1;
      if (t.bar.visible) {
        t.fill.scale.x = Math.max(0.001, ratio);
        t.fill.position.x = -(1 - ratio) * 0.29;
        if (camera) t.bar.lookAt(camera.position);
      }
    }
  }

  return api;
}
