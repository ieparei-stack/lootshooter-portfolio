import { config } from '../config.js';

// 카메라 FOV 적용. 매 프레임 목표 FOV(지향/정조준)를 정하고, 바뀐 프레임에만 카메라에 반영한다.
// T06: 우클릭 유지 = 정조준 FOV 즉시 전환(미리보기). T11에서 ads.time 보간으로 대체된다.
export function createView(camera, mouseButtons) {
  const state = { fov: null, ads: false };

  function update() {
    state.ads = mouseButtons.isDown(2);
    const target = state.ads ? config.render.adsFov : config.render.fov;
    if (target !== state.fov) {
      state.fov = target;
      camera.fov = target;
      camera.updateProjectionMatrix();
    }
  }

  return { state, update };
}
