import { config } from '../config.js';
import { cloneWeapon, getPath } from '../weapon/weaponData.js';
import { FIELDS, fieldVisible, applyTuning, curveMulOf, diffPaths, toJson, saveTuning, clearTuning } from './tuningPanel.js';
import { CARD_COUNT, MAX_LEVEL, cardDesc } from '../growth/cards.js';

// 무기 세팅 패널 (T26.4). 우측 고정 폭, 드롭다운(무기 선택) + 탭 3개(스펙·핸들링·성장). 튜닝 패널(T17.5)을 대체한다.
//   - 탭 이름은 나중에 데이터 구조 문서의 층 이름이 된다. 슬라이더↔JSON 키 대응은 TASKS.md T26.4 표.
//   - 기존 FIELDS 30개 전부가 세 탭 어딘가에 있다 (Node 테스트가 누락을 검사). 스펙 탭에 headshotMul 신규.
//   - 반동 묶음 (T31): curve 무기는 기본값 6개(v0·vG·vMax·h0·hMax·수평 방식) + 수직·수평 배율(curveMul, 파일값 기준. 기본값을 개별로 바꿔
//     파일값×배율이 아니면 '혼합' 표시). array 무기(CS형)는 예외 — 배율(arrMul)만. 고급에는 기본값이 더 이상 없다.
//   - 상한: T32에서 핸들링 ×3 · 스펙 ×10 (정조준 FOV는 카메라 한계로 170). settingsPanel의 같은 전역 슬라이더와 범위를 맞춘다.
//   - 전역 필드(웅크리기·질주 배율)는 config를 직접 읽고 쓰며 tuning.v1에 저장하지 않는다. 점 기준은 시작 시 값.
//   - T35: 정조준 FOV는 전역이 아니라 무기별 ads.fov. 반동 묶음에 시각 추적(viewTracking), 이동 묶음에 웅크리기 퍼짐 배율(crouchSpreadMul).
//   - 행: ● 변경 표시 · 숫자 입력 · 슬라이더 · 더블클릭 = 파일 값 복원. 탭 옆 변경 개수 배지.
//   - localStorage ui.weaponPanel.v1 = { tab, advOpen }. 선택 무기는 기억하지 않고 항상 1번(CS형)에서 시작 (사용자 지시 2026-09-06). 튜닝 값은 tuning.v1 그대로 (tuningPanel.js).
//   - T38 성장 탭: 드롭다운으로 고른 무기의 강화 카드 3장(핵심/보조 없음, Lv +/− 개발 확인용, 현재·다음 Lv 문구) + 수치 효과 표(행 = 강화가 건드리는 필드, 열 = 원본·튜닝·강화·최종).
//     슬라이더·복원·초기화는 튜닝 층(weapon)만 만지고, onChange에서 main.js가 growth.refresh로 최종값을 다시 계산한다. 탄창 클램프도 거기서(ctx에 shooter를 넘기지 않는다).
export const UI_KEY = 'ui.weaponPanel.v1';

const byPath = Object.fromEntries(FIELDS.map((f) => [f.path, f]));
const F = (path, label) => ({ ...byPath[path], ...(label ? { label } : {}) });
const globalField = (key, label, get, set, min, max, step, fmt) => ({ path: 'config.' + key, label, global: true, get, set, min, max, step, fmt });

