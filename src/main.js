import * as THREE from 'three';
import { config } from './config.js';
import { createRenderer } from './core/renderer.js';
import { startLoop } from './core/loop.js';

const canvas = document.getElementById('app');
const { renderer, scene, camera } = createRenderer(canvas);

// 임시 카메라 배치 — T02에서 1인칭 눈높이로 교체된다.
camera.position.set(0, 6, 12);
camera.lookAt(0, 0, 0);

// 바닥이 회색으로 보일 정도의 최소 조명
scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.6));

// 회색 바닥
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(config.ground.size, config.ground.size),
  new THREE.MeshLambertMaterial({ color: config.ground.color }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

startLoop(() => {
  renderer.render(scene, camera);
});
