import * as THREE from 'three';

// 3단계 사격장 (T17). 1·2단계 테스트 공간(testRoom.js)을 대신한다.
// 좌표: 사격 라인 = z 0, 사거리 방향 = −Z. 표적은 10 / 25 / 50m (사용자 결정, SPEC TBD #9).
// 우측 벽 안쪽 면이 x = +10 → 사격 라인에서 정확히 10m. 이 벽이 탄착군 벽이다.
//
// BLOCKS 형식은 testRoom.js와 같다: { pos: [x, y, z], size: [w, h, d], color }
//   pos.x/z = 박스 중심, pos.y = 바닥 기준 밑면 높이. 충돌(collision.js)과 레이캐스트(raycast.js)가 그대로 읽는다.

export const RANGE = {
  halfWidth: 10,       // x −10 ~ +10
  zNear: 5,            // 뒷벽 (플레이어 뒤)
  zFar: -55,           // 백스톱 벽 (50m 표적 뒤 5m)
  wallHeight: 4,
  wallThickness: 0.5,
  distances: [10, 25, 50],
};

// 플레이어 시작 위치 = 사격 라인. −Z를 본다.
export const PLAYER_START = { x: 0, z: 0 };

const COLOR = { wall: 0xdcdcdc, panel: 0xf5f5f0, line: 0xffffff, text: '#ffffff' };

const hw = RANGE.halfWidth;
const t = RANGE.wallThickness;
const H = RANGE.wallHeight;
const zMid = (RANGE.zNear + RANGE.zFar) / 2;
const depth = RANGE.zNear - RANGE.zFar;

export const BLOCKS = [
  // 벽 4면 — 안쪽 공간이 정확히 20 × 60
  { pos: [0, 0, RANGE.zFar - t / 2],  size: [hw * 2 + t * 2, H, t], color: COLOR.wall },   // 백스톱
  { pos: [0, 0, RANGE.zNear + t / 2], size: [hw * 2 + t * 2, H, t], color: COLOR.wall },   // 뒷벽
  { pos: [-(hw + t / 2), 0, zMid],    size: [t, H, depth], color: COLOR.wall },             // 좌측
  { pos: [ (hw + t / 2), 0, zMid],    size: [t, H, depth], color: COLOR.wall },             // 우측 = 탄착 벽 (안쪽 면 x = +10)
  // 탄착 패널 — 우측 벽 안쪽에 붙인 밝은 판. z −6 ~ +6, 높이 0.5 ~ 3.5. 벽 면과 겹치지 않게 절반은 벽 속에 (안쪽 면 x = 9.995)
  { pos: [hw, 0.5, 0], size: [0.01, 3, 12], color: COLOR.panel },
];

// 캔버스 글자 텍스처. 바닥·표지판에 쓴다.
export function textTexture(text, { w = 512, h = 128, font = 'bold 96px system-ui, sans-serif', bg = null } = {}) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = COLOR.text;
  g.font = font;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 바닥 장식 (블록 아님 — 충돌·레이캐스트에 안 잡힘). 바닥 평면(y 0)과 z-fighting을 피하려고
// y 0.01 + polygonOffset. 먼 거리(50m)에서는 0.001 차이가 깊이 정밀도보다 작아 사라진다 (헤드리스 확인).
// T23: waves.js가 트리거 존 표시에 같은 도구를 쓰므로 export.
export const FLOOR_Y = 0.01;
export const floorMat = (opts) => new THREE.MeshBasicMaterial({ ...opts, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
export function floorLine(scene, z, width, thickness = 0.12, opts = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, thickness), floorMat({ color: COLOR.line, ...opts }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, FLOOR_Y, z);
  scene.add(m);
  return m;
}
// 글자를 사거리 방향으로 4배 늘린다(도로 표지처럼) — 서서 보면 바닥이 얕은 각도로 눌려 보이므로 늘려야 원래 비율로 읽힌다.
// faceYaw: 글자 위쪽이 향하는 방향 (° , 0 = −Z 사거리 방향, −90 = +X 우측 벽 방향). 읽는 사람이 그쪽을 볼 때 바로 읽힌다.
export function floorText(scene, text, x, z, width = 3, stretch = 4, faceYaw = 0) {
  const tex = textTexture(text);
  if (!tex) return null;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4 * stretch),
    floorMat({ map: tex, transparent: true }),
  );
  m.rotation.set(-Math.PI / 2, faceYaw * Math.PI / 180, 0, 'YXZ');   // 눕힌 뒤 세로축으로 돌린다
  m.position.set(x, FLOOR_Y, z);
  scene.add(m);
  return m;
}

// BLOCKS를 메시로 만들고 바닥 표시를 그린다. 반환값은 BLOCKS 그대로(충돌·레이캐스트용).
export function buildRange(scene) {
  for (const b of BLOCKS) {
    const [w, h, d] = b.size;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: b.color }));
    mesh.position.set(b.pos[0], b.pos[1] + h / 2, b.pos[2]);
    scene.add(mesh);
  }
  // 사격 라인
  floorLine(scene, 0, hw * 2);
  floorText(scene, '사격 라인 0m', 0, 2.5, 3);
  // 거리별 가로줄 + 글자 (줄 앞 1.5m, 멀수록 크게 — 사격 라인에서 읽히도록)
  for (const d of RANGE.distances) {
    floorLine(scene, -d, hw * 2);
    floorText(scene, `${d}m`, 0, -d + 3.5, d >= 50 ? 6 : d >= 25 ? 4.5 : 3);
  }
  // 탄착 벽 표시 (바닥, 우측 벽 앞)
  floorText(scene, '탄착 벽 10m', hw - 3, 0, 3, 4, -90);
  return BLOCKS;
}
