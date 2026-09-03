import { config } from '../config.js';

// 1인칭 카메라. 플레이어 발 위치(x, z)에 눈높이를 더해 카메라를 놓는다.
// T02: 시작 위치에 두고 -Z 방향을 본다. 회전(yaw/pitch)은 T03, 이동은 T04에서 추가.
export function createPlayerCamera(camera, start) {
  const state = {
    x: start.x,
    z: start.z,
    eyeHeight: config.player.eyeHeight,
  };

  function apply() {
    camera.position.set(state.x, state.eyeHeight, state.z);
  }

  apply();
  camera.lookAt(state.x, state.eyeHeight, state.z - 1);

  return { state, apply };
}
