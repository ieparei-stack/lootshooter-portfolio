import { config } from '../config.js';
import { emit } from '../core/events.js';
import { directionFromAngles, raycastWorld } from './raycast.js';
import { colorOf } from '../ui/weaponColors.js';
import { BUFF_SECONDS } from '../growth/cards.js';

// 발사 루프 + 탄약 + 재장전 + 판정.
//   좌클릭 유지 → rpm 간격으로 한 발씩: 반동(× ADS 배율) → 퍼짐 샘플(× ADS × 이동 배율) → 레이캐스트
//   → 표적이면 피해 적용(targets.applyHit), 벽·과녁판이면 탄자국
//   탄창 mag 소모, 예비탄 무한. R 또는 빈 탄창에서 사격 입력 시 재장전(reloadTime).
//   재장전 취소: 질주 / 무기 전환(T16, loadout.js가 cancelReload 호출) / 탄이 남은 재장전에 한해 정조준(우클릭 새로 누름)·사격 입력.
//   0발에서 시작한 재장전은 좌클릭·우클릭으로 끊기지 않는다 (사용자 결정 2026-09-03) — 질주만 끊는다.
//   R 키 등록은 main.js가 맡는다 — 무기마다 shooter가 한 벌씩 있어 여기서 등록하면 서로 덮어쓴다.
//   질주 중 사격 불가 — 사격 버튼을 누르면 질주가 풀리고 같은 프레임에 바로 발사.
//   복귀·퍼짐 회복에는 "실제로 발사 가능한 상태로 버튼을 잡고 있는가"를 넘긴다 (시뮬레이터 !firing || ammo<=0).
//   T38 강화(weapon.perks, growth.js가 채운다. 없으면 무시):
//     브레이킹 — 정지(속도 0.1 m/s 미만) 상태의 첫 breakFree발(패턴 인덱스 기준, 500 ms 쉬면 리셋)은 퍼짐 0, 그 뒤 퍼짐 × breakSpreadMul. 조준원도 같은 규칙
//     강화탄 — enhancedEvery발째마다 피해 ×2 (카운터는 탄창·재장전과 무관하게 이어 센다)
//     멀티킬 버프 — 처치 뒤 BUFF_SECONDS.damage 동안 피해 × (1 + killDamageBuff). 피해 배율은 hit.damageMul로 applyHit에 넘긴다
//     헤드샷 환급 — 머리 명중(피해 > 0) 시 탄약 +headshotRefund (탄창 상한, 재장전 중엔 없음)
//     장탄수 회복 — 처치 시 +N / 가득 / BUFF_SECONDS.freeAmmo 동안 탄 소모 없음. 처치 = applyHit 결과 killed (몬스터 + 사격장 표적)
export function createShooter(weapon, recoil, spread, ads, mouseButtons, deps) {
  const { player, movement, blocks, marks, onFire } = deps;
  const hittables = deps.hittables || (deps.targets ? [deps.targets] : []);   // T22: 표적 + 몬스터. 각 시스템은 colliders()/applyHit()
  const state = {
    firing: false, lastShot: -Infinity, shots: 0,
    currentSpread: 0,   // 조준선 표시용 (°)
    lastHit: null,      // 마지막 탄착 { point, normal, distance, target, part?, result? }
    mag: weapon.mag,    // 현재 탄
    reloading: false, reloadStart: 0, reloadEnd: 0,
    reloadProgress: null,   // 0~1, 재장전 중이 아니면 null
    now: 0,
    enhancedCount: 0,       // T38 강화탄 카운터
    buffs: { damageUntil: 0, freeAmmoUntil: 0 },   // T38 버프 만료 시각 (ms)
  };
  let prevRmb = false;

  function startReload(nowMs) {
    if (state.reloading || state.mag >= weapon.mag) return false;
    state.reloading = true;
    state.reloadStart = nowMs;
    state.reloadEnd = nowMs + weapon.reloadTime * 1000;
    state.reloadProgress = 0;
    emit('reloadStart');
    return true;
  }
  function cancelReload() {
    state.reloading = false;
    state.reloadProgress = null;
  }

  // T38 강화 훅
  const perks = () => weapon.perks || null;
  // shotIndex = 이번에 평가하는 탄의 연사 내 번호(0부터). 브레이킹: 정지 + 첫 N발 → 0, 그 뒤 전체 배율
  function spreadWithPerks(sp, shotIndex) {
    const p = perks();
    if (!p) return sp;
    if (p.breakFree > 0 && movement.state.speed < 0.1 && shotIndex < p.breakFree) return 0;
    return sp * p.breakSpreadMul;
  }
  function damageBuffMul(nowMs) { const p = perks(); return p && p.killDamageBuff > 0 && nowMs < state.buffs.damageUntil ? 1 + p.killDamageBuff : 1; }
  function onKill(nowMs, p) {
    if (p.killResetBloom) spread.reset();
    if (p.killDamageBuff > 0) state.buffs.damageUntil = nowMs + BUFF_SECONDS.damage * 1000;
    if (p.killAmmo === 'free') state.buffs.freeAmmoUntil = nowMs + BUFF_SECONDS.freeAmmo * 1000;
    else if (p.killAmmo === 'full') state.mag = weapon.mag;
    else if (p.killAmmo > 0) state.mag = Math.min(weapon.mag, state.mag + p.killAmmo);
    if (state.reloading && state.mag >= weapon.mag) cancelReload();
  }
  // HUD용 남은 버프 시간 (s). 없으면 0
  function buffRemain(nowMs) {
    return { damage: Math.max(0, (state.buffs.damageUntil - nowMs) / 1000), freeAmmo: Math.max(0, (state.buffs.freeAmmoUntil - nowMs) / 1000), damageBuff: perks() ? perks().killDamageBuff : 0 };
  }

  // 이동 퍼짐 배율: 걷기 최고속도에서 moveSpreadMul, 속도에 비례
  function moveMul() {
    return 1 + (weapon.moveSpreadMul - 1) * (movement.state.speed / config.player.walkSpeed);
  }
  // T35 자세 퍼짐 배율: 웅크린 동안 crouchSpreadMul (C 토글 즉시. 질주하면 웅크림이 풀리므로 자동 해제)
  function stanceMul() {
    return movement.state.crouched ? weapon.crouchSpreadMul : 1;
  }

  function fireOne(nowMs) {
    const sp = spreadWithPerks(spread.current(ads.spreadMul(), moveMul() * stanceMul()), recoil.state.shotIdx);   // 반동 누적 전 = 이번 탄 번호
    const kicked = recoil.fire(nowMs, ads.recoilMul());   // { v, h, idx } — T30 뷰모델 반동에 씀
    const p = perks();
    let enhanced = false;
    if (p && p.enhancedEvery > 0) { state.enhancedCount++; if (state.enhancedCount >= p.enhancedEvery) { state.enhancedCount = 0; enhanced = true; } }
    const damageMul = damageBuffMul(nowMs) * (enhanced ? 2 : 1);

    const s = spread.sample(sp);
    const lim = config.mouse.pitchLimit;
    // 탄 방향 = 조준각 + 누적 반동 100% (탄도 기준). 카메라는 viewTracking 비율만 올라가 있으므로(main.js) 탄은 조준원보다 (1−viewTracking)×누적만큼 위로 나간다 (T35)
    const aimPitch = Math.max(-lim, Math.min(lim, player.state.pitch + recoil.state.offPitch));
    const yaw = player.state.yaw - recoil.state.offYaw - s.dYaw;     // dYaw > 0 = 오른쪽 = yaw 감소
    const pitch = aimPitch + s.dPitch;

    const origin = { x: player.state.x, y: player.state.eyeHeight, z: player.state.z };
    const dir = directionFromAngles(yaw, pitch);
    const colliders = [];
    for (const h of hittables) for (const c of h.colliders()) colliders.push(c);
    const hit = raycastWorld(origin, dir, blocks, 500, colliders);
    if (hit) {
      hit.damageMul = damageMul; hit.enhanced = enhanced;
      if (hit.part && hit.collider && hit.collider.system) {
        hit.result = hit.collider.system.applyHit(hit, weapon);
        if (hit.part === 'paper') marks.add(hit.point, hit.normal, colorOf(weapon));   // 사람 표적에는 자국을 남기지 않는다(쓰러지면 허공에 뜸)
        const r = hit.result;
        if (p && r && r.damage > 0) {
          if (hit.part === 'head' && p.headshotRefund > 0 && !state.reloading) state.mag = Math.min(weapon.mag, state.mag + p.headshotRefund);
          if (r.killed) onKill(nowMs, p);
        }
      } else {
        marks.add(hit.point, hit.normal, colorOf(weapon));   // T18: 무기별 색
      }
    }
    state.lastHit = hit;
    if (onFire) onFire({ origin, dir, yaw, pitch, hit, enhanced, damageMul });   // 트레이서·히트마커·데미지 숫자 (T14). enhanced = T38 강화탄
    const vt = weapon.viewTracking;
    emit('fire', { weapon, recoil: { v: kicked.v * vt, h: kicked.h * vt } });   // T29 발사음 (무기별) · T30 뷰모델 반동 — 카메라 기준(× viewTracking, T35)

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
    if (state.reloading && (sprinting || (state.mag > 0 && (rmbPressed || lmb)))) cancelReload();
    if (state.reloading && nowMs >= state.reloadEnd) { state.mag = weapon.mag; cancelReload(); emit('reloadEnd'); }
    if (state.reloading) {
      state.reloadProgress = Math.min(1, (nowMs - state.reloadStart) / (state.reloadEnd - state.reloadStart));
    }

    // 발사
    const canFire = lmb && !state.reloading && !sprinting && state.mag > 0;
    if (canFire) {
      // T32: 프레임당 여러 발. lastShot을 간격만큼 누적시켜 실제 발사율이 RPM과 맞는다. 첫 발·긴 휴식 뒤(간격+100ms 초과)는 따라잡기 없이 1발.
      const interval = 60000 / weapon.rpm;
      if (state.lastShot === -Infinity || nowMs - state.lastShot > interval + 100) state.lastShot = nowMs - interval;
      let n = 0;
      while (state.mag > 0 && nowMs - state.lastShot >= interval && n < 20) {   // 20 = dt 상한 0.1s × 12000 RPM
        state.lastShot += interval;
        state.shots++;
        if (!(nowMs < state.buffs.freeAmmoUntil)) state.mag--;   // T38 장탄수 회복 Lv3: 탄 소모 없음
        fireOne(nowMs);
        n++;
      }
    }

    // 빈 탄창에서 사격 입력 → 자동 재장전
    if (lmb && !state.reloading && state.mag === 0) { emit('empty'); startReload(nowMs); }   // startReload가 성공하면 다음 프레임엔 reloading이라 한 번만

    state.firing = canFire;
    recoil.update(nowMs, canFire, dtSec);
    spread.update(dtSec, canFire);
    state.currentSpread = spreadWithPerks(spread.current(ads.spreadMul(), moveMul() * stanceMul()), recoil.state.shotIdx);   // 다음 탄 기준 (브레이킹이면 조준원이 점)
  }

  return { state, update, fireOne, startReload, cancelReload, buffRemain };
}
