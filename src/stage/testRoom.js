import * as THREE from 'three';

// 1단계 테스트 공간. 벽·상자·기둥을 전부 "박스 목록"으로 정의한다.
// T05 벽 충돌은 이 BLOCKS 목록을 그대로 읽어 판정한다.
//
// 항목: { pos: [x, y, z], size: [w, h, d], color }
//   pos.x/z = 박스 중심, pos.y = 바닥 기준 밑면 높이

export const ROOM = { width: 40, depth: 30, wallHeight: 4, wallThickness: 0.5 };

// 플레이어 시작 위치. -Z(방 중앙) 방향을 본다.
export const PLAYER_START = { x: 0, z: 10 };

const COLOR = { wall: 0xdcdcdc, crate: 0x6e6e6e, column: 0x5a5a5a };

const hw = ROOM.width / 2;
const hd = ROOM.depth / 2;
const t = ROOM.wallThickness;
const H = ROOM.wallHeight;

export const BLOCKS = [
  // 벽 4면 — 바닥 가장자리 바깥에 붙여 안쪽 공간이 정확히 40×30이 되게 한다
  { pos: [0, 0, -(hd + t / 2)], size: [ROOM.width + t * 2, H, t], color: COLOR.wall },
  { pos: [0, 0,  (hd + t / 2)], size: [ROOM.width + t * 2, H, t], color: COLOR.wall },
  { pos: [-(hw + t / 2), 0, 0], size: [t, H, ROOM.depth], color: COLOR.wall },
  { pos: [ (hw + t / 2), 0, 0], size: [t, H, ROOM.depth], color: COLOR.wall },

  // 상자 1m³ — 시작 위치에서 5m 안팎
  { pos: [-3,   0, 5],   size: [1, 1, 1], color: COLOR.crate },
  { pos: [ 2.5, 0, 4],   size: [1, 1, 1], color: COLOR.crate },
  { pos: [ 4,   0, 6.5], size: [1, 1, 1], color: COLOR.crate },

  // 낮은 엄폐물 — 8m 앞
  { pos: [0, 0, 2], size: [3, 1.5, 1], color: COLOR.crate },

  // 상자 2m³ — 10~15m
  { pos: [-6, 0, -2], size: [2, 2, 2], color: COLOR.crate },
  { pos: [ 7, 0, -5], size: [2, 2, 2], color: COLOR.crate },

  // 기둥 1×6×1 — 12~18m, 좌·중·우
  { pos: [-8,   0, -8], size: [1, 6, 1], color: COLOR.column },
  { pos: [ 1.5, 0, -7], size: [1, 6, 1], color: COLOR.column },
  { pos: [ 9,   0, -6], size: [1, 6, 1], color: COLOR.column },
];

// BLOCKS를 메시로 만들어 scene에 넣는다. 반환값은 BLOCKS 그대로(충돌용).
export function buildTestRoom(scene) {
  for (const b of BLOCKS) {
    const [w, h, d] = b.size;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: b.color }),
    );
    mesh.position.set(b.pos[0], b.pos[1] + h / 2, b.pos[2]);
    scene.add(mesh);
  }
  return BLOCKS;
}
