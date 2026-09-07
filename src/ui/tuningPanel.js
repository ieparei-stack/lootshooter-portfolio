// 무기 튜닝 로직 (T17.5 → T26.4에서 DOM은 weaponPanel.js로 옮기고 여기는 순수 로직만 남김).
//   - 살아 있는 weapon 객체를 직접 수정한다. recoil/spread/ads/shooter는 매 프레임 weapon.*를 읽으므로 바로 반영.
//     반동 패턴만 생성 시 1회 컴파일이라 pattern.* 변경 후 recoil.recompile()을 부른다.
//   - 가상 값(파일에 없음): arrMul.v/h = 고정 배열 30발 전체 배율, curveMul.v/h = curve 무기 v0·vG·vMax / h0·hMax 배율 (T26.4).
//     둘 다 **파일 값(orig) 기준**으로 곱한다. 배율을 움직이면 개별 값을 파일값×배율로 덮어쓴다.
//   - 파일 값(origs)과 다른 항목은 diffPaths로 찾는다. toJson으로 weapons.json 항목 형식을 얻는다.
//   - localStorage(tuning.v1)에 보존. 항목 형식 { weapon, arrMul, curveMul } — curveMul은 T26.4에서 추가, 없으면 {1,1} (옛 저장분 호환).
import { loadWeapons, cloneWeapon, getPath, setPath } from '../weapon/weaponData.js';

export const STORAGE_KEY = 'tuning.v1';

// 슬라이더 정의 (T17.5의 30개). 상한은 T32에서 핸들링 ×3 · 스펙 ×10 (사용자 지시 2026-09-06). when: 'curve' | 'array' (pattern.mode) | 'ads' (ads.allowed) | 'cap' (cap.on)
// weaponPanel.js가 path로 찾아 탭에 배치한다. 누락 검사는 이 목록 기준.
export const FIELDS = [
  { group: '기본', path: 'rpm', label: 'RPM', min: 300, max: 12000, step: 10 },
  { group: '기본', path: 'mag', label: '탄창 (발)', min: 10, max: 600, step: 1 },
  { group: '기본', path: 'reloadTime', label: '재장전 (s)', min: 0.5, max: 50, step: 0.1 },
  { group: '기본', path: 'damage', label: '피해 (발당)', min: 50, max: 5000, step: 10 },
  { group: '수직 반동', path: 'pattern.v0', label: '초탄 v0 (°)', min: 0, max: 4.5, step: 0.01, when: 'curve' },
  { group: '수직 반동', path: 'pattern.vG', label: '발당 상승 vG (°/발)', min: 0, max: 0.3, step: 0.001, when: 'curve' },
  { group: '수직 반동', path: 'pattern.vMax', label: '상한 vMax (°)', min: 0, max: 6, step: 0.01, when: 'curve' },
  { group: '수평 반동', path: 'pattern.h0', label: '초탄 h0 (°)', min: 0, max: 0.9, step: 0.002, when: 'curve' },
  { group: '수평 반동', path: 'pattern.hMax', label: '상한 hMax (°)', min: 0, max: 1.5, step: 0.005, when: 'curve' },
  { group: '수평 반동', path: 'pattern.hMode', label: '수평 방식', type: 'enum', values: ['fixed-alt', 'random'], when: 'curve' },
  { group: '고정 배열 (30발 전체에 곱함)', path: 'arrMul.v', label: '수직 배율', min: 0, max: 9, step: 0.05, when: 'array', virtual: true },
  { group: '고정 배열 (30발 전체에 곱함)', path: 'arrMul.h', label: '수평 배율', min: 0, max: 9, step: 0.05, when: 'array', virtual: true },
  { group: '무작위', path: 'randV', label: '수직 지터 randV', min: 0, max: 3, step: 0.01 },
  { group: '무작위', path: 'randH', label: '수평 지터 randH', min: 0, max: 3, step: 0.01 },
  { group: '시각', path: 'viewTracking', label: '시각 추적 (카메라 비율)', min: 0, max: 1, step: 0.05 },   // T35
  { group: '복귀', path: 'recovery.delay', label: '지연 delay (ms)', min: 0, max: 1500, step: 5 },
  { group: '복귀', path: 'recovery.speed', label: '속도 speed (°/s)', min: 0, max: 120, step: 0.5 },
  { group: '퍼짐', path: 'spread.base', label: '기본 base (°)', min: 0, max: 6, step: 0.01 },
  { group: '퍼짐', path: 'spread.bloom', label: '발당 증가 bloom (°)', min: 0, max: 0.6, step: 0.001 },
  { group: '퍼짐', path: 'spread.max', label: '상한 max (°)', min: 0, max: 9, step: 0.01 },
  { group: '퍼짐', path: 'spread.decay', label: '회복 decay (°/s)', min: 0, max: 15, step: 0.05 },
  { group: '퍼짐', path: 'moveSpreadMul', label: '이동 배율 (걷기 최고속)', min: 1, max: 24, step: 0.1 },
  { group: '퍼짐', path: 'crouchSpreadMul', label: '웅크리기 배율', min: 0.1, max: 3, step: 0.05 },   // T35
  { group: '정조준', path: 'ads.allowed', label: '정조준 가능', type: 'bool' },
  { group: '정조준', path: 'ads.recoil', label: '반동 배율', min: 0, max: 4.5, step: 0.01, when: 'ads' },
  { group: '정조준', path: 'ads.spread', label: '퍼짐 배율', min: 0, max: 4.5, step: 0.01, when: 'ads' },
  { group: '정조준', path: 'ads.time', label: '조준 시간 (ms)', min: 0, max: 1800, step: 10, when: 'ads' },
  { group: '정조준', path: 'ads.fov', label: '정조준 FOV (°)', min: 30, max: 170, step: 1, when: 'ads' },   // T35 무기별 (전에는 전역 config.render.adsFov)
  { group: 'cap', path: 'cap.on', label: '누적 수직 상한 사용', type: 'bool' },
  { group: 'cap', path: 'cap.deg', label: '상한 (°)', min: 0, max: 45, step: 0.5, when: 'cap' },
];

