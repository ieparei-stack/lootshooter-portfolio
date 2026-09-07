import { CARD_COUNT, MAX_LEVEL, cardDesc } from '../growth/cards.js';
import { colorOf } from './weaponColors.js';

// 구역 클리어 강화 선택 화면 (T39). 구역 1·2·3 클리어 시 stage.onPick → open(zone) → 확정 → onClose → 문 열림 (main.js가 잇는다).
//   - 세 줄 = weapons 순(CS형 · PUBG형 · 루트슈터형), 줄마다 그 무기의 카드 3장(CSV 순). 핵심/보조 구분 없음.
//   - 카드: 이름 · Lv a → b · 다음 Lv 효과 한 줄(cards.js desc — T38 표 문구). 기대 TTK 없음 (사용자 결정 2026-09-07).
//   - Lv MAX 카드는 회색 '최대' 선택 불가. 한 줄에 고를 수 있는 카드가 하나뿐이면 자동 선택. 하나도 없으면 그 줄은 '모두 최대'로 통과.
//   - 세 줄 다 골라져야 '확정' 활성. 미완 상태로 누르면 미선택 줄 강조. 확정 후 되돌리기 없음.
//   - 게임 정지·포인터 해제·ESC/Tab 무시는 main.js(루프 paused)·pauseMenu.setBlocked이 맡는다. 이 오버레이는 z 30으로
//     캔버스·HUD 바를 덮어 클릭 재잠금·바 버튼을 막는다. 숫자키·휠·R 등은 포인터가 풀려 있어 input.js가 무시한다.
export function createGrowthPick({ weapons, growth, onOpen = null, onClose = null }) {
  const state = { open: false, zone: -1, choice: Array(weapons.length).fill(null) };

  const h = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text !== undefined) e.textContent = text; return e; };

  const root = h('div', 'position:fixed;inset:0;z-index:30;background:rgba(0,0,0,0.8);display:none;align-items:center;justify-content:center;font:14px/1.4 system-ui, sans-serif;color:#eee;user-select:none');
  root.id = 'growthPick';
  const panel = h('div', 'width:880px;max-width:96vw;max-height:94vh;overflow:auto;padding:20px 26px 18px;background:rgba(10,10,14,0.96);border:1px solid rgba(255,255,255,0.15);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,0.6)');
  const title = h('div', 'font-size:24px;font-weight:800');
  const sub = h('div', 'opacity:0.7;margin:2px 0 14px');
  const rowsEl = h('div');
  const foot = h('div', 'display:flex;align-items:center;gap:14px;margin-top:16px');
  const hint = h('div', 'flex:1;color:#ff8a8a;min-height:1.4em');
  const confirmBtn = h('button', 'padding:10px 28px;font:800 16px system-ui;background:#3a8a5f;color:#fff;border:0;border-radius:6px;cursor:pointer', '확정');
  confirmBtn.addEventListener('click', (e) => { e.stopPropagation(); confirm(); });
  foot.append(hint, confirmBtn);
  panel.append(title, sub, rowsEl, foot);
  root.appendChild(panel);
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.appendChild(root);

  // 줄 i의 고를 수 있는 카드 인덱스들
  function selectable(i) {
    const w = weapons[i], out = [];
    for (let k = 0; k < CARD_COUNT; k++) if (growth.card(w.id, k) && growth.level(w.id, k) < MAX_LEVEL) out.push(k);
    return out;
  }
  // 줄 i가 확정 가능한가 (골랐거나 고를 것이 없거나)
  function rowDone(i) { return state.choice[i] !== null || selectable(i).length === 0; }
  const allDone = () => weapons.every((_, i) => rowDone(i));

  let rowEls = [];
  function render() {
    rowsEl.textContent = '';
    rowEls = [];
    weapons.forEach((w, i) => {
      const color = colorOf(w);
      const row = h('div', 'margin-top:10px;padding:10px 12px;border-radius:8px;border:2px solid transparent;background:rgba(255,255,255,0.04)');
      const head = h('div', 'display:flex;align-items:center;gap:8px;margin-bottom:8px');
      head.appendChild(h('span', `width:12px;height:12px;border-radius:3px;background:${color};display:inline-block`));
      head.appendChild(h('span', 'font-weight:800;font-size:16px', w.name));
      const picks = growth.state.byId[w.id] ? growth.state.byId[w.id].picks : 0;
      head.appendChild(h('span', 'opacity:0.55;font-size:12px', `선택 ${picks}/${MAX_LEVEL}회`));
      if (selectable(i).length === 0) head.appendChild(h('span', 'margin-left:auto;opacity:0.6', '모두 최대'));
      row.appendChild(head);
      const cards = h('div', 'display:grid;grid-template-columns:repeat(3, 1fr);gap:10px');
      for (let k = 0; k < CARD_COUNT; k++) {
        const card = growth.card(w.id, k);
        const lv = card ? growth.level(w.id, k) : 0;
        const maxed = !card || lv >= MAX_LEVEL;
        const chosen = state.choice[i] === k;
        const box = h('div', 'padding:10px 12px;border-radius:6px;min-height:78px;border:2px solid ' + (chosen ? color : 'rgba(255,255,255,0.12)') +
          ';background:' + (chosen ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)') + (maxed ? ';opacity:0.4;cursor:default' : ';cursor:pointer'));
        box.dataset.row = i; box.dataset.card = k;
        const top = h('div', 'display:flex;justify-content:space-between;align-items:baseline;gap:6px');
        top.appendChild(h('span', 'font-weight:800;font-size:15px', card ? card.name : `${k + 1}. 지원 안 함`));
        top.appendChild(h('span', 'font-variant-numeric:tabular-nums;white-space:nowrap;font-size:12px;opacity:0.85', !card ? '' : maxed ? '최대' : `Lv ${lv} → ${lv + 1}`));
        box.appendChild(top);
        box.appendChild(h('div', 'margin-top:6px;font-size:13px;line-height:1.35', !card ? '경고 배지 참고' : maxed ? '최대 단계입니다' : cardDesc(card, lv + 1)));
        if (!maxed) box.addEventListener('click', (e) => { e.stopPropagation(); select(i, k); });
        cards.appendChild(box);
      }
      row.appendChild(cards);
      rowsEl.appendChild(row);
      rowEls.push(row);
    });
    const ok = allDone();
    confirmBtn.style.opacity = ok ? '1' : '0.4';
    confirmBtn.style.cursor = ok ? 'pointer' : 'default';
  }

  function select(i, k) {
    if (!state.open || i < 0 || i >= weapons.length) return false;
    if (!selectable(i).includes(k)) return false;
    state.choice[i] = k;
    hint.textContent = '';
    render();
    return true;
  }

  function open(zone) {
    if (state.open) return false;
    state.open = true; state.zone = zone;
    state.choice = weapons.map((_, i) => { const s = selectable(i); return s.length === 1 ? s[0] : null; });   // 하나뿐이면 자동 선택
    const picks = Math.max(...weapons.map((w) => (growth.state.byId[w.id] ? growth.state.byId[w.id].picks : 0)), 0);
    title.textContent = `구역 ${zone + 1} 클리어 — 강화 선택`;
    sub.textContent = `무기마다 한 장씩 고르세요 (${Math.min(picks + 1, MAX_LEVEL)}/${MAX_LEVEL}회)`;
    hint.textContent = '';
    render();
    root.style.display = 'flex';
    if (onOpen) onOpen(zone);
    return true;
  }

  // 확정: 세 줄 다 골라져야 적용. 아니면 미선택 줄 강조
  function confirm() {
    if (!state.open) return false;
    if (!allDone()) {
      hint.textContent = '아직 고르지 않은 무기가 있습니다';
      rowEls.forEach((row, i) => { row.style.borderColor = rowDone(i) ? 'transparent' : '#ff5050'; });
      return false;
    }
    weapons.forEach((w, i) => { if (state.choice[i] !== null) growth.pick(w.id, state.choice[i]); });
    close(true);
    return true;
  }

  // 닫기. applied = 확정으로 닫힘(onClose에 전달). 적용 없이 닫는 경로는 스테이지 리셋뿐
  function close(applied = false) {
    if (!state.open) return false;
    state.open = false;
    root.style.display = 'none';
    if (onClose) onClose(applied, state.zone);
    return true;
  }

  return { state, root, open, select, confirm, close, selectable };
}
