// 일시정지 메뉴 (T26.2). 포인터 잠금이 풀리면(ESC·Alt+Tab 등) 뜨고, Tab으로도 열고 닫는다.
// 게임 루프는 계속 돈다 — 입력은 잠금 해제로 이미 막혀 있다 (input.js isLocked).
//
// 브라우저 제약:
//   - 잠금 중 ESC는 브라우저가 가로채 keydown을 주지 않는다 → 열기는 pointerlockchange(잠금 해제)로 감지
//   - ESC keydown은 사용자 제스처가 아니라 requestPointerLock이 거부되고, ESC로 푼 직후 ~1초도 거부된다
//     → ESC는 카드를 닫기만 한다. 재잠금은 Tab(제스처) 또는 화면 클릭(캔버스 클릭 잠금, input.js)
// 상태: closed | menu | panel (플레이어 세팅·무기 세팅 패널이 열림 — 카드는 숨기고 오버레이만 옅게)
// 사용자 지시(2026-09-05): 버튼 셋(무기 세팅·플레이어 세팅·스테이지 리셋)은 카드가 아니라 **HUD 좌상단 상시 바**에 둔다 — ESC 없이도 보인다.
// 잠금 중엔 클릭이 안 되므로 실제로는 잠금을 풀고 누르게 된다. 카드(조작키·흐름)는 그대로 잠금 해제 시 뜬다.

const KEYS = [
  ['W A S D', '이동'], ['Shift', '질주 (앞으로 갈 때)'], ['C', '웅크리기'],
  ['좌클릭', '사격'], ['우클릭 유지', '정조준'], ['R', '재장전'],
  ['휠 / 1~3', '무기 전환'], ['P', '이론 반동 궤적 켜기/끄기'], ['X', '탄착군 지우기'],
  ['M', '스테이지 리셋'], ['ESC / Tab', '이 메뉴'],
];
const FLOW = [
  '사격장에서 시작합니다. 표적을 쏘며 총을 고르고, 끝의 문으로 들어가세요.',
  '구역 1 → 2 → 3. 구역의 웨이브를 모두 처치하면 다음 문이 열립니다.',
  '마지막은 보스. 단 위에서 조준선 2개로 쏘고, 체력이 반 아래면 부하를 부릅니다.',
  'HP가 0이 되면 2초 뒤 그 자리에서 부활하고 현재 웨이브가 다시 시작됩니다.',
];
const PANEL_TITLE = { settings: '플레이어 세팅', tuning: '무기 세팅' };

