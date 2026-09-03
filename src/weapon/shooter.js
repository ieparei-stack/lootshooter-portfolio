import { config } from '../config.js';
import { directionFromAngles, raycastWorld } from './raycast.js';

// 발사 루프. 좌클릭 유지 → rpm 간격으로 한 발씩:
//   반동 오프셋 갱신(recoil × ADS 반동 배율) → 그 위에 퍼짐 샘플(spread × ADS 퍼짐 배율 × 이동 배율)
//   → 레이캐스트 → 탄자국   (시뮬레이터 tryFire 순서)
// 탄약·재장전·질주 중 사격 불가는 T12, 표적 판정·피해는 T13.
export function createShooter(weapon, recoil, spread, ads, mouseButtons, deps) {
  const { player, movement, blocks, marks } = deps;
  const state = {
    firing: false, lastShot: -Infinity, shots: 0,
    currentSpread: 0,   // 조준선 표시용 (°)
    lastHit: null,      // 마지막 탄착 { point, normal, distance, target }
  };

  // 이동 퍼짐 배율: 걷기 최고속도에서 moveSpreadMul, 속도에 비례
  function moveMul() {
    return 1 + (weapon.moveSpreadMul - 1) * (movement.state.speed / config.player.walkSpeed);
  }

  function fireOne(nowMs) {
    recoil.fire(nowMs, ads.recoilMul());

    const sp = spread.current(ads.spreadMul(), moveMul());
    const s = spread.sample(sp);
    const lim = config.mouse.pitchLimit;
    const aimPitch = Math.max(-lim, Math.min(lim, player.state.pitch + recoil.state.offPitch));
    const yaw = player.state.yaw - recoil.state.offYaw - s.dYaw;     // dYaw > 0 = 오른쪽 = yaw 감소
    const pitch = aimPitch + s.dPitch;

    const origin = { x: player.state.x, y: player.state.eyeHeight, z: player.state.z };
    const hit = raycastWorld(origin, directionFromAngles(yaw, pitch), blocks, 500);
    if (hit) marks.add(hit.point, hit.normal);
    state.lastHit = hit;

    spread.onShot();
    return { spread: sp, sample: s, hit };
  }

  function update(nowMs, dtSec) {
    state.firing = mouseButtons.isDown(0);
    if (state.firing && nowMs - state.lastShot >= 60000 / weapon.rpm) {
      state.lastShot = nowMs;
      state.shots++;
      fireOne(nowMs);
    }
    recoil.update(nowMs, state.firing, dtSec);
    spread.update(dtSec, state.firing);
    state.currentSpread = spread.current(ads.spreadMul(), moveMul());
  }

  return { state, update, fireOne };
}
