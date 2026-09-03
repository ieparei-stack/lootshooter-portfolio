// 무기 데이터 로더 + 검증.
// 소스: data/weapons.json (시뮬레이터 docs/총기 시뮬레이터.html WEAPONS의 키 이름을 그대로 유지)
// 값이 빠지거나 잘못되면 경고 문장을 만들고 기본값(기준 AR)으로 진행한다. 게임을 멈추지 않는다.
//
// 필드 의미·단위 (시뮬레이터와 동일)
//   rpm            분당 발사 수
//   mag            탄창
//   pattern.mode   'curve' | 'array'
//   pattern.v0     초탄 수직 반동 (°/샷)        curve
//   pattern.vG     발당 수직 상승률 (°/샷/발)    curve
//   pattern.vMax   수직 반동 상한 (°/샷)         curve
//   pattern.h0     초탄 수평 반동 (°/샷)         curve
//   pattern.hMode  'fixed-alt'(좌우 교대 고정) | 'random'(±hMax 무작위)   curve
//   pattern.hMax   수평 반동 상한 (°/샷)         curve
//   pattern.arr    [[v, h], ...] 고정 배열 (°)   array
//   randV / randH  무작위 지터 비율 (0~1). 수직은 음수로 내려가지 않음
//   recovery.delay 복귀 시작 지연 (ms)
//   recovery.speed 복귀 속도 (°/s). 보정분 제외
//   spread.base    기본 퍼짐 (°)   spread.bloom 발당 누적 (°)   spread.max 상한 (°)   spread.decay 초당 회복 (°/s)
//   ads.allowed    정조준 가능 여부   ads.recoil 반동 배율   ads.spread 퍼짐 배율   ads.time 조준 시간 (ms)
//   cap.on / cap.deg   누적 수직 반동 상한 (°)
// 3D에서 추가한 필드
//   damage         발당 피해   headshotMul 머리 배율
//   falloff.start / end (m) / minRatio   거리 감쇠 구간과 최소 피해 비율
//   reloadTime     재장전 시간 (s)
//   moveSpreadMul  걷기 최고속도일 때 퍼짐 배율 (속도에 비례해 1~이 값)

// 기본값 = 기준 AR. 파일이 통째로 망가져도 이 값으로 플레이된다.
export const BASELINE = Object.freeze({
  id: 'std', name: '기준 AR', tag: 'BASELINE',
  rpm: 660, mag: 30,
  pattern: { mode: 'curve', v0: 0.28, vG: 0.030, vMax: 0.55, h0: 0.056, hMode: 'fixed-alt', hMax: 0.09 },
  randV: 0.25, randH: 0.0,
  recovery: { delay: 110, speed: 7 },
  spread: { base: 0.34, bloom: 0.045, max: 0.95, decay: 1.6 },
  ads: { allowed: true, recoil: 0.72, spread: 0.30, time: 250 },
  cap: { on: false, deg: 6 },
  damage: 200, headshotMul: 1.5,
  falloff: { start: 20, end: 50, minRatio: 0.5 },
  reloadTime: 2.0,
  moveSpreadMul: 2.0,
});

// 검증 표. when: 'curve' | 'array' 는 pattern.mode가 그 값일 때만 검사.
const SCHEMA = [
  { path: 'id',   type: 'string', def: 'std' },
  { path: 'name', type: 'string', def: '기준 AR' },
  { path: 'tag',  type: 'string', def: '' },
  { path: 'rpm',  type: 'number', def: 660, min: 1 },
  { path: 'mag',  type: 'number', def: 30, min: 1 },
  { path: 'pattern.mode',  type: 'enum', values: ['curve', 'array'], def: 'curve' },
  { path: 'pattern.v0',    type: 'number', def: 0.28, min: 0, when: 'curve' },
  { path: 'pattern.vG',    type: 'number', def: 0.030, min: 0, when: 'curve' },
  { path: 'pattern.vMax',  type: 'number', def: 0.55, min: 0, when: 'curve' },
  { path: 'pattern.h0',    type: 'number', def: 0.056, min: 0, when: 'curve' },
  { path: 'pattern.hMode', type: 'enum', values: ['fixed-alt', 'random'], def: 'fixed-alt', when: 'curve' },
  { path: 'pattern.hMax',  type: 'number', def: 0.09, min: 0, when: 'curve' },
  { path: 'randV', type: 'number', def: 0.25, min: 0, max: 1 },
  { path: 'randH', type: 'number', def: 0.0,  min: 0, max: 1 },
  { path: 'recovery.delay', type: 'number', def: 110, min: 0 },
  { path: 'recovery.speed', type: 'number', def: 7, min: 0 },
  { path: 'spread.base',  type: 'number', def: 0.34, min: 0 },
  { path: 'spread.bloom', type: 'number', def: 0.045, min: 0 },
  { path: 'spread.max',   type: 'number', def: 0.95, min: 0 },
  { path: 'spread.decay', type: 'number', def: 1.6, min: 0 },
  { path: 'ads.allowed', type: 'boolean', def: true },
  { path: 'ads.recoil',  type: 'number', def: 0.72, min: 0 },
  { path: 'ads.spread',  type: 'number', def: 0.30, min: 0 },
  { path: 'ads.time',    type: 'number', def: 250, min: 0 },
  { path: 'cap.on',  type: 'boolean', def: false },
  { path: 'cap.deg', type: 'number', def: 6, min: 0 },
  { path: 'damage',      type: 'number', def: 200, min: 0 },
  { path: 'headshotMul', type: 'number', def: 1.5, min: 0 },
  { path: 'falloff.start',    type: 'number', def: 20, min: 0 },
  { path: 'falloff.end',      type: 'number', def: 50, min: 0 },
  { path: 'falloff.minRatio', type: 'number', def: 0.5, min: 0, max: 1 },
  { path: 'reloadTime',    type: 'number', def: 2.0, min: 0 },
  { path: 'moveSpreadMul', type: 'number', def: 2.0, min: 0 },
];

