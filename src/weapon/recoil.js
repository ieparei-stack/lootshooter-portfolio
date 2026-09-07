// 반동 엔진. docs/총기 시뮬레이터.html 의 compilePattern / tryFire(반동 부분)를 그대로 옮긴 것.
// 각도는 전부 도(°) 단위이며 FOV와 무관하게 카메라 회전에 그대로 더해진다.
//
// 상태 offYaw/offPitch는 "총이 밀어올린 누적 반동"이다. 플레이어의 조준각(aim)과 분리해 두어야
// T09 복귀가 보정분(플레이어가 마우스로 내린 양)을 제외하고 off만 되돌릴 수 있다.
// T35: off*는 **탄도 기준(100%)**. 카메라는 main.js가 off × weapon.viewTracking만 따라가게 한다. 복귀·cap은 여기(탄도)에 걸린다.
// 부호: offPitch > 0 = 위, offYaw > 0 = 오른쪽 (시뮬레이터 규약). 카메라 합성은 camera.js가 맡는다.

const PATTERN_LEN = 40;      // curve 모드를 펼치는 발 수 (시뮬레이터와 동일)
const IDX_RESET_MS = 500;    // 사격 정지 후 패턴 인덱스 리셋까지 (시뮬레이터와 동일)

export function compilePattern(weapon) {
  const p = weapon.pattern;
  if (p.mode === 'array') return p.arr.map((a) => ({ v: a[0], h: a[1], hMode: 'fixed' }));
  const out = [];
  let dir = 1;
  for (let i = 0; i < PATTERN_LEN; i++) {
    const v = Math.min(p.v0 + p.vG * i, p.vMax);
    let h, hm;
    if (p.hMode === 'random') { h = p.hMax; hm = 'random'; }
    else { h = Math.min(p.h0 + p.h0 * 0.06 * i, p.hMax) * dir; dir *= -1; hm = 'fixed'; }
    out.push({ v, h, hMode: hm });
  }
  return out;
}

// 패턴 인덱스 순환: 탄창이 패턴 길이를 넘으면 뒤 1/3 구간을 반복 (시뮬레이터와 동일)
export function patternIndex(shotIdx, n) {
  return shotIdx < n ? shotIdx : Math.floor(n * 2 / 3) + ((shotIdx - n) % Math.ceil(n / 3));
}

export function createRecoil(weapon, rng = Math.random) {
  let compiled = compilePattern(weapon);
  const state = {
    offYaw: 0,        // 누적 수평 반동 (°, + = 오른쪽)
    offPitch: 0,      // 누적 수직 반동 (°, + = 위)
    shotIdx: 0,       // 다음에 쓸 패턴 발 번호
    lastFireEnd: 0,   // 마지막 발사 시각 (ms)
    capHold: false,   // cap 상한에 걸려 있는가
    lastIdx: -1,      // 마지막으로 사용한 패턴 인덱스 (검증·표시용)
  };

  // 한 발 발사. recoilMul은 ADS 반동 배율(T11). 시뮬레이터 tryFire의 반동 부분과 동일.
  function fire(nowMs, recoilMul = 1) {
    const n = compiled.length;
    const idx = patternIndex(state.shotIdx, n);
    const p = compiled[Math.min(idx, n - 1)];

    const v = Math.max(0, p.v * (1 + (rng() * 2 - 1) * weapon.randV));   // 수직은 아래로 내려가지 않음
    const h = (p.hMode === 'random')
      ? (rng() * 2 - 1) * Math.abs(p.h) * (1 + (rng() * 2 - 1) * weapon.randH)
      : p.h * (1 + (rng() * 2 - 1) * weapon.randH);

    state.offYaw += h * recoilMul;
    state.offPitch += v * recoilMul;

    state.capHold = false;
    if (weapon.cap.on && state.offPitch > weapon.cap.deg) {   // cap: 누적 수직 반동 상한 클램프
      state.offPitch = weapon.cap.deg;
      state.capHold = true;
    }

    state.lastIdx = idx;
    state.shotIdx++;
    state.lastFireEnd = nowMs;
    return { v, h, idx };
  }

  // 매 프레임.
  // 1) 복귀: 사격을 멈추고 recovery.delay(ms)가 지나면 누적 반동 벡터의 크기를 recovery.speed(°/s)로
  //    선형 감소시킨다 (방향 유지). off만 줄이므로 플레이어가 마우스로 내린 조준각은 되돌아오지 않는다 = "보정분 제외".
  // 2) 사격을 멈추고 500ms가 지나면 패턴 인덱스를 처음으로 되돌린다.
  // 시뮬레이터 update()와 동일. firing은 "사격 버튼을 누르고 있는가" (T12에서 빈 탄창이면 firing이어도 복귀).
  function update(nowMs, firing, dtSec = 0) {
    if (!firing && nowMs - state.lastFireEnd > weapon.recovery.delay) {
      const step = weapon.recovery.speed * dtSec;
      const m = Math.hypot(state.offYaw, state.offPitch);
      if (m > 0) {
        const k = Math.max(0, m - step) / m;
        state.offYaw *= k;
        state.offPitch *= k;
      }
      if (m < 0.05) state.capHold = false;
    }
    if (!firing && state.shotIdx > 0 && nowMs - state.lastFireEnd > IDX_RESET_MS) state.shotIdx = 0;
  }

  // 튜닝 패널(T17.5)이 pattern.*을 바꾼 뒤 부른다 — 패턴을 다시 펼친다
  function recompile() { compiled = compilePattern(weapon); }

  // 무기 전환(T16): 누적 반동·패턴 인덱스를 처음 상태로
  function reset() {
    state.offYaw = 0; state.offPitch = 0; state.shotIdx = 0;
    state.capHold = false; state.lastIdx = -1;
  }

  return { state, get compiled() { return compiled; }, fire, update, reset, recompile };
}
