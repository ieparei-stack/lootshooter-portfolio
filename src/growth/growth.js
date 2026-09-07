// 강화 적용 로직 (T38). DOM 없음 — Node 테스트 대상.
// 네 층: 원본(origs, 파일 값) · 튜닝(weapons[i], 패널이 직접 수정) · 강화(카드 Lv → 배율·perks) · 최종(effective[i]).
//   - effective[i]는 **별도 객체**로 한 번 만들고 refresh 때 제자리 갱신한다 (참조 안정). kit(recoil/spread/ads/shooter)·view·뷰모델·
//     이론 궤적·피해 계산은 전부 effective를 잡으므로 수치 강화가 자동으로 반영된다. 튜닝 패널·JSON 복사·파일 초기화는 weapons[i]만 다룬다.
//   - 행동 강화는 effective.perks(무기별 합성값)에 실린다. shooter(환급·브레이킹·멀티킬·강화탄·장탄수 회복) · movement(정조준 이동) ·
//     viewModel(정조준 흔들림)이 읽는다. 파일에 없는 키라 toJson/diffPaths(FIELDS 기준)에는 안 잡힌다.
//   - 튜닝이 바뀌면 refresh(i)를 불러야 한다 (main.js가 weaponPanel onChange에서). 반동은 recompile, 탄창은 onRefresh에서 비율 유지.
//   - 반동 바닥값: 반동 경로의 최종값은 원본의 40 % 아래로 못 내려간다 (튜닝으로 이미 낮췄어도) — max(0.4, 튜닝/원본 × 강화).
//   - 지원하지 않는 효과키·단계 배열 길이 ≠ 4인 카드는 경고 문장 + 그 카드만 무시(null).
import { cloneWeapon, getPath, setPath } from '../weapon/weaponData.js';
import { CARDS, CARD_COUNT, MAX_LEVEL } from './cards.js';

export const RECOIL_FLOOR = 0.4;
const round = (n, d) => { const k = 10 ** d; return Math.round(n * k) / k; };

const CURVE_V = ['pattern.v0', 'pattern.vG', 'pattern.vMax'];
const CURVE_H = ['pattern.h0', 'pattern.hMax'];

// 원본 대비 비율에 바닥값을 건 곱: 원본 0이면 0. 반환 { value, floored }
function floorMul(orig, tuned, mul) {
  if (!orig) return { value: 0, floored: false };
  const r = (tuned / orig) * mul;
  const floored = r < RECOIL_FLOOR;
  return { value: round(orig * (floored ? RECOIL_FLOOR : r), 4), floored };
}
// 반동 축 하나(axis 0 = 수직, 1 = 수평)에 배율. 반환 floored
function applyRecoil(eff, orig, tuned, mul, axis) {
  let floored = false;
  if (tuned.pattern.mode === 'array') {
    eff.pattern.arr = eff.pattern.arr.map((shot, i) => shot.map((v, k) => {
      if (k !== axis) return v;
      const o = orig.pattern.arr[i] ? orig.pattern.arr[i][k] : v;
      const r = floorMul(o, tuned.pattern.arr[i][k], mul); floored = floored || r.floored; return r.value;
    }));
  } else {
    for (const p of axis === 0 ? CURVE_V : CURVE_H) { const r = floorMul(getPath(orig, p), getPath(tuned, p), mul); floored = floored || r.floored; setPath(eff, p, r.value); }
  }
  return floored;
}
function arrRatio(a, b, k) {   // 배열 무기의 축 비율 (a/b), 0이 아닌 첫 성분 기준
  for (let i = 0; i < a.length; i++) if (b[i] && b[i][k]) return round(a[i][k] / b[i][k], 4);
  return 1;
}
function recoilRows(eff, orig, tuned, mul, axis) {
  if (tuned.pattern.mode === 'array') {
    const tR = arrRatio(tuned.pattern.arr, orig.pattern.arr, axis), fR = arrRatio(eff.pattern.arr, orig.pattern.arr, axis);
    return [{ path: axis === 0 ? 'arrMul.v' : 'arrMul.h', label: axis === 0 ? '고정 배열 수직 배율' : '고정 배열 수평 배율', orig: '×1.00', tuned: '×' + tR.toFixed(2), mul, final: '×' + fR.toFixed(2), floored: fR > tR * mul + 1e-6 }];
  }
  return (axis === 0 ? CURVE_V : CURVE_H).map((p) => {
    const o = getPath(orig, p), t = getPath(tuned, p), f = getPath(eff, p);
    return { path: p, label: p.replace('pattern.', ''), orig: o, tuned: t, mul, final: f, floored: o > 0 && f > t * mul + 1e-6 };
  });
}
const simple = (path, label, dec, roundFn = null) => ({
  apply: (eff, orig, tuned, mul) => { const v = getPath(tuned, path) * mul; setPath(eff, path, roundFn ? roundFn(v) : round(v, dec)); return false; },
  rows: (eff, orig, tuned, mul) => [{ path, label, orig: getPath(orig, path), tuned: getPath(tuned, path), mul, final: getPath(eff, path), floored: false }],
});