// curve 배율이 곱하는 개별 경로
export const CURVE_V_PATHS = ['pattern.v0', 'pattern.vG', 'pattern.vMax'];
export const CURVE_H_PATHS = ['pattern.h0', 'pattern.hMax'];

export function fieldVisible(field, w) {
  if (!field.when) return true;
  if (field.when === 'curve') return w.pattern.mode === 'curve';
  if (field.when === 'array') return w.pattern.mode === 'array';
  if (field.when === 'ads') return w.ads.allowed;
  if (field.when === 'cap') return w.cap.on;
  return true;
}

const round4 = (n) => Math.round(n * 10000) / 10000;

// ---- 순수 로직 (DOM 없음, Node 테스트 대상) ----

// 값 하나 적용. orig = 파일 값(배율의 기준). ctx = { arrMul, curveMul, recoil, shooter } (recoil/shooter는 없어도 됨)
export function applyTuning(weapon, orig, path, value, ctx = {}) {
  if (path === 'arrMul.v' || path === 'arrMul.h') {
    const m = ctx.arrMul || (ctx.arrMul = { v: 1, h: 1 });
    m[path === 'arrMul.v' ? 'v' : 'h'] = value;
    weapon.pattern.arr = orig.pattern.arr.map(([v, h]) => [round4(v * m.v), round4(h * m.h)]);
  } else if (path === 'curveMul.v' || path === 'curveMul.h') {
    const m = ctx.curveMul || (ctx.curveMul = { v: 1, h: 1 });
    const axis = path === 'curveMul.v' ? 'v' : 'h';
    m[axis] = value;
    for (const p of axis === 'v' ? CURVE_V_PATHS : CURVE_H_PATHS) setPath(weapon, p, round4(getPath(orig, p) * value));
  } else {
    setPath(weapon, path, value);
  }
  if (path.startsWith('pattern') || path.startsWith('arrMul') || path.startsWith('curveMul')) { if (ctx.recoil) ctx.recoil.recompile(); }
  if (path === 'mag' && ctx.shooter) ctx.shooter.state.mag = Math.min(ctx.shooter.state.mag, value);
}

