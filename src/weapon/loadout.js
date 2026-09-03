// 무기 전환 (T16). 무기마다 { weapon, recoil, spread, ads, shooter } 한 벌(kit)을 시작 시 미리 만들어 두고
// 활성 kit만 바꾼다. 탄약은 각 kit의 shooter.state.mag에 살아 있으므로 총마다 따로 기억된다 (사용자 결정).
// 전환 시: 떠나는 kit과 새 kit 모두 반동 누적·bloom·패턴 인덱스·정조준 진행도를 0으로, 재장전은 취소.
// 교체 시간(꺼내는 딜레이)은 없다 — 즉시 전환.
export function createLoadout(weapons, makeKit, onChange) {
  const kits = weapons.map((w) => makeKit(w));
  const state = { index: 0 };

  function resetKit(kit) {
    kit.shooter.cancelReload();
    kit.recoil.reset();
    kit.spread.reset();
    kit.ads.reset();
  }

  function current() { return kits[state.index]; }

  function select(i) {
    if (i < 0 || i >= kits.length || i === state.index) return false;
    resetKit(kits[state.index]);
    state.index = i;
    resetKit(kits[i]);
    if (onChange) onChange(kits[i], i);
    return true;
  }

  function next() { return select((state.index + 1) % kits.length); }
  function prev() { return select((state.index - 1 + kits.length) % kits.length); }

  if (onChange) onChange(kits[0], 0);
  return { state, kits, current, select, next, prev };
}
