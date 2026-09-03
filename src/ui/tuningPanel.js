// 무기 튜닝 패널 (T17.5). 현재 무기의 값을 슬라이더로 바꿔 즉시 느껴본다.
//   - 살아 있는 weapon 객체를 직접 수정한다. recoil/spread/ads/shooter는 매 프레임 weapon.*를 읽으므로 바로 반영.
//     반동 패턴만 생성 시 1회 컴파일이라 pattern.* 변경 후 recoil.recompile()을 부른다.
//   - CS형(고정 배열)은 30발 배열에 수직/수평 배율을 곱한다. 새 필드 없이 배열 자체가 결과다.
//   - 파일 값(origs)과 다른 항목은 ● 표시. "JSON 복사"로 weapons.json 항목 형식을 얻는다.
//   - localStorage(tuning.v1)에 보존해 새로고침에도 유지. "파일 값으로 초기화"가 지운다.
// 슬라이더는 설정 패널과 같이 ESC로 마우스 잠금을 푼 상태에서 조절한다.
import { loadWeapons, cloneWeapon, getPath, setPath } from '../weapon/weaponData.js';

export const STORAGE_KEY = 'tuning.v1';

// 슬라이더 정의. when: 'curve' | 'array' (pattern.mode) | 'ads' (ads.allowed) | 'cap' (cap.on)
export const FIELDS = [
  { group: '기본', path: 'rpm', label: 'RPM', min: 300, max: 1200, step: 10 },
  { group: '기본', path: 'mag', label: '탄창 (발)', min: 10, max: 60, step: 1 },
  { group: '기본', path: 'reloadTime', label: '재장전 (s)', min: 0.5, max: 5, step: 0.1 },
  { group: '기본', path: 'damage', label: '피해 (발당)', min: 50, max: 500, step: 10 },
  { group: '수직 반동', path: 'pattern.v0', label: '초탄 v0 (°)', min: 0, max: 1.5, step: 0.01, when: 'curve' },
  { group: '수직 반동', path: 'pattern.vG', label: '발당 상승 vG (°/발)', min: 0, max: 0.1, step: 0.001, when: 'curve' },
  { group: '수직 반동', path: 'pattern.vMax', label: '상한 vMax (°)', min: 0, max: 2, step: 0.01, when: 'curve' },
  { group: '수평 반동', path: 'pattern.h0', label: '초탄 h0 (°)', min: 0, max: 0.3, step: 0.002, when: 'curve' },
  { group: '수평 반동', path: 'pattern.hMax', label: '상한 hMax (°)', min: 0, max: 0.5, step: 0.005, when: 'curve' },
  { group: '수평 반동', path: 'pattern.hMode', label: '수평 방식', type: 'enum', values: ['fixed-alt', 'random'], when: 'curve' },
  { group: '고정 배열 (30발 전체에 곱함)', path: 'arrMul.v', label: '수직 배율', min: 0, max: 3, step: 0.05, when: 'array', virtual: true },
  { group: '고정 배열 (30발 전체에 곱함)', path: 'arrMul.h', label: '수평 배율', min: 0, max: 3, step: 0.05, when: 'array', virtual: true },
  { group: '무작위', path: 'randV', label: '수직 지터 randV', min: 0, max: 1, step: 0.01 },
  { group: '무작위', path: 'randH', label: '수평 지터 randH', min: 0, max: 1, step: 0.01 },
  { group: '복귀', path: 'recovery.delay', label: '지연 delay (ms)', min: 0, max: 500, step: 5 },
  { group: '복귀', path: 'recovery.speed', label: '속도 speed (°/s)', min: 0, max: 40, step: 0.5 },
  { group: '퍼짐', path: 'spread.base', label: '기본 base (°)', min: 0, max: 2, step: 0.01 },
  { group: '퍼짐', path: 'spread.bloom', label: '발당 증가 bloom (°)', min: 0, max: 0.2, step: 0.001 },
  { group: '퍼짐', path: 'spread.max', label: '상한 max (°)', min: 0, max: 3, step: 0.01 },
  { group: '퍼짐', path: 'spread.decay', label: '회복 decay (°/s)', min: 0, max: 5, step: 0.05 },
  { group: '퍼짐', path: 'moveSpreadMul', label: '이동 배율 (걷기 최고속)', min: 1, max: 8, step: 0.1 },
  { group: '정조준', path: 'ads.allowed', label: '정조준 가능', type: 'bool' },
  { group: '정조준', path: 'ads.recoil', label: '반동 배율', min: 0, max: 1.5, step: 0.01, when: 'ads' },
  { group: '정조준', path: 'ads.spread', label: '퍼짐 배율', min: 0, max: 1.5, step: 0.01, when: 'ads' },
  { group: '정조준', path: 'ads.time', label: '조준 시간 (ms)', min: 0, max: 600, step: 10, when: 'ads' },
  { group: 'cap', path: 'cap.on', label: '누적 수직 상한 사용', type: 'bool' },
  { group: 'cap', path: 'cap.deg', label: '상한 (°)', min: 0, max: 15, step: 0.5, when: 'cap' },
];