const ARRAY_SHOT_DEFAULT = [0.2, 0];

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!o[keys[i]] || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function checkField(w, rule, label, warnings) {
  const v = getPath(w, rule.path);
  const at = `${label}.${rule.path}`;
  let bad = null;
  if (v === undefined || v === null || v === '') bad = '값이 없어';
  else if (rule.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) bad = `숫자가 아니어서(${JSON.stringify(v)})`;
  else if (rule.type === 'boolean' && typeof v !== 'boolean') bad = `true/false가 아니어서(${JSON.stringify(v)})`;
  else if (rule.type === 'string' && typeof v !== 'string') bad = `문자열이 아니어서(${JSON.stringify(v)})`;
  else if (rule.type === 'enum' && !rule.values.includes(v)) bad = `허용값(${rule.values.join('/')})이 아니어서(${JSON.stringify(v)})`;
  else if (rule.type === 'number' && rule.min !== undefined && v < rule.min) bad = `${rule.min} 미만이어서(${v})`;
  else if (rule.type === 'number' && rule.max !== undefined && v > rule.max) bad = `${rule.max} 초과여서(${v})`;
  if (bad) {
    warnings.push(`${at}: ${bad} 기본값 ${JSON.stringify(rule.def)} 사용`);
    setPath(w, rule.path, rule.def);
  }
}

// 무기 하나 정규화. 원본을 바꾸지 않고 복사본을 돌려준다.
function normalizeWeapon(raw, label, warnings) {
  const w = (raw && typeof raw === 'object') ? JSON.parse(JSON.stringify(raw)) : {};
  if (!raw || typeof raw !== 'object') warnings.push(`${label}: 객체가 아니어서 기준 AR 기본값으로 대체`);

  // mode 먼저 확정해야 curve/array 필드를 고를 수 있다
  checkField(w, SCHEMA.find((r) => r.path === 'pattern.mode'), label, warnings);
  const mode = w.pattern.mode;

  for (const rule of SCHEMA) {
    if (rule.path === 'pattern.mode') continue;
    if (rule.when && rule.when !== mode) continue;
    checkField(w, rule, label, warnings);
  }

  if (mode === 'array') {
    const arr = w.pattern.arr;
    if (!Array.isArray(arr) || arr.length === 0) {
      warnings.push(`${label}.pattern.arr: 배열이 없어 curve 모드 기본값으로 대체`);
      w.pattern = { ...BASELINE.pattern };
    } else {
      w.pattern.arr = arr.map((shot, i) => {
        const ok = Array.isArray(shot) && shot.length === 2 &&
          shot.every((n) => typeof n === 'number' && Number.isFinite(n));
        if (!ok) {
          warnings.push(`${label}.pattern.arr[${i}]: [숫자, 숫자]가 아니어서(${JSON.stringify(shot)}) 기본값 ${JSON.stringify(ARRAY_SHOT_DEFAULT)} 사용`);
          return [...ARRAY_SHOT_DEFAULT];
        }
        return [shot[0], shot[1]];
      });
    }
  }
  return w;
}

// 파일 전체(JSON 객체)를 받아 { weapons, warnings }를 돌려준다.
export function loadWeapons(rawJson) {
  const warnings = [];
  const list = rawJson && Array.isArray(rawJson.weapons) ? rawJson.weapons : null;
  if (!list || list.length === 0) {
    warnings.push('weapons: 무기 목록이 없거나 비어 있어 기준 AR 1정으로 진행');
    return { weapons: [normalizeWeapon(BASELINE, 'weapons[0]', warnings)], warnings };
  }
  const weapons = list.map((raw, i) => normalizeWeapon(raw, `weapons[${i}]`, warnings));
  return { weapons, warnings };
}