const P = config.player;
export const TABS = [
  { id: 'spec', label: '스펙', groups: [{ title: null, fields: [
    F('damage', '발당 피해'), { path: 'headshotMul', label: '헤드샷 배율', min: 1, max: 30, step: 0.1 },
    F('rpm'), F('mag', '탄창 (발)'), F('reloadTime', '재장전 시간 (s)'), F('ads.allowed', '정조준 가능'),
  ] }] },
  { id: 'handling', label: '핸들링', groups: [
    { title: '반동', fields: [
      // curve 무기: 기본값(파일 값) 먼저, 그 아래 배율 (T31). CS형은 when:'curve'라 자동으로 숨는다
      F('pattern.v0'), F('pattern.vG'), F('pattern.vMax'), F('pattern.h0'), F('pattern.hMax'), F('pattern.hMode'),
      { path: 'curveMul.v', label: '수직 배율 (파일값 기준)', min: 0, max: 9, step: 0.05, when: 'curve', virtual: true },
      { path: 'curveMul.h', label: '수평 배율 (파일값 기준)', min: 0, max: 9, step: 0.05, when: 'curve', virtual: true },
      { path: 'arrMul.v', label: '수직 배율', min: 0, max: 9, step: 0.05, when: 'array', virtual: true },
      { path: 'arrMul.h', label: '수평 배율', min: 0, max: 9, step: 0.05, when: 'array', virtual: true },
      F('viewTracking', '시각 추적 (카메라가 따라가는 비율)'),
      F('recovery.delay', '복귀 지연 (ms)'), F('recovery.speed', '복귀 속도 (°/s)'),
    ] },
    { title: '퍼짐', fields: [F('spread.base', 'base (°)'), F('spread.bloom', 'bloom (°/발)'), F('spread.decay', 'decay (°/s)'), F('spread.max', 'max (°)')] },
    { title: '정조준', fields: [
      F('ads.fov', '정조준 FOV (°)'),
      F('ads.time', '조준 시간 (ms)'), F('ads.spread', '퍼짐 배율'), F('ads.recoil', '반동 배율'),
    ] },
    { title: '이동', fields: [F('moveSpreadMul', '이동 퍼짐 배율 (걷기 최고속)'), F('moveSpreadCap', '이동 사격 상한 (이동 조준원 ×, 0=없음)'), F('crouchSpreadMul', '웅크리기 퍼짐 배율'), F('crouchRecoilMul', '웅크리기 반동 배율')] },   // T50
    { title: '고급', adv: true, fields: [
      F('randV'), F('randH'),
      { ...byPath['arrMul.v'], label: '고정 배열 스케일 수직' }, { ...byPath['arrMul.h'], label: '고정 배열 스케일 수평' },
      F('cap.on', '누적 상한 사용'), F('cap.deg', '누적 상한 (°)'),
      globalField('player.crouchMul', '웅크리기 배율', () => P.crouchMul, (v) => { P.crouchMul = v; }, 0.2, 3.0, 0.05, (v) => '×' + v.toFixed(2)),
      globalField('player.sprintMul', '질주 배율', () => P.sprintMul, (v) => { P.sprintMul = v; }, 1.0, 7.5, 0.05, (v) => '×' + v.toFixed(2)),
    ] },
  ] },
  { id: 'growth', label: '성장', groups: [] },
];

// 필드가 실제로 건드리는 파일 경로들 (배지 계산·점 표시용)
export function underlyingPaths(field) {
  if (field.path === 'arrMul.v' || field.path === 'arrMul.h') return ['pattern.arr'];
  if (field.path === 'curveMul.v') return ['pattern.v0', 'pattern.vG', 'pattern.vMax'];
  if (field.path === 'curveMul.h') return ['pattern.h0', 'pattern.hMax'];
  if (field.global) return [];
  return [field.path];
}
export function tabPaths(tab) {
  const s = new Set();
  for (const g of tab.groups) for (const f of g.fields) for (const p of underlyingPaths(f)) s.add(p);
  return s;
}

function readUi() { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch { return {}; } }
function writeUi(u) { try { localStorage.setItem(UI_KEY, JSON.stringify(u)); } catch { /* 저장 불가 */ } }

