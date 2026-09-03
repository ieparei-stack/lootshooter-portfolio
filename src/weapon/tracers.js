import * as THREE from 'three';
import { directionFromAngles } from './raycast.js';

const DEG = Math.PI / 180;
const LIFE = 0.08;          // 트레이서 표시 시간 (s). 시뮬레이터 90ms
const MISS_LENGTH = 100;    // 빗나갔을 때 선 길이 (m)

// 총구 위치 — 총 모델이 없으므로 카메라 기준 오른쪽 0.25 / 아래 0.2 / 앞 0.4m. 눈에서 선이 나가면 안 보인다.
export function muzzlePosition(origin, yawDeg, pitchDeg) {
  const f = directionFromAngles(yawDeg, pitchDeg);
  const y = yawDeg * DEG;
  const r = { x: Math.cos(y), y: 0, z: -Math.sin(y) };
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };   // right × forward = up
  return {
    x: origin.x + r.x * 0.25 - u.x * 0.2 + f.x * 0.4,
    y: origin.y + r.y * 0.25 - u.y * 0.2 + f.y * 0.4,
    z: origin.z + r.z * 0.25 - u.z * 0.2 + f.z * 0.4,
  };
}

export function createTracers(scene, poolSize = 30) {
  const pool = [];
  for (let i = 0; i < poolSize; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    pool.push({ line, t: LIFE });
  }
  let next = 0;

  // from/to: {x,y,z}. to가 없으면 dir 방향으로 MISS_LENGTH
  function add(from, to, dir) {
    const end = to || { x: from.x + dir.x * MISS_LENGTH, y: from.y + dir.y * MISS_LENGTH, z: from.z + dir.z * MISS_LENGTH };
    const tr = pool[next];
    next = (next + 1) % pool.length;
    const a = tr.line.geometry.attributes.position.array;
    a[0] = from.x; a[1] = from.y; a[2] = from.z;
    a[3] = end.x; a[4] = end.y; a[5] = end.z;
    tr.line.geometry.attributes.position.needsUpdate = true;
    tr.t = 0;
    tr.line.visible = true;
    tr.line.material.opacity = 1;
  }

  function update(dt) {
    for (const tr of pool) {
      if (!tr.line.visible) continue;
      tr.t += dt;
      if (tr.t >= LIFE) { tr.line.visible = false; tr.line.material.opacity = 0; }
      else tr.line.material.opacity = 1 - tr.t / LIFE;
    }
  }

  return { add, update, pool, LIFE };
}
