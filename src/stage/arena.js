import * as THREE from 'three';
import { RANGE, floorText } from './range.js';
import { emit } from '../core/events.js';

// 전투 구역(방) 생성기 (T25 구역 1 → T26 방 4개로 일반화).
// 사용자 결정(2026-09-04): 문 뒤 새 방들, 플레이어 높이차 없음, 낮은 상자(1.1m) + 높은 벽(2.5m), 몬스터 전용 단(2m) 위에 원거리형·보스만.
// T26: 방은 −Z로 일렬. 각 방 뒷벽 가운데 문(폭 3)은 처음엔 문 블록으로 막혀 있다가 클리어 시 열린다(openDoor). 보스 방은 문 없음.
// BLOCKS 형식은 range.js와 같다 — 충돌은 무한 기둥(플레이어·근접형은 단에 못 오른다), 레이캐스트는 실제 높이.
// 배치는 Claude 임시 (CLAUDE.md 3-2).

const T = 0.5;          // 벽 두께
const H = 4;            // 벽 높이
const DOOR_HALF = RANGE.doorHalf;   // 문 반폭 1.5 (사격장 백스톱 문과 같음)

const COLOR = { wall: 0xdcdcdc, door: 0xb8b8c4, lowBox: 0xb59a6a, highWall: 0x6e6e72, platform: 0x8a8f9a };

const lowBox = (x, z, w = 2, d = 1.2) => ({ pos: [x, 0, z], size: [w, 1.1, d], color: COLOR.lowBox });
const highWall = (x, z, w = 3) => ({ pos: [x, 0, z], size: [w, 2.5, 0.5], color: COLOR.highWall });
const highWallZ = (x, z, len) => ({ pos: [x, 0, z], size: [0.5, 2.5, len], color: COLOR.highWall });   // 앞뒤(z) 방향 높은 벽 (T33)
const pillar = (x, z, w, d, h = 3) => ({ pos: [x, 0, z], size: [w, h, d], color: COLOR.highWall });      // 속이 찬 기둥 (T33)
const platform = (minX, maxX, minZ, maxZ, height = 2) => ({ minX, maxX, minZ, maxZ, height, bounds: { minX, maxX, minZ, maxZ } });

