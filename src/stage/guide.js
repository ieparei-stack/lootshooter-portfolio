import * as THREE from 'three';
import { RANGE, floorMat, FLOOR_Y } from './range.js';

// T34 클리어 후 다음 구역 안내. 사용자 결정(2026-09-06): A 바닥 유도선 + B 문 강조 (+ C 통로 넓힘은 arena.js 단 위치).
// 방 하나당 인스턴스 하나. 블록이 아니라 장식 — 충돌·레이캐스트에 안 잡힌다. 생성 시 숨김, 클리어 시 show(), 문을 지나거나 리셋하면 hide().
//   A: 단 앞 가운데 → 단 옆(+x)으로 → 단 뒤 통로 → 문 앞 → 문 너머. 초록 점선 조각이 문 방향으로 흐른다.
//   B: 열린 문 자리에 12 m 초록 빛기둥(벽 4 m 위로 솟아 단·벽 너머에서도 보임) + 문틀 기둥 2개.
// 수치는 전부 Claude 임시 (CLAUDE.md 3-2).

const G = {
  color: 0x40e080, frameColor: 0x60ff90,
  dash: 0.8, gapLen: 0.5, width: 0.35,       // 점선 조각 길이 / 간격 / 폭
  sideGap: 2,                                 // 단 옆으로 얼마나 떨어져 도는지 (m)
  beamHeight: 12, beamOpacity: 0.3,
  flowSpeed: 4, flowStep: 0.9,                // 흐름 효과 sin(flowSpeed·t − flowStep·i)
};

export function createGuide(scene, room) {
  const p = room.platform, zFar = room.spec.zFar;
  const sideX = p.maxX + G.sideGap;
  const path = [
    [0, p.maxZ + 3], [sideX, p.maxZ + 3], [sideX, zFar + 1.5], [0, zFar + 1.5], [0, zFar - 1.5],
  ];
  const group = new THREE.Group();
  group.visible = false;

  // A 점선 조각 — 선분마다 dash+gap 간격으로. 문에 가까울수록 i가 크다 → 흐름이 문 쪽으로 간다
  const dashes = [];
  for (let s = 0; s < path.length - 1; s++) {
    const [x0, z0] = path[s], [x1, z1] = path[s + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    const yaw = Math.atan2(ux, uz);   // 조각의 긴 축(z)을 진행 방향으로
    for (let d = 0; d + G.dash <= len + 1e-6; d += G.dash + G.gapLen) {
      const c = d + G.dash / 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(G.width, G.dash), floorMat({ color: G.color, transparent: true, opacity: 1 }));
      m.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
      m.position.set(x0 + ux * c, FLOOR_Y + 0.005, z0 + uz * c);
      group.add(m);
      dashes.push(m);
    }
  }

  // B 빛기둥 + 문틀
  const zDoor = zFar - 0.25;   // 문 블록 중심 (뒷벽 두께 0.5)
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(RANGE.doorHalf * 2, G.beamHeight, 0.6),
    new THREE.MeshBasicMaterial({ color: G.color, transparent: true, opacity: G.beamOpacity, depthWrite: false }),
  );
  beam.position.set(0, G.beamHeight / 2, zDoor);
  group.add(beam);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4, 0.6), new THREE.MeshBasicMaterial({ color: G.frameColor }));
    post.position.set(sx * (RANGE.doorHalf + 0.125), 2, zDoor);
    group.add(post);
  }
  scene.add(group);

  let t = 0;
  function show() { group.visible = true; t = 0; }
  function hide() { group.visible = false; }
  function update(dt) {
    if (!group.visible) return;
    t += dt;
    for (let i = 0; i < dashes.length; i++) dashes[i].material.opacity = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(G.flowSpeed * t - G.flowStep * i));
  }
  return { group, path, show, hide, update, get visible() { return group.visible; } };
}
