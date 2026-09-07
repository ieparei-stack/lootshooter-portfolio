import { config } from '../config.js';

const DEG = Math.PI / 180;

// 1인칭 카메라. 플레이어 발 위치(x, z)에 눈높이를 더해 카메라를 놓고,
// 조준각(yaw/pitch, 플레이어가 마우스로 정한 각) + 반동 오프셋(offYaw/offPitch, 총이 밀어올린 각)의
// 합으로 시점을 돌린다. 두 값을 분리해 두어야 복귀(T09)가 반동만 되돌릴 수 있다.
// T35: 여기 off*는 탄도 누적 반동 × weapon.viewTracking (카메라가 따라가는 몫). main.js가 매 프레임 넣는다.
// FOV는 여기에 개입하지 않는다 — 반동·퍼짐 각도가 FOV와 무관하게 그대로 적용되기 위한 토대.
//
// 부호: yaw > 0 = 왼쪽, pitch > 0 = 위 (카메라 규약)
//       offYaw > 0 = 오른쪽, offPitch > 0 = 위 (시뮬레이터 규약) → 합성 시 yaw에서 offYaw를 뺀다
export function createPlayerCamera(camera, start) {
  const state = {
    x: start.x,
    z: start.z,
    eyeHeight: config.player.eyeHeight,
    yaw: 0,        // 도. 0 = -Z 방향
    pitch: 0,      // 도
    offYaw: 0,     // 도, 반동 (T08 recoil.js가 씀)
    offPitch: 0,   // 도, 반동
  };

  camera.rotation.order = 'YXZ';

  function apply() {
    const lim = config.mouse.pitchLimit;
    const finalPitch = Math.max(-lim, Math.min(lim, state.pitch + state.offPitch));
    camera.position.set(state.x, state.eyeHeight, state.z);
    camera.rotation.y = (state.yaw - state.offYaw) * DEG;
    camera.rotation.x = finalPitch * DEG;
  }

  // 마우스 이동(px) → 조준각. 시뮬레이터와 같은 공식: 각도 = px × (감도 / 100). 반동 오프셋은 건드리지 않는다.
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
