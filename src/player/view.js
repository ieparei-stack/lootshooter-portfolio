import { config } from '../config.js';

// 카메라 FOV. 정조준 진행도(ads.state.ease)로 지향 FOV ↔ 정조준 FOV를 보간한다.
// getAds는 현재 무기의 ads를 돌려주는 함수 (T16 무기 전환으로 ads가 바뀌므로 참조를 고정하지 않는다).
// 바뀐 프레임에만 카메라를 갱신한다. (T06의 즉시 전환은 이것으로 대체 — 사용자 메모 1: 부드럽게)
export function createView(camera, getAds) {
  const state = { fov: null };

  function update() {
    const hip = config.render.fov, aim = config.render.adsFov;
    const target = hip + (aim - hip) * getAds().state.ease;
    if (target !== state.fov) {
      state.fov = target;
      camera.fov = target;
      camera.updateProjectionMatrix();
    }
  }

  return { state, update };
}
