import { config } from '../config.js';

// 화면 왼쪽 위의 조절 패널. T03: 마우스 감도 슬라이더 하나.
// T06에서 이동 속도·FOV 등 항목을 addSlider()로 추가한다.
export function createSettingsPanel() {
  const root = document.createElement('div');
  root.id = 'settings';
  root.style.cssText = [
    'position:fixed', 'top:12px', 'left:12px', 'z-index:10',
    'padding:10px 12px', 'min-width:220px',
    'background:rgba(0,0,0,0.55)', 'color:#eee',
    'font:13px/1.5 system-ui, sans-serif', 'border-radius:6px',
    'user-select:none',
  ].join(';');
  document.body.appendChild(root);

  const hint = document.createElement('div');
  hint.style.cssText = 'opacity:0.7;margin-bottom:6px';
  hint.textContent = '클릭: 마우스 잠금 · ESC: 해제 (슬라이더는 해제 상태에서 조절) · 좌클릭: 사격 · 우클릭 유지: 정조준 · R: 재장전 · 1~4 / 휠: 무기 전환';
  root.appendChild(hint);

  // 슬라이더 한 줄 추가. get/set으로 값을 읽고 쓴다.
  function addSlider({ label, min, max, step, get, set, format }) {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin-top:4px';

    const title = document.createElement('div');
    const value = document.createElement('span');
    value.style.cssText = 'float:right;font-variant-numeric:tabular-nums';
    title.textContent = label;
    title.appendChild(value);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = get();
    input.style.cssText = 'width:100%;display:block';

    const fmt = format || ((v) => String(v));
    const refresh = () => { value.textContent = fmt(get()); };
    input.addEventListener('input', () => { set(Number(input.value)); refresh(); });
    refresh();

    row.appendChild(title);
    row.appendChild(input);
    root.appendChild(row);
    return { input, refresh };
  }

  addSlider({
    label: '감도 (°/100px)',
    min: config.mouse.sensitivityMin,
    max: config.mouse.sensitivityMax,
    step: config.mouse.sensitivityStep,
    get: () => config.mouse.sensitivity,
    set: (v) => { config.mouse.sensitivity = v; },
    format: (v) => v.toFixed(1),
  });

  // T06: 이동·FOV 조절. 범위는 UI 한계(임시). 값은 config에 바로 쓰이고 다음 프레임부터 반영된다.
  const P = config.player, R = config.render;
  addSlider({ label: '걷기 속도 (m/s)', min: 3, max: 9, step: 0.1,
    get: () => P.walkSpeed, set: (v) => { P.walkSpeed = v; }, format: (v) => v.toFixed(1) });
  addSlider({ label: '질주 배율', min: 1.0, max: 2.5, step: 0.05,
    get: () => P.sprintMul, set: (v) => { P.sprintMul = v; }, format: (v) => '×' + v.toFixed(2) });
  addSlider({ label: '웅크리기 배율', min: 0.2, max: 1.0, step: 0.05,
    get: () => P.crouchMul, set: (v) => { P.crouchMul = v; }, format: (v) => '×' + v.toFixed(2) });
  addSlider({ label: '지향 FOV (°)', min: 60, max: 120, step: 1,
    get: () => R.fov, set: (v) => { R.fov = v; }, format: (v) => String(v) });
  addSlider({ label: '정조준 FOV (°)', min: 30, max: 90, step: 1,
    get: () => R.adsFov, set: (v) => { R.adsFov = v; }, format: (v) => String(v) });

  return { root, addSlider };
}
