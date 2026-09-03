import * as THREE from 'three';
import { config } from './config.js';
import { createRenderer } from './core/renderer.js';
import { startLoop } from './core/loop.js';
import { createMouseLook, createKeyboard } from './core/input.js';
import { buildTestRoom, PLAYER_START } from './stage/testRoom.js';
import { createPlayerCamera } from './player/camera.js';
import { createMovement } from './player/movement.js';
import { createSettingsPanel } from './ui/settingsPanel.js';

const canvas = document.getElementById('app');
const { renderer, scene, camera } = createRenderer(canvas);

// 조명 — 반구광(전체 밝기) + 방향광(박스 면 구분). 그림자 없음.
scene.add(new THREE.HemisphereLight(0xffffff, 0x8c8c8c, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(6, 12, 20);   // 플레이어 뒤쪽 위에서 앞벽을 비춘다
scene.add(sun);

// 회색 바닥
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(config.ground.size, config.ground.size),
  new THREE.MeshLambertMaterial({ color: config.ground.color }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// 테스트 공간 + 1인칭 카메라 + 입력 + 이동 + 조절 패널
const blocks = buildTestRoom(scene);
const player = createPlayerCamera(camera, PLAYER_START);
const mouseLook = createMouseLook(canvas, (dx, dy) => player.rotate(dx, dy));
const keyboard = createKeyboard(mouseLook);
const movement = createMovement(player, keyboard, blocks);
createSettingsPanel();

// 개발 서버에서만: 콘솔 검증용 (빌드에는 포함되지 않음)
if (import.meta.env.DEV) window.__debug = { player, movement, config };

startLoop((dt) => {
  movement.update(dt);
  player.apply();
  renderer.render(scene, camera);
});
