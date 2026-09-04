import * as THREE from 'three';
import { RANGE, floorText } from './range.js';

// 전투 구역 1 (T25). 사격장 백스톱(z −55) 문 뒤의 방. 사용자 결정(2026-09-04): 문 뒤 새 방, 플레이어 높이차 없음,
// 낮은 상자(1.1m, 웅크리면 가려짐) + 높은 벽(2.5m), 몬스터 전용 단(2m) 위에 원거리형만.
// BLOCKS 형식은 range.js와 같다 — 충돌은 무한 기둥(플레이어·근접형은 단에 못 오른다), 레이캐스트는 실제 높이.
// 배치는 Claude 임시 (CLAUDE.md 3-2).

export const ARENA = {
  halfWidth: 15,       // x −15 ~ +15
  zNear: -55.5,        // 백스톱 바깥면 (백스톱이 곧 앞벽)
  zFar: -86,           // 뒷벽 안쪽면
  wallHeight: 4,
  wallThickness: 0.5,
};

// 몬스터 전용 단. 원거리형은 spawn 시 floorY/bounds로 이 위에만 있는다
export const PLATFORM = {
  height: 2,
  minX: -7, maxX: 7, minZ: -85, maxZ: -79,
};
PLATFORM.bounds = { minX: PLATFORM.minX, maxX: PLATFORM.maxX, minZ: PLATFORM.minZ, maxZ: PLATFORM.maxZ };

const COLOR = { wall: 0xdcdcdc, lowBox: 0xb59a6a, highWall: 0x6e6e72, platform: 0x8a8f9a };

const hw = ARENA.halfWidth, t = ARENA.wallThickness, H = ARENA.wallHeight;
const zMid = (ARENA.zNear + ARENA.zFar) / 2, depth = ARENA.zNear - ARENA.zFar;
const rhw = RANGE.halfWidth + RANGE.wallThickness;   // 사격장 백스톱이 덮는 반폭 (10.5)

const lowBox = (x, z, w = 2, d = 1.2) => ({ pos: [x, 0, z], size: [w, 1.1, d], color: COLOR.lowBox });
const highWall = (x, z, w = 3) => ({ pos: [x, 0, z], size: [w, 2.5, 0.5], color: COLOR.highWall });

export const ARENA_BLOCKS = [
  // 벽 — 좌·우·뒤 + 앞벽 중 백스톱이 못 덮는 바깥쪽 두 조각 (x ±10.5 ~ ±15.5)
  { pos: [-(hw + t / 2), 0, zMid], size: [t, H, depth], color: COLOR.wall },
  { pos: [ (hw + t / 2), 0, zMid], size: [t, H, depth], color: COLOR.wall },
  { pos: [0, 0, ARENA.zFar - t / 2], size: [hw * 2 + t * 2, H, t], color: COLOR.wall },
  { pos: [-(rhw + hw + t) / 2, 0, RANGE.zFar - RANGE.wallThickness / 2], size: [hw + t - rhw, H, RANGE.wallThickness], color: COLOR.wall },
  { pos: [ (rhw + hw + t) / 2, 0, RANGE.zFar - RANGE.wallThickness / 2], size: [hw + t - rhw, H, RANGE.wallThickness], color: COLOR.wall },
  // 낮은 상자 1.1m
  lowBox(-4, -62), lowBox(4, -62), lowBox(0, -70, 3), lowBox(-9, -70), lowBox(9, -70),
  // 높은 벽 2.5m
  highWall(-7, -66), highWall(7, -66), highWall(-3, -75, 2.5), highWall(3, -75, 2.5),
  // 몬스터 단 2m
  { pos: [(PLATFORM.minX + PLATFORM.maxX) / 2, 0, (PLATFORM.minZ + PLATFORM.maxZ) / 2],
    size: [PLATFORM.maxX - PLATFORM.minX, PLATFORM.height, PLATFORM.maxZ - PLATFORM.minZ], color: COLOR.platform, platform: true },
];

export function buildArena(scene) {
  for (const b of ARENA_BLOCKS) {
    const [w, h, d] = b.size;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: b.color }));
    mesh.position.set(b.pos[0], b.pos[1] + h / 2, b.pos[2]);
    scene.add(mesh);
  }
  floorText(scene, '구역 1', 0, -59.5, 3);
  return ARENA_BLOCKS;
}