function visible(field, w) {
  if (!field.when) return true;
  if (field.when === 'curve') return w.pattern.mode === 'curve';
  if (field.when === 'array') return w.pattern.mode === 'array';
  if (field.when === 'ads') return w.ads.allowed;
  if (field.when === 'cap') return w.cap.on;
  return true;
}

const round4 = (n) => Math.round(n * 10000) / 10000;

// ---- 순수 로직 (DOM 없음, Node 테스트 대상) ----

// 값 하나 적용. orig = 파일 값(배열 배율의 기준). ctx = { arrMul, recoil, shooter } (recoil/shooter는 없어도 됨)
export function applyTuning(weapon, orig, path, value, ctx = {}) {
  if (path === 'arrMul.v' || path === 'arrMul.h') {
    const m = ctx.arrMul || (ctx.arrMul = { v: 1, h: 1 });
    m[path === 'arrMul.v' ? 'v' : 'h'] = value;
    weapon.pattern.arr = orig.pattern.arr.map(([v, h]) => [round4(v * m.v), round4(h * m.h)]);
  } else {
    setPath(weapon, path, value);
  }
  if (path.startsWith('pattern') || path.startsWith('arrMul')) { if (ctx.recoil) ctx.recoil.recompile(); }
  if (path === 'mag' && ctx.shooter) ctx.shooter.state.mag = Math.min(ctx.shooter.state.mag, value);
}

// 파일 값과 다른 경로 목록 (배열은 통째로 한 항목)
export function diffPaths(weapon, orig) {
  const out = [];
  for (const f of FIELDS) {
    if (f.virtual) continue;
    if (getPath(weapon, f.path) !== getPath(orig, f.path)) out.push(f.path);
  }
  if (weapon.pattern.mode === 'array' && JSON.stringify(weapon.pattern.arr) !== JSON.stringify(orig.pattern.arr)) out.push('pattern.arr');
  return out;
}

// weapons.json 항목 형식 문자열 — 파일과 같은 모양(작은 객체는 한 줄, 배열은 한 줄에 7개)
const oneLine = (m) => m.replace(/\s+/g, ' ');
export function toJson(weapon) {
  const w = cloneWeapon(weapon);
  let arrText = null;
  if (w.pattern.mode === 'array') {
    const rows = [];
    for (let i = 0; i < w.pattern.arr.length; i += 7) {
      rows.push('        ' + w.pattern.arr.slice(i, i + 7).map(([v, h]) => `[${v}, ${h}]`).join(', '));
    }
    arrText = '[\n' + rows.join(',\n') + '\n      ]';
    w.pattern.arr = '__ARR__';
  }
  let text = JSON.stringify(w, null, 2)
    .replace(/"(recovery|spread|ads|cap|falloff)": \{[^}]*\}/g, oneLine);
  if (arrText) {
    text = text
      .replace(/"pattern": \{\n\s+"mode": "array",\n\s+"arr": /, '"pattern": { "mode": "array", "arr": ')
      .replace('"__ARR__"\n  }', arrText + ' }');
  } else {
    text = text.replace(/"pattern": \{[^}]*\}/, oneLine);
  }
  return text;
}

