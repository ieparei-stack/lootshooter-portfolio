import { config } from '../config.js';

const DEG = Math.PI / 180;

// 플레이어 이동. 카메라 yaw 기준으로 WASD를 해석해 playerCamera.state.x/z와 eyeHeight를 갱신한다.
// state.speed(m/s)·sprinting·crouched는 2단계(이동 퍼짐, 질주 중 사격 불가)가 읽는다.
export function createMovement(playerCamera, keyboard) {
  const cam = playerCamera.state;
  const state = {
    vx: 0, vz: 0,        // 현재 속도 벡터 (m/s)
    speed: 0,            // 현재 속력 (m/s)
    sprinting: false,
    crouched: false,
  };

  keyboard.onPress('KeyC', () => { state.crouched = !state.crouched; });

  function update(dt) {
    const P = config.player;

    // 1. 입력 → 카메라 yaw 기준 방향 (pitch 무시)
    const fwdIn = (keyboard.isDown('KeyW') ? 1 : 0) - (keyboard.isDown('KeyS') ? 1 : 0);
    const rightIn = (keyboard.isDown('KeyD') ? 1 : 0) - (keyboard.isDown('KeyA') ? 1 : 0);
    const yaw = cam.yaw * DEG;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // 앞 방향 (yaw 0 = -Z)
    const rx =  Math.cos(yaw), rz = -Math.sin(yaw);   // 오른쪽
    let dx = fx * fwdIn + rx * rightIn;
    let dz = fz * fwdIn + rz * rightIn;
    const len = Math.hypot(dx, dz);
    const moving = len > 0;
    if (moving) { dx /= len; dz /= len; }

    // 2. 질주 — Shift + 앞으로 갈 때만. 질주하면 웅크리기가 풀린다
    const shift = keyboard.isDown(['ShiftLeft', 'ShiftRight']);
    state.sprinting = shift && fwdIn > 0;
    if (state.sprinting) state.crouched = false;

    // 3. 목표 속도
    const mul = state.sprinting ? P.sprintMul : (state.crouched ? P.crouchMul : 1);
    const targetSpeed = moving ? P.walkSpeed * mul : 0;
    const tx = dx * targetSpeed, tz = dz * targetSpeed;

    // 4. 속도를 목표로 일정 비율로 이동 — 입력 있으면 accelTime, 없으면 decelTime 안에 도달
    const rate = moving ? targetSpeed / P.accelTime : P.walkSpeed / P.decelTime;
    const ex = tx - state.vx, ez = tz - state.vz;
    const elen = Math.hypot(ex, ez);
    const step = rate * dt;
    if (elen === 0 || elen <= step) { state.vx = tx; state.vz = tz; }   // elen 0이면 0÷0 방지
    else { state.vx += ex / elen * step; state.vz += ez / elen * step; }
    state.speed = Math.hypot(state.vx, state.vz);

    // 5. 위치
    cam.x += state.vx * dt;
    cam.z += state.vz * dt;

    // 6. 눈높이 — 서기/웅크리기 목표를 향해 일정 속도로 전환
    const eyeTarget = state.crouched ? P.crouchEyeHeight : P.eyeHeight;
    const eyeStep = (P.eyeHeight - P.crouchEyeHeight) / P.crouchBlendTime * dt;
    const de = eyeTarget - cam.eyeHeight;
    if (Math.abs(de) <= eyeStep) cam.eyeHeight = eyeTarget;
    else cam.eyeHeight += Math.sign(de) * eyeStep;
  }

  return { state, update };
}
