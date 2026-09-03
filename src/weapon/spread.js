// 탄퍼짐. docs/총기 시뮬레이터.html 의 bloom / curSpread / 탄착 분포 규칙을 그대로 옮긴 것. 단위는 도(°).
//   현재 퍼짐 = min(base + bloom, max) × ADS배율 × 이동배율
//   발당 bloom 누적(max 상한), 초당 decay 회복 — 사격 중에는 ×0.25
//   탄착점: 각도 균등, 반지름 sqrt(random) × 퍼짐 → 원 안에 면적 균등 분포
export function createSpread(weapon, rng = Math.random) {
  const state = { bloom: 0 };

  function current(adsMul = 1, moveMul = 1) {
    return Math.min(weapon.spread.base + state.bloom, weapon.spread.max) * adsMul * moveMul;
  }

  function onShot() {
    state.bloom = Math.min(state.bloom + weapon.spread.bloom, weapon.spread.max);
  }

  function update(dtSec, firing) {
    state.bloom = Math.max(0, state.bloom - weapon.spread.decay * dtSec * (firing ? 0.25 : 1));
  }

  // 조준점 기준 탄착 오프셋 (°). dYaw > 0 = 오른쪽, dPitch > 0 = 위 (시뮬레이터 규약)
  function sample(spreadDeg) {
    const ang = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * spreadDeg;
    return { dYaw: Math.cos(ang) * r, dPitch: Math.sin(ang) * r, r, ang };
  }

  return { state, current, onShot, update, sample };
}
