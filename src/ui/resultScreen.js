import { CARD_COUNT, MAX_LEVEL } from '../growth/cards.js';
import { colorOf } from './weaponColors.js';
import { formatTime } from '../stats/runStats.js';

// 결과 화면 (T28). 보스 처치 2초 뒤 main.js가 open(summary) — 클리어 시간 · 명중률/헤드샷 비율 · 총기별 발사/피해 비율 · 무기별 강화 Lv.
//   - 버튼은 '처음부터 다시 시작' 하나 (사용자 결정 2026-09-07). onRestart는 main.js의 restartRun (강화 Lv 0 · 사격장 시작 위치 · 스테이지·HP 리셋).
//   - 게임 정지·포인터 해제·일시정지 메뉴 차단은 T39 강화 선택 화면과 같은 방식으로 main.js가 맡는다 (루프 paused · setOverlay).
//     이 오버레이는 z 30으로 캔버스·HUD 바를 덮는다.
export function createResultScreen({ weapons, growth, onOpen = null, onClose = null, onRestart = null }) {
  const state = { open: false, summary: null };

  const h = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text !== undefined) e.textContent = text; return e; };
  const pct = (v) => (v === null || v === undefined ? '—' : Math.round(v * 100) + '%');

  const root = h('div', 'position:fixed;inset:0;z-index:30;background:rgba(0,0,0,0.82);display:none;align-items:center;justify-content:center;font:14px/1.4 system-ui, sans-serif;color:#eee;user-select:none');
  root.id = 'resultScreen';
  const panel = h('div', 'width:760px;max-width:96vw;max-height:94vh;overflow:auto;padding:22px 28px 20px;background:rgba(10,10,14,0.96);border:1px solid rgba(255,255,255,0.15);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,0.6)');
  const title = h('div', 'font-size:26px;font-weight:800', '데모 완료');
  const sub = h('div', 'opacity:0.7;margin:2px 0 16px', '보스 처치 — 결과');
  const body = h('div');
  const foot = h('div', 'display:flex;justify-content:flex-end;margin-top:18px');
  const restartBtn = h('button', 'padding:10px 28px;font:800 16px system-ui;background:#3a6fa8;color:#fff;border:0;border-radius:6px;cursor:pointer', '처음부터 다시 시작');
  restartBtn.addEventListener('click', (e) => { e.stopPropagation(); if (onRestart) onRestart(); });
  foot.appendChild(restartBtn);
  panel.append(title, sub, body, foot);
  root.appendChild(panel);
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.appendChild(root);

  const cell = (text, css = '') => h('td', 'padding:6px 10px;font-variant-numeric:tabular-nums;white-space:nowrap;' + css, text);
  const headCell = (text, css = '') => h('th', 'padding:6px 10px;font-weight:600;opacity:0.65;text-align:left;white-space:nowrap;' + css, text);

  function render(s) {
    body.textContent = '';
    // 상단 세 칸: 클리어 시간 · 명중률 · 헤드샷 비율
    const top = h('div', 'display:grid;grid-template-columns:repeat(3, 1fr);gap:10px');
    const tile = (label, value, note) => {
      const box = h('div', 'padding:12px 14px;border-radius:8px;background:rgba(255,255,255,0.05)');
      box.appendChild(h('div', 'font-size:12px;opacity:0.65', label));
      box.appendChild(h('div', 'font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:2px', value));
      if (note) box.appendChild(h('div', 'font-size:12px;opacity:0.6', note));
      return box;
    };
    top.appendChild(tile('클리어 시간', formatTime(s.timeSec), '구역 1 진입 → 보스 처치'));
    top.appendChild(tile('명중률', pct(s.accuracy), `명중 ${s.hits} / 발사 ${s.shots}`));
    top.appendChild(tile('헤드샷 비율', pct(s.headRate), `헤드 ${s.head} / 명중 ${s.hits}`));
    body.appendChild(top);

    // 총기별 사용 비율 표
    body.appendChild(h('div', 'font-weight:800;font-size:15px;margin:18px 0 6px', '총기별 사용 비율'));
    const table = h('table', 'border-collapse:collapse;width:100%;font-size:13px');
    const thead = h('thead');
    const hr = h('tr');
    ['무기', '발사', '발사 비율', '피해', '피해 비율', '명중률'].forEach((t, i) => hr.appendChild(headCell(t, i > 0 ? 'text-align:right' : '')));
    thead.appendChild(hr); table.appendChild(thead);
    const tbody = h('tbody');
    for (const w of s.perWeapon) {
      const tr = h('tr', 'border-top:1px solid rgba(255,255,255,0.08)');
      const nameTd = cell('', 'font-weight:700');
      nameTd.appendChild(h('span', `display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;vertical-align:middle;background:${colorOf(w)}`));
      nameTd.appendChild(document.createTextNode(w.name));
      tr.appendChild(nameTd);
      tr.appendChild(cell(String(w.shots), 'text-align:right'));
      tr.appendChild(cell(pct(w.shotsPct), 'text-align:right'));
      tr.appendChild(cell(String(w.damage), 'text-align:right'));
      tr.appendChild(cell(pct(w.damagePct), 'text-align:right'));
      tr.appendChild(cell(pct(w.accuracy), 'text-align:right'));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);

    // 획득한 강화 — 무기별 카드 3장 Lv
    body.appendChild(h('div', 'font-weight:800;font-size:15px;margin:18px 0 6px', '획득한 강화'));
    const grid = h('div', 'display:grid;grid-template-columns:repeat(3, 1fr);gap:10px');
    for (const w of weapons) {
      const box = h('div', 'padding:10px 12px;border-radius:8px;background:rgba(255,255,255,0.04);border-left:3px solid ' + colorOf(w));
      box.appendChild(h('div', 'font-weight:800;margin-bottom:4px', w.name));
      for (let k = 0; k < CARD_COUNT; k++) {
        const card = growth.card(w.id, k);
        const lv = card ? growth.level(w.id, k) : 0;
        const line = h('div', 'display:flex;justify-content:space-between;gap:8px;font-size:13px;' + (lv > 0 ? '' : 'opacity:0.4'));
        line.appendChild(h('span', '', card ? card.name : `${k + 1}. 지원 안 함`));
        line.appendChild(h('span', 'font-variant-numeric:tabular-nums', card ? `Lv ${lv}${lv >= MAX_LEVEL ? ' (최대)' : ''}` : '—'));
        box.appendChild(line);
      }
      grid.appendChild(box);
    }
    body.appendChild(grid);
  }

  function open(summary) {
    if (state.open) return false;
    state.open = true; state.summary = summary;
    render(summary);
    root.style.display = 'flex';
    if (onOpen) onOpen();
    return true;
  }
  function close() {
    if (!state.open) return false;
    state.open = false;
    root.style.display = 'none';
    if (onClose) onClose();
    return true;
  }

  return { state, root, open, close, restartBtn };
}
