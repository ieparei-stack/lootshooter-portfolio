// 중앙 상황 프롬프트 (T26.1). "구역 1 클리어 — 앞으로 가세요", "보스 처치 — 데모 완료"처럼 상황이 바뀔 때만 잠깐 뜬다.
// 사망 카운트다운은 playerHud의 사망 오버레이가 맡는다 (같은 자리, 붉은 배경).
//   show(text, seconds) — seconds 동안 보였다가 마지막 0.5초에 페이드 아웃
//   hold(text)          — clear() 전까지 유지
//   clear()
export function createPrompt() {
  const el = document.createElement('div');
  el.id = 'prompt';
  el.style.cssText = [
    'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%, calc(-50% - 120px))', 'z-index:9',
    'padding:10px 22px', 'background:rgba(0,0,0,0.5)', 'color:#fff',
    'font:800 26px/1.2 system-ui, sans-serif', 'border-radius:8px', 'user-select:none', 'pointer-events:none',
    'white-space:nowrap', 'text-shadow:0 2px 6px #000', 'opacity:0', 'transition:opacity 0.15s',
  ].join(';');
  document.body.appendChild(el);

  const state = { text: null, remain: 0, holding: false };

  function show(text, seconds = 3) {
    state.text = text; state.remain = seconds; state.holding = false;
    el.textContent = text;
    el.style.opacity = '1';
  }
  function hold(text) {
    state.text = text; state.remain = Infinity; state.holding = true;
    el.textContent = text;
    el.style.opacity = '1';
  }
  function clear() {
    state.text = null; state.remain = 0; state.holding = false;
    el.style.opacity = '0';
  }
  function update(dt) {
    if (state.text === null || state.holding) return;
    state.remain -= dt;
    if (state.remain <= 0) { clear(); return; }
    if (state.remain < 0.5) el.style.opacity = (state.remain / 0.5).toFixed(2);
  }

  return { el, state, show, hold, clear, update };
}