// 수치 효과 표: apply(eff, orig, tuned, mul) → floored, rows(eff, orig, tuned, mul) → 네 층 표 행
export const NUMERIC = {
  headshotMul: simple('headshotMul', '헤드샷 배율', 3),
  rpm: simple('rpm', 'RPM', 0),
  mag: simple('mag', '탄창 (발)', 0, (v) => Math.max(1, Math.round(v))),
  reloadTime: simple('reloadTime', '재장전 (s)', 2),
  adsTime: simple('ads.time', '조준 시간 (ms)', 0),
  recoilV: { apply: (eff, orig, tuned, mul) => applyRecoil(eff, orig, tuned, mul, 0), rows: (eff, orig, tuned, mul) => recoilRows(eff, orig, tuned, mul, 0) },
  recoilH: { apply: (eff, orig, tuned, mul) => applyRecoil(eff, orig, tuned, mul, 1), rows: (eff, orig, tuned, mul) => recoilRows(eff, orig, tuned, mul, 1) },
};
// 행동 효과: 기본값과 합성 규칙 (여러 카드가 같은 키를 쓰면 합성)
export const PERK_DEFAULTS = Object.freeze({
  headshotRefund: 0, breakFree: 0, breakSpreadMul: 1, killResetBloom: false, killDamageBuff: 0,
  enhancedEvery: 0, killAmmo: 0, adsKickMul: 1, adsMoveFree: false,
});
const PERK_MERGE = {
  headshotRefund: (a, b) => a + b, breakFree: Math.max, breakSpreadMul: (a, b) => a * b, killResetBloom: (a, b) => a || b,
  killDamageBuff: Math.max, enhancedEvery: (a, b) => (a && b ? Math.min(a, b) : a || b), killAmmo: (a, b) => (b === 0 ? a : b),
  adsKickMul: (a, b) => a * b, adsMoveFree: (a, b) => a || b,
};

// 카드 표 검증. 반환 { valid: {id: [card|null ×3]}, warnings }
export function validateCards(cards, weapons) {
  const valid = {}, warnings = [];
  for (const w of weapons) {
    const list = Array.isArray(cards[w.id]) ? cards[w.id] : [];
    valid[w.id] = [];
    for (let k = 0; k < CARD_COUNT; k++) {
      const c = list[k];
      if (!c) { valid[w.id].push(null); if (list.length) warnings.push(`강화 ${w.name} ${k + 1}번 카드가 없어 비웁니다`); continue; }
      let bad = null;
      if (!c.name || !Array.isArray(c.desc) || c.desc.length !== MAX_LEVEL + 1) bad = 'name/desc 형식';
      else if (!c.effects || typeof c.effects !== 'object' || !Object.keys(c.effects).length) bad = '효과 없음';
      else for (const [key, arr] of Object.entries(c.effects)) {
        if (!NUMERIC[key] && !(key in PERK_DEFAULTS)) { bad = `지원하지 않는 효과(${key})`; break; }
        if (!Array.isArray(arr) || arr.length !== MAX_LEVEL + 1) { bad = `${key} 단계 값이 ${MAX_LEVEL + 1}개가 아니어서`; break; }
      }
      if (bad) { warnings.push(`강화 ${w.name} '${c.name || k + 1}': ${bad} — 이 강화는 무시합니다`); valid[w.id].push(null); }
      else valid[w.id].push(c);
    }
  }
  return { valid, warnings };
}

