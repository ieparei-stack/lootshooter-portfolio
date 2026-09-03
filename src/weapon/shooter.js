// 최소 연사 루프 (T08). 좌클릭을 누르고 있으면 rpm 간격으로 recoil.fire()를 부른다.
// 탄약·재장전·질주 중 사격 불가·판정은 T12/T13에서 이 위에 얹는다. 지금은 무한히 나간다.
export function createShooter(weapon, recoil, mouseButtons) {
  const state = { firing: false, lastShot: -Infinity, shots: 0 };

  function update(nowMs) {
    state.firing = mouseButtons.isDown(0);
    if (state.firing && nowMs - state.lastShot >= 60000 / weapon.rpm) {
      state.lastShot = nowMs;
      state.shots++;
      recoil.fire(nowMs, 1);
    }
    recoil.update(nowMs, state.firing);
  }

  return { state, update };
}
