// 피해 계산 순수 함수. T13 표적, T14 데미지 숫자, 4·5단계 몬스터가 같은 함수를 쓴다.

// 거리 감쇠 비율: start 이하 1, end 이상 minRatio, 사이는 직선 보간.
export function falloffRatio(distance, falloff) {
  const { start, end, minRatio } = falloff;
  if (distance <= start) return 1;
  if (end <= start || distance >= end) return minRatio;
  const t = (distance - start) / (end - start);
  return 1 + (minRatio - 1) * t;
}

// 한 발의 피해: 기본 피해 × (머리면 headshotMul) × 거리 감쇠 × extraMul (T38 강화 — 멀티킬 버프·강화탄. shooter가 hit.damageMul로 넘긴다)
export function computeDamage(weapon, part, distance, extraMul = 1) {
  const ratio = falloffRatio(distance, weapon.falloff);
  const mul = part === 'head' ? weapon.headshotMul : 1;
  return { damage: weapon.damage * mul * ratio * extraMul, ratio, mul };
}
