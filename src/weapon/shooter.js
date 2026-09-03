import { config } from '../config.js';
import { directionFromAngles, raycastWorld } from './raycast.js';

// 발사 루프 + 탄약 + 재장전 + 판정.
//   좌클릭 유지 → rpm 간격으로 한 발씩: 반동(× ADS 배율) → 퍼짐 샘플(× ADS × 이동 배율) → 레이캐스트
//   → 표적이면 피해 적용(targets.applyHit), 벽·과녁판이면 탄자국
//   탄창 mag 소모, 예비탄 무한. R 또는 빈 탄창에서 사격 입력 시 재장전(reloadTime).
//   재장전 취소: 질주 / 정조준(우클릭 새로 누름) / 탄이 남은 채 사격 입력. (무기 교체는 T16)
//   질주 중 사격 불가 — 사격 버튼을 누르면 질주가 풀리고 같은 프레임에 바로 발사.
//   복귀·퍼짐 회복에는 "실제로 발사 가능한 상태로 버튼을 잡고 있는가"를 넘긴다 (시뮬레이터 !firing || ammo<=0).
export function createShooter(weapon, recoil, spread, ads, mouseButtons, keyboard, deps) {
  const { player, movement, blocks, marks, targets, onFire } = deps;
  const state = {
    firing: false, lastShot: -Infinity, shots: 0,
    currentSpread: 0,   // 조준선 표시용 (°)
    lastHit: null,      // 마지막 탄착 { point, normal, distance, target, part?, result? }
    mag: weapon.mag,    // 현재 탄
    reloading: false, reloadStart: 0, reloadEnd: 0,
    reloadProgress: null,   // 0~1, 재장전 중이 아니면 null
    now: 0,
  };
  let prevRmb = false;

  function startReload(nowMs) {
    if (state.reloading || state.mag >= weapon.mag) return false;
    state.reloading = true;
    state.reloadStart = nowMs;
    state.reloadEnd = nowMs + weapon.reloadTime * 1000;
    state.reloadProgress = 0;
    return true;
  }
  function cancelReload() {
    state.reloading = false;
    state.reloadProgress = null;
  }
  keyboard.onPress('KeyR', () => startReload(state.now));

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
    const dir = directionFromAngles(yaw, pitch);
    const colliders = targets ? targets.colliders() : [];
    const hit = raycastWorld(origin, dir, blocks, 500, colliders);
    if (hit) {
      if (hit.part && targets) {
        hit.result = targets.applyHit(hit, weapon);
        if (hit.part === 'paper') marks.add(hit.point, hit.normal);   // 사람 표적에는 자국을 남기지 않는다(쓰러지면 허공에 뜸)
      } else {
        marks.add(hit.point, hit.normal);
      }
    }
    state.lastHit = hit;
    if (onFire) onFire({ origin, dir, yaw, pitch, hit });   // 트레이서·히트마커·데미지 숫자 (T14)

    spread.onShot();
    return { spread: sp, sample: s, hit };
  }

  function update(nowMs, dtSec) {
    state.now = nowMs;
    const lmb = mouseButtons.isDown(0);
    const rmb = mouseButtons.isDown(2);
    const rmbPressed = rmb && !prevRmb;
    prevRmb = rmb;

    // 질주 중 사격 버튼 → 질주 해제 (이 프레임부터). 발사 판정은 아래에서 하므로 바로 나간다
    if (lmb && movement.state.sprinting) movement.blockSprint();
    const sprinting = movement.state.sprinting;

    // 재장전 취소 / 완료 / 진행도
    if (state.reloading && (sprinting || rmbPressed || (lmb && state.mag > 0))) cancelReload();
    if (state.reloading && nowMs >= state.reloadEnd) { state.mag = weapon.mag; cancelReload(); }
    if (state.reloading) {
      state.reloadProgress = Math.min(1, (nowMs - state.reloadStart) / (state.reloadEnd - state.reloadStart));
    }

    // 발사
    const canFire = lmb && !state.reloading && !sprinting && state.mag > 0;
    if (canFire && nowMs - state.lastShot >= 60000 / weapon.rpm) {
      state.lastShot = nowMs;
      state.shots++;
      state.mag--;
      fireOne(nowMs);
    }

    // 빈 탄창에서 사격 입력 → 자동 재장전
    if (lmb && !state.reloading && state.mag === 0) startReload(nowMs);

    state.firing = canFire;
    recoil.update(nowMs, canFire, dtSec);
    spread.update(dtSec, canFire);
    state.currentSpread = spread.current(ads.spreadMul(), moveMul());
  }

  return { state, update, fireOne, startReload, cancelReload };
}