// curve 무기의 현재 배율 표시값: 개별 값/파일값 비율이 축의 경로 전부에서 같으면 그 비율, 아니면 null(혼합). 파일값 0인 경로는 건너뜀
export function curveMulOf(weapon, orig, axis) {
  let ratio = null;
  for (const p of axis === 'v' ? CURVE_V_PATHS : CURVE_H_PATHS) {
    const o = getPath(orig, p), c = getPath(weapon, p);
    if (!o) continue;
    const r = round4(c / o);
    if (ratio === null) ratio = r;
    else if (Math.abs(r - ratio) > 1e-3) return null;
  }
  return ratio === null ? 1 : ratio;
}

// 파일 값과 다른 경로 목록 (배열은 통째로 한 항목)
export function diffPaths(weapon, orig) {
  const out = [];
  for (const f of FIELDS) {
    if (f.virtual) continue;
    if (getPath(weapon, f.path) !== getPath(orig, f.path)) out.push(f.path);
  }
  if (weapon.headshotMul !== orig.headshotMul) out.push('headshotMul');   // T26.4 스펙 탭 신규 슬라이더
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
export function saveTuning(weapon, arrMul, curveMul = { v: 1, h: 1 }) {
  const store = readStore();
  store[weapon.id] = { weapon: cloneWeapon(weapon), arrMul: { ...arrMul }, curveMul: { ...curveMul } };
  writeStore(store);
}
export function clearTuning(id) {
  const store = readStore();
  delete store[id];
  writeStore(store);
}

// T35에서 추가된 키 — 옛 tuning.v1 저장분에 없으면 파일 값을 채워 넣고 검증한다 (저장된 튜닝을 잃지 않게)
export const MIGRATE_PATHS = ['viewTracking', 'crouchSpreadMul', 'ads.fov'];

// 시작 시: 파일 값을 origs로 복사해 두고, 저장된 튜닝이 있으면 weapon에 덮어쓴다 (검증을 통과한 것만).
// kit(recoil 컴파일)을 만들기 전에 불러야 한다. 반환: { origs, arrMuls, curveMuls, restored }
export function restoreTuning(weapons) {
  const origs = weapons.map(cloneWeapon);
  const arrMuls = weapons.map(() => ({ v: 1, h: 1 }));
  const curveMuls = weapons.map(() => ({ v: 1, h: 1 }));
  const restored = [];
  const store = (typeof localStorage === 'undefined') ? {} : readStore();
  weapons.forEach((w, i) => {
    const s = store[w.id];
    if (!s || !s.weapon) return;
    for (const p of MIGRATE_PATHS) if (getPath(s.weapon, p) === undefined) setPath(s.weapon, p, getPath(w, p));
    const { weapons: [norm], warnings } = loadWeapons({ weapons: [s.weapon] });
    if (warnings.length || norm.id !== w.id || norm.pattern.mode !== w.pattern.mode) { clearTuning(w.id); return; }
    for (const k of Object.keys(norm)) w[k] = norm[k];
    if (s.arrMul) arrMuls[i] = { v: s.arrMul.v ?? 1, h: s.arrMul.h ?? 1 };
    if (s.curveMul) curveMuls[i] = { v: s.curveMul.v ?? 1, h: s.curveMul.h ?? 1 };
    restored.push(w.id);
  });
  return { origs, arrMuls, curveMuls, restored };
}
