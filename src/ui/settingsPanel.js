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
  hint.textContent = '클릭: 마우스 잠금 · ESC: 해제 (슬라이더는 해제 상태에서 조절) · 좌클릭: 사격 · 우클릭 유지: 정조준 · R: 재장전 · X: 탄착군 지우기 · 1~4 / 휠: 무기 전환 · ESC 후 왼쪽 아래: 무기 튜닝 · 흰 궤적: 이론 반동(무작위 없음) · P: 궤적 켜기/끄기 · 25m 빨간 선을 넘으면 웨이브 시작 (3웨이브, 사격장 끝에서 등장) · HP 0 → 2초 뒤 그 자리 부활, 현재 웨이브 재시작 · M: 구역 리셋';
  root.appendChild(hint);

  // 슬라이더 한 줄 추가. get/set으로 값을 읽고 쓴다. parent를 주면 그 안에 (접이식 그룹용, T22).
  function addSlider({ label, min, max, step, get, set, format }, parent = root) {
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
    parent.appendChild(row);
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

  // 버튼 한 줄 추가 (T18: 탄착군 지우기). 잠금 해제 상태에서 누른다.
  function addButton(label, onClick, parent = root) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'display:block;width:100%;margin-top:8px;padding:5px 8px;font:13px system-ui;background:#3a5f8a;color:#fff;border:0;border-radius:4px;cursor:pointer';
    btn.addEventListener('click', onClick);
    parent.appendChild(btn);
    return btn;
  }

  // 접이식 그룹 (T22 몬스터 레버). 기본 접힘. 펼치면 패널이 길어지므로 onToggle로 아래 패널 위치를 맞춘다.
  function addGroup(title, { open = false, onToggle = null } = {}) {
    const head = document.createElement('div');
    head.style.cssText = 'margin-top:10px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.2);font-weight:700;cursor:pointer;user-select:none';
    const body = document.createElement('div');
    body.style.display = open ? 'block' : 'none';
    const label = () => `${body.style.display === 'none' ? '▸' : '▾'} ${title}`;
    head.textContent = label();
    head.addEventListener('click', () => {
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
      head.textContent = label();
      if (onToggle) onToggle(body.style.display !== 'none');
    });
    root.appendChild(head);
    root.appendChild(body);
    const addText = (text) => {
      const el = document.createElement('div');
      el.style.cssText = 'margin-top:6px;opacity:0.85';
      el.textContent = text;
      body.appendChild(el);
      return el;
    };
    return {
      body,
      addSlider: (opts) => addSlider(opts, body),
      addButton: (l, fn) => addButton(l, fn, body),
      addText,
    };
  }

  return { root, addSlider, addButton, addGroup };
}
