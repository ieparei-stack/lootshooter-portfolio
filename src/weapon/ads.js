// 정조준(ADS) 진행도. docs/총기 시뮬레이터.html 의 adsP / easeA / recoilMul / spreadMul 규칙 그대로.
//   우클릭 유지 → p가 0→1로 ads.time(ms)에 걸쳐 이동, 해제는 1.4배 빠름
//   ease = p·p·(3−2p) (smoothstep)
//   반동 배율 = 1 + (ads.recoil − 1)·ease, 퍼짐 배율 = 1 + (ads.spread − 1)·ease
//   ads.allowed = false 면 정조준이 아예 동작하지 않는다 (CS형)
export function createAds(weapon, mouseButtons) {
  const state = { held: false, p: 0, ease: 0 };

  function update(dtSec) {
    const a = weapon.ads;
    state.held = a.allowed && mouseButtons.isDown(2);
    const target = state.held ? 1 : 0;
    if (a.time > 0) {
      const rate = 1000 / a.time * (target ? 1 : 1.4);       // 초당 진행량
      const d = target - state.p;
      state.p += Math.sign(d) * Math.min(Math.abs(d), dtSec * rate);
    } else {
      state.p = 0;
    }
    state.ease = state.p * state.p * (3 - 2 * state.p);
  }

  function recoilMul() { return weapon.ads.allowed ? 1 + (weapon.ads.recoil - 1) * state.ease : 1; }
  function spreadMul() { return weapon.ads.allowed ? 1 + (weapon.ads.spread - 1) * state.ease : 1; }

  // 무기 전환(T16): 우클릭을 잡은 채 바꿔도 새 총은 진행도 0에서 다시 조준을 시작한다
  function reset() { state.held = false; state.p = 0; state.ease = 0; }

  return { state, update, recoilMul, spreadMul, reset };
}