// ---- 저장 ----
function readStore() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { return {}; }
}
function writeStore(store) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* 저장 불가 환경 */ }
}
export function saveTuning(weapon, arrMul) {
  const store = readStore();
  store[weapon.id] = { weapon: cloneWeapon(weapon), arrMul: { ...arrMul } };
  writeStore(store);
}
export function clearTuning(id) {
  const store = readStore();
  delete store[id];
  writeStore(store);
}

// 시작 시: 파일 값을 origs로 복사해 두고, 저장된 튜닝이 있으면 weapon에 덮어쓴다 (검증을 통과한 것만).
// kit(recoil 컴파일)을 만들기 전에 불러야 한다. 반환: { origs, arrMuls, restored }
export function restoreTuning(weapons) {
  const origs = weapons.map(cloneWeapon);
  const arrMuls = weapons.map(() => ({ v: 1, h: 1 }));
  const restored = [];
  const store = (typeof localStorage === 'undefined') ? {} : readStore();
  weapons.forEach((w, i) => {
    const s = store[w.id];
    if (!s || !s.weapon) return;
    const { weapons: [norm], warnings } = loadWeapons({ weapons: [s.weapon] });
    if (warnings.length || norm.id !== w.id || norm.pattern.mode !== w.pattern.mode) { clearTuning(w.id); return; }
    for (const k of Object.keys(norm)) w[k] = norm[k];
    if (s.arrMul) arrMuls[i] = { v: s.arrMul.v ?? 1, h: s.arrMul.h ?? 1 };
    restored.push(w.id);
  });
  return { origs, arrMuls, restored };
}