// 방 사양. zNear = 앞 방 뒷벽 바깥면(앞 방 zFar − T). prevCover = 앞 방 뒷벽이 덮는 반폭(앞 방 halfWidth + T) — 이보다 넓으면 앞벽 바깥 조각을 채운다
// T33 (사용자 결정 2026-09-07): 구역 1 유지 / 구역 2 갈림길(폭 20 × 깊이 40, 가운데 긴 벽) / 구역 3 중앙 기둥 요새(속 찬 기둥 + 낮은 상자 고리) / 단·문·웨이브 그대로.
// 근접형은 경로 탐색 없이 직진 + 미끄러짐(monsters.js)이라 오목한 모서리에 낀다 → 엄폐물끼리·옆벽과 틈 2.5 m 이상, 엄폐물은 서로 붙이지 않는다.
// T34 (사용자 결정 2026-09-06 C): 구역 1~3 단을 zFar+3 ~ zFar+9 에 두어 단 뒤 통로를 3 m로 (전엔 1 m). 유도선·빛기둥은 guide.js. 보스 방은 그대로.
export const ROOMS = [
  {
    id: 1, label: '구역 1', halfWidth: 15, zNear: -55.5, zFar: -86, doorBack: true, prevCover: RANGE.halfWidth + RANGE.wallThickness,
    platform: platform(-7, 7, -83, -77),
    cover: [
      lowBox(-4, -62), lowBox(4, -62), lowBox(0, -70, 3), lowBox(-9, -70), lowBox(9, -70),
      highWall(-7, -66), highWall(7, -66), highWall(-3, -75, 2.5), highWall(3, -75, 2.5),
    ],
  },
  {
    id: 2, label: '구역 2', halfWidth: 10, zNear: -86.5, zFar: -127, doorBack: true, prevCover: 15.5,   // 갈림길 — 좁고 길게(20 × 40)
    platform: platform(-7, 7, -124, -118),
    cover: [
      highWallZ(0, -103, 22),                       // 가운데 벽 z −114 ~ −92: 입구 5.5 m 앞부터 스폰 줄(−117) 3 m 앞까지
      highWall(-6, -100), highWall(6, -108),           // 통로마다 엇갈린 모퉁이 (옆벽까지 2.5, 가운데 벽까지 4.25)
      lowBox(-4, -94), lowBox(6, -96), lowBox(-6.5, -110), lowBox(4, -104),
    ],
  },
  {
    id: 3, label: '구역 3', halfWidth: 15, zNear: -127.5, zFar: -158, doorBack: true, prevCover: 10.5,   // 중앙 기둥 요새 (30 × 30)
    platform: platform(-7, 7, -155, -149),
    cover: [
      pillar(0, -139, 6, 6),                        // 기둥 x −3~3, z −142~−136, 높이 3 — 붙어 있으면 단 위 원거리형 시야가 끊긴다
      lowBox(0, -131.5, 3), lowBox(-7.5, -139, 1.2, 3), lowBox(7.5, -139, 1.2, 3),   // 고리 앞·좌·우 (뒤는 근접형 스폰 줄 −146과 유도선 때문에 비움 — T34)
      lowBox(-5.5, -132.5), lowBox(5.5, -132.5),      // 고리 앞 대각
      lowBox(-11, -134), lowBox(11, -134),          // 입구 쪽 바깥 — 들어서서 처음 숨을 곳
    ],
  },
  {
    id: 4, label: '보스', boss: true, halfWidth: 20, zNear: -158.5, zFar: -208, doorBack: false, prevCover: 15.5,   // T33: 구역 2가 10 m 길어져 z −10
    platform: platform(-10, 10, -207, -199),
    cover: [
      lowBox(-6, -168), lowBox(6, -168), lowBox(0, -171, 4), lowBox(-12, -180), lowBox(12, -180), lowBox(-5, -188), lowBox(5, -188),   // 입구 정면은 낮은 상자 — 들어서며 보스가 보이게
      highWall(-5, -176), highWall(5, -176), highWall(-11, -175), highWall(11, -175), highWall(-3, -193), highWall(3, -193), highWall(-14, -190), highWall(14, -190),   // 가운데 x 0 은 비워 보스 조준선이 입구까지 닿게
    ],
  },
];

// T25 호환 (구역 1 단)
export const PLATFORM = ROOMS[0].platform;

function meshOf(b) {
  const [w, h, d] = b.size;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: b.color }));
  mesh.position.set(b.pos[0], b.pos[1] + h / 2, b.pos[2]);
  return mesh;
}