// weapons = 튜닝 층(살아 있는 객체), origs = 파일 값. onRefresh(i, effective, prevMag)는 main.js가 recompile·탄창 비율 유지에 쓴다.
export function createGrowth(weapons, origs, { onRefresh = null, cards = CARDS } = {}) {
  const { valid, warnings } = validateCards(cards, weapons);
  const state = { byId: {} };
  const blank = () => ({ lv: Array(CARD_COUNT).fill(0), picks: 0 });
  for (const w of weapons) state.byId[w.id] = blank();
  const effective = weapons.map((w) => Object.assign(cloneWeapon(w), { perks: { ...PERK_DEFAULTS } }));
  const floored = weapons.map(() => Array(CARD_COUNT).fill(false));   // 바닥값에 걸린 카드 (성장 탭·T40 표시용)

  function card(id, k) { return (valid[id] || [])[k] || null; }
  function cards_(id) { return valid[id] || []; }
  function level(id, k) { return state.byId[id] ? state.byId[id].lv[k] : 0; }
  function indexOf(id) { return weapons.findIndex((w) => w.id === id); }

  function refresh(i) {
    const w = weapons[i], eff = effective[i], orig = origs[i];
    const prevMag = eff.mag;
    const fresh = cloneWeapon(w);
    for (const k of Object.keys(eff)) delete eff[k];
    for (const k of Object.keys(fresh)) eff[k] = fresh[k];
    const perks = { ...PERK_DEFAULTS };
    const lvs = state.byId[w.id] ? state.byId[w.id].lv : [];
    for (let k = 0; k < CARD_COUNT; k++) {
      const c = card(w.id, k);
      floored[i][k] = false;
      const lv = lvs[k] || 0;
      if (!c || lv <= 0) continue;
      for (const [key, arr] of Object.entries(c.effects)) {
        if (NUMERIC[key]) { if (NUMERIC[key].apply(eff, orig, w, arr[lv])) floored[i][k] = true; }
        else perks[key] = PERK_MERGE[key](perks[key], arr[lv]);
      }
    }
    eff.perks = perks;
    if (onRefresh) onRefresh(i, eff, prevMag);
    return eff;
  }
  function refreshAll() { for (let i = 0; i < weapons.length; i++) refresh(i); }

  function setLevel(id, k, lv) {
    const i = indexOf(id);
    if (i < 0 || !card(id, k)) return false;
    const v = Math.max(0, Math.min(MAX_LEVEL, Math.round(lv)));
    if (state.byId[id].lv[k] === v) return false;
    state.byId[id].lv[k] = v;
    refresh(i);
    return true;
  }

  // 성장 탭 표: 수치 효과가 건드리는 경로마다 { path, label, orig, tuned, mul, final, floored, card: k }
  function rows(i) {
    const w = weapons[i], eff = effective[i], orig = origs[i];
    const out = [];
    for (let k = 0; k < CARD_COUNT; k++) {
      const c = card(w.id, k);
      if (!c) continue;
      const lv = level(w.id, k);
      for (const [key, arr] of Object.entries(c.effects)) {
        if (!NUMERIC[key]) continue;
        for (const r of NUMERIC[key].rows(eff, orig, w, arr[lv])) out.push({ ...r, card: k });
      }
    }
    return out;
  }
  // 무기 i의 perks (읽기 전용 참조)
  function perksOf(i) { return effective[i].perks; }

  // 전부 Lv 0 (T40 스테이지 리셋용)
  function reset() {
    for (const w of weapons) state.byId[w.id] = blank();
    refreshAll();
  }

  return { state, effective, warnings, card, cards: cards_, level, setLevel, refresh, refreshAll, rows, perksOf, reset, floored, indexOf };
}
