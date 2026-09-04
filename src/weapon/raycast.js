// 시선 방향 레이캐스트 — 벽·상자(testRoom.js BLOCKS 형식), 바닥(y=0), 그리고 표적 콜라이더.
const DEG = Math.PI / 180;

// 카메라 규약: yaw > 0 = 왼쪽, 0 = -Z 방향. pitch > 0 = 위. 단위 벡터를 돌려준다.
export function directionFromAngles(yawDeg, pitchDeg) {
  const y = yawDeg * DEG, p = pitchDeg * DEG;
  const cp = Math.cos(p);
  return { x: -Math.sin(y) * cp, y: Math.sin(p), z: -Math.cos(y) * cp };
}

// 레이 대 AABB(slab). 맞으면 { t, normal } 아니면 null.
export function rayBox(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
  const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(da[i]) < 1e-9) {
      if (oa[i] < min[i] || oa[i] > max[i]) return null;
      continue;
    }
    let t1 = (min[i] - oa[i]) / da[i];
    let t2 = (max[i] - oa[i]) / da[i];
    let s = -1;                       // t1이 min 면이면 법선은 -축
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  if (tmin < 0) return null;         // 시작점이 박스 안 — 바깥 면만 판정
  const normal = { x: 0, y: 0, z: 0 };
  if (axis === 0) normal.x = sign; else if (axis === 1) normal.y = sign; else normal.z = sign;
  return { t: tmin, normal };
}

// 가장 가까운 충돌.
//   { point, normal, distance, target: block | 'ground' }            — 벽·상자·바닥
//   { point, normal, distance, target: 표적, part: 'body'|'head'|'paper' } — 표적 콜라이더 { min, max, part, target }
// 또는 null.
export function raycastWorld(origin, dir, blocks, maxDist = 500, colliders = []) {
  let best = null;
  for (const b of blocks) {
    const min = [b.pos[0] - b.size[0] / 2, b.pos[1], b.pos[2] - b.size[2] / 2];
    const max = [b.pos[0] + b.size[0] / 2, b.pos[1] + b.size[1], b.pos[2] + b.size[2] / 2];
    const h = rayBox(origin, dir, min, max);
    if (h && h.t <= maxDist && (!best || h.t < best.distance)) best = { distance: h.t, normal: h.normal, target: b };
  }
  for (const c of colliders) {
    const h = rayBox(origin, dir, c.min, c.max);
    if (h && h.t <= maxDist && (!best || h.t < best.distance)) {
      best = { distance: h.t, normal: h.normal, target: c.target, part: c.part, collider: c };
    }
  }
  if (dir.y < -1e-9) {
    const t = -origin.y / dir.y;
    if (t >= 0 && t <= maxDist && (!best || t < best.distance)) best = { distance: t, normal: { x: 0, y: 1, z: 0 }, target: 'ground' };
  }
  if (!best) return null;
  best.point = {
    x: origin.x + dir.x * best.distance,
    y: origin.y + dir.y * best.distance,
    z: origin.z + dir.z * best.distance,
  };
  return best;
}