// 방 하나를 만들고 블록을 공용 blocks 배열에 push 한다. 반환: room 런타임 객체
export function buildRoom(scene, blocks, spec) {
  const hw = spec.halfWidth, zMid = (spec.zNear + spec.zFar) / 2, depth = spec.zNear - spec.zFar;
  const own = [
    { pos: [-(hw + T / 2), 0, zMid], size: [T, H, depth], color: COLOR.wall },   // 좌
    { pos: [ (hw + T / 2), 0, zMid], size: [T, H, depth], color: COLOR.wall },   // 우
  ];
  // 앞벽 바깥 조각 (앞 방보다 넓을 때). 앞 방 뒷벽과 같은 z (zNear + T/2)
  if (hw + T > spec.prevCover) {
    const w = hw + T - spec.prevCover, cx = (spec.prevCover + hw + T) / 2, z = spec.zNear + T / 2;
    own.push({ pos: [-cx, 0, z], size: [w, H, T], color: COLOR.wall }, { pos: [cx, 0, z], size: [w, H, T], color: COLOR.wall });
  }
  // 뒷벽: 문 있으면 두 장 + 문 블록, 없으면 한 장
  const zb = spec.zFar - T / 2;
  let door = null;
  if (spec.doorBack) {
    own.push(
      { pos: [-(hw + T + DOOR_HALF) / 2, 0, zb], size: [hw + T - DOOR_HALF, H, T], color: COLOR.wall },
      { pos: [ (hw + T + DOOR_HALF) / 2, 0, zb], size: [hw + T - DOOR_HALF, H, T], color: COLOR.wall },
    );
    door = { pos: [0, 0, zb], size: [DOOR_HALF * 2, H, T], color: COLOR.door, door: true };
  } else {
    own.push({ pos: [0, 0, zb], size: [hw * 2 + T * 2, H, T], color: COLOR.wall });
  }
  // 엄폐물 + 단
  const p = spec.platform;
  own.push(...spec.cover);
  own.push({ pos: [(p.minX + p.maxX) / 2, 0, (p.minZ + p.maxZ) / 2], size: [p.maxX - p.minX, p.height, p.maxZ - p.minZ], color: COLOR.platform, platform: true });

  for (const b of own) { scene.add(meshOf(b)); blocks.push(b); }
  const doorMesh = door ? meshOf(door) : null;
  // T54 입구 봉쇄 블록: 앞 방 뒷벽의 문 자리(zNear + T/2, 구역 1은 사격장 백스톱 문과 같은 z). 웨이브 시작 시 sealEntrance로 넣고 M 리셋에서만 뺀다
  const entrance = { pos: [0, 0, spec.zNear + T / 2], size: [DOOR_HALF * 2, H, T], color: COLOR.door, entrance: true };
  const entranceMesh = meshOf(entrance);
  const room = { spec, id: spec.id, label: spec.label, boss: !!spec.boss, platform: p, door, doorMesh, open: false, entrance, entranceMesh, sealed: false,
    triggerZ: spec.zNear - 0.5, endZ: spec.zFar, floorZ: p.maxZ + 3 };   // 발동 = triggerZ~endZ 사이(이 방 안). floorZ = 단 앞 바닥 스폰 줄
  closeDoor(room, scene, blocks);
  floorText(scene, spec.label, 0, spec.zNear - 4, 3);
  return room;
}

// 문 열기/닫기 — 공용 blocks 배열에서 문 블록을 빼고/넣고 메시를 씬에서 뺀다/넣는다. blocks는 movement·shooter·monsters가 같은 참조를 본다
export function openDoor(room, scene, blocks) {
  if (!room.door || room.open) return;
  const i = blocks.indexOf(room.door);
  if (i >= 0) blocks.splice(i, 1);
  scene.remove(room.doorMesh);
  room.open = true;
  emit('door');
}
// T54 입구 봉쇄/개방 — 웨이브 시작 시 뒤쪽(들어온) 문 자리를 벽으로 막는다. 계속 닫힘(사용자 결정 2026-09-07), stage.reset에서만 연다
export function sealEntrance(room, scene, blocks) {
  if (room.sealed) return;
  if (!blocks.includes(room.entrance)) blocks.push(room.entrance);
  if (scene && !room.entranceMesh.parent) scene.add(room.entranceMesh);
  room.sealed = true;
  emit('door');
}
export function unsealEntrance(room, scene, blocks) {
  if (!room.sealed) return;
  const i = blocks.indexOf(room.entrance);
  if (i >= 0) blocks.splice(i, 1);
  if (scene) scene.remove(room.entranceMesh);
  room.sealed = false;
}
export function closeDoor(room, scene, blocks) {
  if (!room.door) return;
  if (!blocks.includes(room.door)) blocks.push(room.door);
  if (room.open || !room.doorMesh.parent) scene.add(room.doorMesh);
  room.open = false;
}