// ---- 패널 DOM ----
export function createTuningPanel({ weapons, origs, arrMuls, onChange }) {
  const root = document.createElement('div');
  root.id = 'tuning';
  root.style.cssText = [
    'position:fixed', 'left:12px', 'top:330px', 'bottom:12px', 'width:300px', 'z-index:10',
    'padding:10px 12px', 'background:rgba(0,0,0,0.55)', 'color:#eee', 'overflow-y:auto',
    'font:12px/1.4 system-ui, sans-serif', 'border-radius:6px', 'user-select:none', 'box-sizing:border-box',
  ].join(';');
  document.body.appendChild(root);

  let cur = null;   // { weapon, orig, arrMul, recoil, shooter, index }

  function el(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render() {
    root.replaceChildren();
    if (!cur) return;
    const { weapon: w, orig, arrMul } = cur;
    const diffs = diffPaths(w, orig);

    const title = el('div', 'font-weight:700;font-size:14px;margin-bottom:2px', `무기 튜닝 — ${w.name}`);
    const badge = el('div', 'opacity:0.8;margin-bottom:6px',
      diffs.length ? `● 파일과 다름 ${diffs.length}개 (새로고침해도 유지됨)` : '파일 값 그대로');
    if (diffs.length) badge.style.color = '#ffd24a';
    root.append(title, badge);

    const btns = el('div', 'display:flex;gap:6px;margin-bottom:8px');
    const btnCss = 'flex:1;padding:4px 6px;font:12px system-ui;background:#3a5f8a;color:#fff;border:0;border-radius:4px;cursor:pointer';
    const reset = el('button', btnCss, '파일 값으로 초기화');
    const copy = el('button', btnCss, 'JSON 복사');
    btns.append(reset, copy);
    root.appendChild(btns);
    const out = el('textarea', 'width:100%;height:0;margin:0;padding:0;border:0;display:none;font:11px monospace;color:#ddd;background:rgba(255,255,255,0.08);box-sizing:border-box');
    root.appendChild(out);

    reset.addEventListener('click', () => {
      const fresh = cloneWeapon(orig);
      for (const k of Object.keys(fresh)) w[k] = fresh[k];
      arrMul.v = 1; arrMul.h = 1;
      if (cur.recoil) cur.recoil.recompile();
      if (cur.shooter) cur.shooter.state.mag = Math.min(cur.shooter.state.mag, w.mag);
      clearTuning(w.id);
      if (onChange) onChange(w);
      render();
    });
    copy.addEventListener('click', () => {
      const text = toJson(w);
      out.value = text;
      out.style.display = 'block'; out.style.height = '160px'; out.style.margin = '0 0 8px';
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { copy.textContent = '복사됨 ✓'; }, () => { copy.textContent = '아래에서 복사'; });
      else copy.textContent = '아래에서 복사';
      out.focus(); out.select();
    });

    let lastGroup = null;
    for (const f of FIELDS) {
      if (!visible(f, w)) continue;
      if (f.group !== lastGroup) {
        lastGroup = f.group;
        root.appendChild(el('div', 'margin-top:8px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.2);font-weight:700;opacity:0.9', f.group));
      }
      const row = el('label', 'display:block;margin-top:3px');
      const changed = f.virtual ? diffs.includes('pattern.arr') : diffs.includes(f.path);
      const head = el('div', changed ? 'color:#ffd24a' : '');
      const valueEl = el('span', 'float:right;font-variant-numeric:tabular-nums');
      head.textContent = (changed ? '● ' : '') + f.label;
      head.appendChild(valueEl);
      row.appendChild(head);

      const getV = () => f.virtual ? arrMul[f.path.endsWith('.v') ? 'v' : 'h'] : getPath(w, f.path);
      const commit = (v) => {
        applyTuning(w, orig, f.path, v, cur);
        saveTuning(w, arrMul);
        if (onChange) onChange(w);
        // 표시 구조가 바뀌는 항목(모드·토글)은 다시 그림, 나머지는 라벨만 갱신
        if (f.type === 'bool' || f.type === 'enum') render(); else refreshLabels();
      };

      if (f.type === 'bool') {
        const input = el('input', 'margin-right:6px');
        input.type = 'checkbox'; input.checked = !!getV();
        input.addEventListener('change', () => commit(input.checked));
        head.prepend(input);
      } else if (f.type === 'enum') {
        const sel = el('select', 'width:100%;display:block;font:12px system-ui;background:#222;color:#eee;border:1px solid #555;border-radius:3px');
        for (const v of f.values) { const o = el('option', '', v); o.value = v; sel.appendChild(o); }
        sel.value = getV();
        sel.addEventListener('change', () => commit(sel.value));
        row.appendChild(sel);
      } else {
        const input = el('input', 'width:100%;display:block;margin:0');
        input.type = 'range'; input.min = f.min; input.max = f.max; input.step = f.step; input.value = getV();
        input.addEventListener('input', () => commit(Number(input.value)));
        row.appendChild(input);
        valueEl.textContent = fmt(getV(), f);
      }
      if (f.type !== 'range' && f.type !== undefined) valueEl.textContent = '';
      row._refresh = () => {
        const d = diffPaths(w, orig);
        const ch = f.virtual ? d.includes('pattern.arr') : d.includes(f.path);
        head.style.color = ch ? '#ffd24a' : '';
        head.firstChild && head.firstChild.nodeType === 3 && (head.firstChild.textContent = (ch ? '● ' : '') + f.label);
        if (f.type === undefined) valueEl.textContent = fmt(getV(), f);
        badge.textContent = d.length ? `● 파일과 다름 ${d.length}개 (새로고침해도 유지됨)` : '파일 값 그대로';
        badge.style.color = d.length ? '#ffd24a' : '';
      };
      root.appendChild(row);
    }
    function refreshLabels() { for (const r of root.querySelectorAll('label')) if (r._refresh) r._refresh(); }
  }

  function fmt(v, f) {
    if (f.virtual) return '×' + Number(v).toFixed(2);
    const dec = f.step >= 1 ? 0 : f.step >= 0.1 ? 1 : f.step >= 0.01 ? 2 : 3;
    return Number(v).toFixed(dec);
  }

  // kit = { weapon, recoil, shooter } (loadout의 kit). index = 라인업 번호
  function show(kit, index) {
    cur = { weapon: kit.weapon, orig: origs[index], arrMul: arrMuls[index], recoil: kit.recoil, shooter: kit.shooter, index };
    render();
  }

  return { root, show, render };
}
