import * as THREE from 'three';
import { config } from '../config.js';

// 렌더러·씬·카메라를 만들고 창 크기 변경에 맞춰 준다.
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.render.maxPixelRatio));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.render.backgroundColor);

  const camera = new THREE.PerspectiveCamera(
    config.render.fov, 1, config.render.near, config.render.far,
  );

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, resize };
}