// notice: 세션 동안 헤더 아래에 보이는 안내 한 줄 (T36: 파일 값이 바뀌어 저장 튜닝을 버렸을 때). null이면 없음
export function createWeaponPanel({ weapons, kits, origs, arrMuls, curveMuls, growth = null, onChange = null, notice = null }) {
  const ui = { tab: 'spec', advOpen: false, ...readUi(), weaponIndex: 0 };   // 선택 무기는 항상 1번(CS형)부터
  if (!TABS.some((t) => t.id === ui.tab)) ui.tab = 'spec';
  if (!(ui.weaponIndex >= 0 && ui.weaponIndex < weapons.length)) ui.weaponIndex = 0;
  const globalDefaults = {};   // 전역 필드 점 기준 (시작 시 값)
  for (const t of TABS) for (const g of t.groups) for (const f of g.fields) if (f.global) globalDefaults[f.path] = f.get();
  const state = { equipped: 0, index: ui.weaponIndex };

  const root = document.createElement('div');
  root.id = 'weaponPanel';
  root.style.cssText = [
    'position:fixed', 'right:12px', 'top:48px', 'bottom:140px', 'width:340px', 'z-index:10',
    'padding:10px 12px', 'background:rgba(0,0,0,0.6)', 'color:#eee', 'overflow-y:auto',
    'font:12px/1.4 system-ui, sans-serif', 'border-radius:6px', 'user-select:none', 'box-sizing:border-box',
  ].join(';');
  document.body.appendChild(root);

  const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text !== undefined) e.textContent = text; return e; };
  const BTN = 'padding:4px 8px;font:12px system-ui;background:#3a5f8a;color:#fff;border:0;border-radius:4px;cursor:pointer';

  function cur() {
    const i = state.index;
    return { i, weapon: weapons[i], orig: origs[i], arrMul: arrMuls[i], curveMul: curveMuls[i], recoil: kits[i]?.recoil, shooter: kits[i]?.shooter };
  }
  function ctxOf(c) { return { arrMul: c.arrMul, curveMul: c.curveMul, recoil: c.recoil }; }   // shooter 없음: 탄창 클램프는 growth 최종값 기준으로 main.js onRefresh가 (T38)
  function persistUi() { writeUi({ tab: ui.tab, advOpen: ui.advOpen }); }

  // 값 읽기/쓰기/복원 — 필드 종류별
  function getValue(f, c) {
    if (f.global) return f.get();
    if (f.path.startsWith('arrMul.')) return c.arrMul[f.path.endsWith('.v') ? 'v' : 'h'];
    if (f.path.startsWith('curveMul.')) return c.curveMul[f.path.endsWith('.v') ? 'v' : 'h'];
    return getPath(c.weapon, f.path);
  }
  function isChanged(f, c, diffs) {
    if (f.global) return Math.abs(f.get() - globalDefaults[f.path]) > 1e-9;
    return underlyingPaths(f).some((p) => diffs.includes(p));
  }
  function commit(f, c, value) {
    if (f.global) { f.set(value); }
    else { applyTuning(c.weapon, c.orig, f.path, value, ctxOf(c)); saveTuning(c.weapon, c.arrMul, c.curveMul, c.orig); }
    if (onChange) onChange(c.weapon);
  }
  function restoreField(f, c) {
    if (f.global) { f.set(globalDefaults[f.path]); }
    else if (f.path.startsWith('arrMul.') || f.path.startsWith('curveMul.')) { applyTuning(c.weapon, c.orig, f.path, 1, ctxOf(c)); saveTuning(c.weapon, c.arrMul, c.curveMul, c.orig); }
    else { applyTuning(c.weapon, c.orig, f.path, getPath(c.orig, f.path), ctxOf(c)); saveTuning(c.weapon, c.arrMul, c.curveMul, c.orig); }
    if (onChange) onChange(c.weapon);
  }
  function fmt(v, f) {
    if (f.fmt) return f.fmt(v);
    if (f.virtual) return '×' + Number(v).toFixed(2);
    const dec = f.step >= 1 ? 0 : f.step >= 0.1 ? 1 : f.step >= 0.01 ? 2 : 3;
    return Number(v).toFixed(dec);
  }
  const clamp = (v, f) => Math.min(f.max, Math.max(f.min, v));

  // ---- 렌더 ----
  let refreshers = [];
  function render() {
    root.replaceChildren();
    refreshers = [];
    const c = cur();
    const w = c.weapon;
    const diffs = diffPaths(w, c.orig);

    // 헤더: 드롭다운 (▶ = 장착 중)
    const head = el('div', 'display:flex;gap:6px;align-items:center;margin-bottom:8px');
    const sel = el('select', 'flex:1;font:13px system-ui;font-weight:700;background:#222;color:#eee;border:1px solid #555;border-radius:4px;padding:3px');
    weapons.forEach((x, i) => { const o = el('option', '', `${i === state.equipped ? '▶ ' : ''}${i + 1}. ${x.name}`); o.value = String(i); sel.appendChild(o); });
    sel.value = String(state.index);
    sel.addEventListener('change', () => { state.index = Number(sel.value); persistUi(); render(); });
    head.appendChild(sel);
    root.appendChild(head);
    if (notice) root.appendChild(el('div', 'margin:-4px 0 8px;padding:4px 6px;border-radius:4px;background:rgba(255,210,74,0.18);color:#ffd24a;font-size:11px', notice));

    // 탭 버튼 + 배지
    const tabs = el('div', 'display:flex;gap:4px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.2)');
    for (const t of TABS) {
      const active = t.id === ui.tab;
      const b = el('button', `flex:1;padding:6px 4px;font:700 12px system-ui;border:0;border-bottom:2px solid ${active ? '#7cc4ff' : 'transparent'};background:transparent;color:${active ? '#fff' : '#aaa'};cursor:pointer`, t.label);
      const n = countChanges(t, c, diffs);
      if (n) { const badge = el('span', 'margin-left:5px;padding:0 6px;border-radius:8px;background:#ffd24a;color:#000;font-size:11px', String(n)); b.appendChild(badge); }
      b.addEventListener('click', () => { ui.tab = t.id; persistUi(); render(); });
      tabs.appendChild(b);
    }
    root.appendChild(tabs);

    const tab = TABS.find((t) => t.id === ui.tab);
    if (tab.id === 'growth') {
      renderGrowth(c);
    } else {
      for (const g of tab.groups) {
        const fields = g.fields.filter((f) => f.global || fieldVisible(f, w));
        if (!fields.length) continue;
        let body = root;
        if (g.title) {
          const gh = el('div', 'margin-top:8px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.2);font-weight:700;opacity:0.9' + (g.adv ? ';cursor:pointer' : ''),
            g.adv ? `${ui.advOpen ? '▾' : '▸'} ${g.title}` : g.title);
          root.appendChild(gh);
          if (g.adv) {
            body = el('div', ui.advOpen ? '' : 'display:none');
            root.appendChild(body);
            gh.addEventListener('click', () => { ui.advOpen = !ui.advOpen; persistUi(); render(); });
          }
        }
        for (const f of fields) body.appendChild(row(f, c, diffs));
      }
    }

    // 하단 버튼
    const foot = el('div', 'display:flex;gap:6px;margin-top:12px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.2)');
    const reset = el('button', BTN + ';flex:1', '파일 값으로 초기화');
    const copy = el('button', BTN + ';flex:1', 'JSON 복사');
    foot.append(reset, copy);
    root.appendChild(foot);
    const out = el('textarea', 'width:100%;height:0;margin:0;padding:0;border:0;display:none;font:11px monospace;color:#ddd;background:rgba(255,255,255,0.08);box-sizing:border-box');
    root.appendChild(out);
    reset.addEventListener('click', () => {
      const fresh = cloneWeapon(c.orig);
      for (const k of Object.keys(fresh)) w[k] = fresh[k];
      c.arrMul.v = 1; c.arrMul.h = 1; c.curveMul.v = 1; c.curveMul.h = 1;
      if (c.recoil) c.recoil.recompile();
      clearTuning(w.id);
      if (onChange) onChange(w);
      render();
    });
    copy.addEventListener('click', () => {
      const text = toJson(w);
      out.value = text; out.style.display = 'block'; out.style.height = '160px'; out.style.margin = '8px 0 0';
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { copy.textContent = '복사됨 ✓'; }, () => { copy.textContent = '아래에서 복사'; });
      else copy.textContent = '아래에서 복사';
      out.focus(); out.select();
    });
  }

  // T38 성장 탭: 카드 3장 (Lv +/− · 현재/다음 Lv 문구) + 수치 효과 네 층 표. 행동 효과(환급·브레이킹·처치 버프…)는 문구로만 보인다
  const fmtCell = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v));
  function renderGrowth(c) {
    if (!growth) { root.appendChild(el('div', 'opacity:0.7;padding:12px 0', '강화 없음')); return; }
    const w = c.weapon;
    const cards = el('div', 'margin-top:4px');
    for (let k = 0; k < CARD_COUNT; k++) {
      const card = growth.card(w.id, k);
      const lv = growth.level(w.id, k);
      const box = el('div', 'margin-top:6px;padding:6px 8px;border-radius:4px;background:rgba(255,255,255,0.06)');
      const head = el('div', 'display:flex;align-items:center;gap:6px');
      if (!card) {
        head.appendChild(el('span', 'flex:1;opacity:0.5', `${k + 1}. 지원 안 함 (경고 배지 참고)`));
        box.appendChild(head); cards.appendChild(box); continue;
      }
      head.appendChild(el('span', 'flex:1;font-weight:700', `${k + 1}. ${card.name}`));
      head.appendChild(el('span', 'font-variant-numeric:tabular-nums', `Lv ${lv}/${MAX_LEVEL}`));
      const mk = (txt, dis, d) => {
        const b = el('button', BTN + ';padding:1px 7px' + (dis ? ';opacity:0.35;cursor:default' : ''), txt);
        b.disabled = dis;
        b.addEventListener('click', () => { growth.setLevel(w.id, k, lv + d); render(); });   // setLevel이 refresh → main.js onRefresh(recompile·탄창·슬롯)
        return b;
      };
      head.append(mk('−', lv <= 0, -1), mk('+', lv >= MAX_LEVEL, +1));
      box.appendChild(head);
      const fl = growth.floored[c.i] && growth.floored[c.i][k];
      box.appendChild(el('div', 'margin-top:2px;font-size:11px', (lv > 0 ? `현재: ${cardDesc(card, lv)}` : '현재: 없음') + (fl ? ' (바닥값)' : '')));
      box.appendChild(el('div', 'margin-top:1px;font-size:11px;opacity:0.6', lv >= MAX_LEVEL ? '최대' : `다음: ${cardDesc(card, lv + 1)}`));
      cards.appendChild(box);
    }
    root.appendChild(cards);

    // 표: 수치 효과 — 필드 · 원본 · 튜닝 · 강화 · 최종
    const rowsData = growth.rows(c.i);
    if (rowsData.length) {
      const table = el('table', 'width:100%;margin-top:10px;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums');
      const tr = (cells, headRow) => {
        const r = el('tr', headRow ? 'opacity:0.7' : 'border-top:1px solid rgba(255,255,255,0.12)');
        cells.forEach((t, kk) => { const td = el(headRow ? 'th' : 'td', 'padding:3px 4px;text-align:' + (kk === 0 ? 'left' : 'right') + (headRow ? ';font-weight:700' : ''), t); r.appendChild(td); });
        return r;
      };
      table.appendChild(tr(['필드', '원본', '튜닝', '강화', '최종'], true));
      for (const row of rowsData) {
        const mul = typeof row.mul === 'number' ? '×' + row.mul.toFixed(Math.abs(row.mul - Math.round(row.mul * 100) / 100) < 1e-9 ? 2 : 3) : String(row.mul);
        const r = tr([row.label, fmtCell(row.orig), fmtCell(row.tuned), mul, fmtCell(row.final) + (row.floored ? ' (바닥값)' : '')]);
        if (typeof row.mul === 'number' && Math.abs(row.mul - 1) > 1e-9) r.lastChild.style.color = '#7cc4ff';
        table.appendChild(r);
      }
      root.appendChild(table);
    }
    root.appendChild(el('div', 'margin-top:6px;opacity:0.55;font-size:11px', '최종 = 튜닝 × 강화. 반동은 원본의 40 % 아래로 내려가지 않는다. 행동 효과(환급·브레이킹·처치 버프·강화탄·이동)는 문구대로 사격에 적용. Lv +/−는 개발 확인용 (선택 화면은 T39).'));
  }

  function countChanges(tab, c, diffs) {
    const paths = tabPaths(tab);
    let n = 0;
    for (const p of paths) if (diffs.includes(p)) n++;
    for (const g of tab.groups) for (const f of g.fields) if (f.global && isChanged(f, c, diffs)) n++;
    return n;
  }

  // 필드 한 행: [● 라벨 (전역)] [숫자 입력] / [슬라이더]. 더블클릭 = 파일 값 복원
  function row(f, c, diffs) {
    const r = el('div', 'margin-top:4px');
    r.title = f.global ? '전역 설정 (무기 파일에 없음) · 더블클릭: 시작 값으로' : `${f.path} · 더블클릭: 파일 값으로`;
    const head = el('div', 'display:flex;align-items:center;gap:6px');
    const label = el('span', 'flex:1');
    const tag = f.global ? el('span', 'opacity:0.55;font-size:11px', '(전역)') : null;
    head.appendChild(label);
    if (tag) head.appendChild(tag);
    r.appendChild(head);

    const changedNow = () => isChanged(f, c, diffPaths(c.weapon, c.orig));
    const paint = () => {
      const ch = changedNow();
      label.textContent = (ch ? '● ' : '') + f.label;
      label.style.color = ch ? '#ffd24a' : '';
    };

    if (f.type === 'bool') {
      const input = el('input', 'margin:0');
      input.type = 'checkbox'; input.checked = !!getValue(f, c);
      input.addEventListener('change', () => { commit(f, c, input.checked); render(); });
      head.prepend(input);
      paint();
    } else if (f.type === 'enum') {
      const s = el('select', 'width:100%;display:block;font:12px system-ui;background:#222;color:#eee;border:1px solid #555;border-radius:3px');
      for (const v of f.values) { const o = el('option', '', v); o.value = v; s.appendChild(o); }
      s.value = getValue(f, c);
      s.addEventListener('change', () => { commit(f, c, s.value); render(); });
      r.appendChild(s);
      paint();
    } else {
      const num = el('input', 'width:64px;font:12px system-ui;background:#222;color:#eee;border:1px solid #555;border-radius:3px;padding:1px 4px;text-align:right');
      num.type = 'number'; num.min = f.min; num.max = f.max; num.step = f.step;
      const mixed = el('span', 'opacity:0.7;font-size:11px');
      head.append(mixed, num);
      const range = el('input', 'width:100%;display:block;margin:2px 0 0');
      range.type = 'range'; range.min = f.min; range.max = f.max; range.step = f.step;
      r.appendChild(range);
      const sync = () => {
        const v = getValue(f, c);
        range.value = v; num.value = f.step >= 1 ? String(v) : String(Number(fmt(v, f).replace('×', '')));
        // curve 배율: 고급에서 개별 값을 바꿔 파일값×배율이 아니면 '혼합'
        if (f.path.startsWith('curveMul.')) { const m = curveMulOf(c.weapon, c.orig, f.path.endsWith('.v') ? 'v' : 'h'); mixed.textContent = m === null ? '혼합' : ''; }
        paint();
      };
      range.addEventListener('input', () => { commit(f, c, Number(range.value)); refreshAll(); });
      const commitNum = () => { const v = Number(num.value); if (!Number.isFinite(v)) { sync(); return; } commit(f, c, clamp(v, f)); refreshAll(); };
      num.addEventListener('change', commitNum);
      num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitNum(); num.blur(); } });
      sync();
      refreshers.push(sync);
    }
    r.addEventListener('dblclick', (e) => { if (e.target.tagName === 'INPUT' && e.target.type === 'number') return; restoreField(f, c); render(); });
    return r;
  }
  function refreshAll() { for (const fn of refreshers) fn(); refreshBadges(); }
  function refreshBadges() {
    // 탭 배지만 다시 그리기엔 구조가 단순하니 탭 줄만 교체
    const c = cur(); const diffs = diffPaths(c.weapon, c.orig);
    const tabs = root.children[1];
    if (!tabs) return;
    [...tabs.children].forEach((b, k) => {
      const t = TABS[k]; const n = countChanges(t, c, diffs);
      const badge = b.querySelector('span');
      if (n && badge) badge.textContent = String(n);
      else if (n && !badge) { const s = el('span', 'margin-left:5px;padding:0 6px;border-radius:8px;background:#ffd24a;color:#000;font-size:11px', String(n)); b.appendChild(s); }
      else if (!n && badge) badge.remove();
    });
  }

  function setEquipped(i) { state.equipped = i; if (!root.hidden) render(); }
  function select(i) { state.index = i; persistUi(); render(); }
  function setVisible(v) { root.hidden = !v; if (v) render(); }

  render();
  return { root, state, ui, render, select, setEquipped, setVisible };
}
