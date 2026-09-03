import { config } from '../config.js';

const DEG = Math.PI / 180;

// 1인칭 카메라. 플레이어 발 위치(x, z)에 눈높이를 더해 카메라를 놓고,
// yaw/pitch 두 각도(도 단위)로 시점을 돌린다.
// FOV는 여기에 개입하지 않는다 — 반동·퍼짐 각도가 FOV와 무관하게 그대로 적용되기 위한 토대.
export function createPlayerCamera(camera, start) {
  const state = {
    x: start.x,
    z: start.z,
    eyeHeight: config.player.eyeHeight,
    yaw: 0,      // 도. 0 = -Z 방향. 왼쪽으로 돌면 증가
    pitch: 0,    // 도. 위를 보면 증가
  };

  camera.rotation.order = 'YXZ';

  function apply() {
    camera.position.set(state.x, state.eyeHeight, state.z);
    camera.rotation.y = state.yaw * DEG;
    camera.rotation.x = state.pitch * DEG;
  }

  // 마우스 이동(px) → 회전. 시뮬레이터와 같은 공식: 각도 = px × (감도 / 100)
  function rotate(dxPx, dyPx) {
    const degPerPx = config.mouse.sensitivity / 100;
    state.yaw -= dxPx * degPerPx;
    state.pitch -= dyPx * degPerPx;
    const lim = config.mouse.pitchLimit;
    if (state.pitch > lim) state.pitch = lim;
    if (state.pitch < -lim) state.pitch = -lim;
  }

  apply();
  return { state, apply, rotate };
}