export function createPauseMenu({ canvas, mouseLook, onReset = null, panels = {}, onStateChange = null } = {}) {
  const state = { mode: 'closed', panel: null, returnTo: 'closed', blocked: false };   // returnTo = 패널을 닫으면 돌아갈 모드 (바 버튼은 카드 없이도 눌린다). blocked = T39 강화 선택 화면 중 (열리지 않고 ESC/Tab 무시)

  const overlay = document.createElement('div');
  overlay.id = 'pauseMenu';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:8;background:rgba(0,0,0,0.6);display:none;align-items:center;justify-content:center;font:14px/1.5 system-ui, sans-serif;color:#eee;user-select:none';

  const card = document.createElement('div');
  card.style.cssText = 'width:640px;max-width:92vw;max-height:90vh;overflow:auto;padding:22px 26px;background:rgba(10,10,14,0.92);border:1px solid rgba(255,255,255,0.15);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,0.6)';
  card.addEventListener('click', (e) => e.stopPropagation());   // 카드 안 클릭은 닫지 않는다

  const h = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text !== undefined) e.textContent = text; return e; };

  card.appendChild(h('div', 'font-size:24px;font-weight:800', '일시정지'));
  const sub = h('div', 'opacity:0.7;margin:2px 0 14px', '화면을 클릭하거나 Tab을 누르면 돌아갑니다');
  card.appendChild(sub);

  // 조작키 표 (2열)
  card.appendChild(h('div', 'font-weight:700;margin-bottom:6px', '조작키'));
  const grid = h('div', 'display:grid;grid-template-columns:auto 1fr auto 1fr;column-gap:14px;row-gap:4px;margin-bottom:16px');
  for (const [k, v] of KEYS) {
    grid.appendChild(h('span', 'font-weight:700;color:#ffd24a;white-space:nowrap', k));
    grid.appendChild(h('span', '', v));
  }
  card.appendChild(grid);

  // 데모 흐름
  card.appendChild(h('div', 'font-weight:700;margin-bottom:6px', '데모 흐름'));
  const flow = h('ol', 'margin:0 0 18px;padding-left:20px');
  for (const line of FLOW) flow.appendChild(h('li', 'margin:2px 0', line));
  card.appendChild(flow);

  overlay.appendChild(card);

  // 버튼 셋 — HUD 좌상단 상시 바 (오버레이·패널 위 z 12). 잠금 중엔 포인터가 없어 못 누른다
  const bar = h('div', 'position:fixed;top:12px;left:12px;z-index:12;display:flex;gap:6px');
  bar.id = 'hudButtons';
  const button = (label, fn) => {
    const b = h('button', 'padding:6px 12px;font:700 13px system-ui;background:rgba(58,95,138,0.9);color:#fff;border:0;border-radius:6px;cursor:pointer', label);
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    bar.appendChild(b);
    return b;
  };
  button('무기 세팅', () => togglePanel('tuning'));
  button('플레이어 세팅', () => togglePanel('settings'));
  button('스테이지 리셋', () => { if (onReset) onReset(); if (state.mode === 'menu') sub.textContent = '스테이지를 리셋했습니다. 화면을 클릭하거나 Tab을 누르면 돌아갑니다'; });
  document.body.appendChild(bar);

  // 패널 모드용 상단 바 (패널은 자기 자리에 그대로 뜨고, 이 바가 닫기 버튼을 준다)
  const panelBar = h('div', 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:11;display:none;gap:10px;align-items:center;padding:6px 12px;background:rgba(10,10,14,0.9);border-radius:6px;color:#eee;font:700 13px system-ui');
  const panelTitle = h('span');
  const panelClose = h('button', 'padding:4px 10px;font:700 13px system-ui;background:#3a5f8a;color:#fff;border:0;border-radius:4px;cursor:pointer', '닫기 (ESC)');
  panelClose.addEventListener('click', (e) => { e.stopPropagation(); closePanel(); });
  panelBar.append(panelTitle, panelClose);
  document.body.appendChild(overlay);
  document.body.appendChild(panelBar);

  function setMode(mode) {
    state.mode = mode;
    overlay.style.display = mode === 'closed' ? 'none' : 'flex';
    overlay.style.background = mode === 'panel' ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.6)';
    card.style.display = mode === 'menu' ? 'block' : 'none';
    panelBar.style.display = mode === 'panel' ? 'flex' : 'none';
    if (onStateChange) onStateChange(mode);
  }

  function open() {
    if (state.mode === 'closed') { sub.textContent = '화면을 클릭하거나 Tab을 누르면 돌아갑니다'; setMode('menu'); }
  }
  // 카드만 닫는다 (포인터는 풀린 채 — ESC 경로). 잠금이 되면 pointerlockchange가 다시 closed로 맞춘다
  function closeCard() { if (state.panel) hidePanel(); setMode('closed'); }

  function openPanel(name) {
    const p = panels[name];
    if (!p) return;
    if (state.mode !== 'panel') state.returnTo = state.mode;
    if (state.panel && state.panel !== name) hidePanel();   // 한 번에 하나만
    state.panel = name;
    p.setVisible(true);
    panelTitle.textContent = PANEL_TITLE[name] || name;
    setMode('panel');
  }
  function hidePanel() {
    if (state.panel && panels[state.panel]) panels[state.panel].setVisible(false);
    state.panel = null;
  }
  function closePanel() { hidePanel(); setMode(state.returnTo === 'menu' ? 'menu' : 'closed'); }
  // 바 버튼: 같은 패널이 열려 있으면 닫고, 아니면 연다
  function togglePanel(name) { if (state.mode === 'panel' && state.panel === name) closePanel(); else openPanel(name); }

  // 재잠금 시도 (Tab·배경 클릭). 거부되면 안내만
  function tryRelock() {
    let p = null;
    try { p = canvas.requestPointerLock(); } catch { p = null; }
    if (p && typeof p.catch === 'function') p.catch(() => { sub.textContent = '지금은 잠글 수 없습니다 — 잠시 뒤 Tab 또는 화면 클릭'; });
  }

  overlay.addEventListener('click', () => { if (state.mode === 'menu') tryRelock(); });

  // T39: 강화 선택 화면 중에는 메뉴를 막는다 — 잠금 해제로도 안 열리고 ESC/Tab도 무시
  function setBlocked(b) {
    state.blocked = !!b;
    if (state.blocked) { hidePanel(); setMode('closed'); }
  }

  document.addEventListener('pointerlockchange', () => {
    if (mouseLook.isLocked()) { hidePanel(); setMode('closed'); }
    else if (!state.blocked) open();
  });
  document.addEventListener('pointerlockerror', () => {
    if (state.mode === 'menu') sub.textContent = '지금은 잠글 수 없습니다 — 잠시 뒤 Tab 또는 화면 클릭';
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      if (state.blocked) return;
      if (mouseLook.isLocked()) { document.exitPointerLock(); return; }   // → pointerlockchange → open()
      if (state.mode === 'panel') closePanel();
      else tryRelock();   // menu 또는 closed(풀린 채) — 제스처라 잠금 가능
    } else if (e.code === 'Escape' && !mouseLook.isLocked() && !state.blocked) {
      if (state.mode === 'panel') closePanel();
      else if (state.mode === 'menu') closeCard();
    }
  });

  return { state, overlay, bar, open, closeCard, openPanel, closePanel, togglePanel, tryRelock, setBlocked };
}
