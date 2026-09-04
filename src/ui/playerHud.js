// 플레이어 HUD (T24): HP 바(중앙 아래) + 피격 비네트 + 피격 방향 호 + 사망 오버레이. 사용자 결정 2026-09-04.
const VIGNETTE_PEAK = 0.55;     // 피격 순간 비네트 알파
const VIGNETTE_FADE = 0.4;      // 비네트가 사라지는 시간 (s)
const LOW_HP_RATIO = 0.3;       // 이 이하면 비네트 바닥값 유지
const LOW_HP_ALPHA = 0.2;
const ARC_TIME = 0.6;           // 방향 호 유지+페이드 (s)
const ARC_MAX = 4;              // 동시에 보이는 호 최대 수
const ARC_RADIUS = 180;         // 화면 중앙에서 호까지 (px)

export function createPlayerHud() {
  const layer = document.createElement('div');
  layer.id = 'playerHud';
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5';
  document.body.appendChild(layer);

  // 비네트 (전체 화면)
  const vignette = document.createElement('div');
  vignette.style.cssText = 'position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center, rgba(200,0,0,0) 50%, rgba(200,0,0,1) 100%)';
  layer.appendChild(vignette);

  // 방향 호 컨테이너 (화면 중앙 원점)
  const arcs = [];
  const arcRoot = document.createElement('div');
  arcRoot.style.cssText = 'position:absolute;left:50%;top:50%;width:0;height:0';
  layer.appendChild(arcRoot);
  for (let i = 0; i < ARC_MAX; i++) {
    // 원의 위쪽 60°만 보이는 링: border-top만 색을 주고 rotate로 방향을 맞춘다
    const el = document.createElement('div');
    const d = ARC_RADIUS * 2;
    el.style.cssText = [
      'position:absolute', `left:${-ARC_RADIUS}px`, `top:${-ARC_RADIUS}px`, `width:${d}px`, `height:${d}px`,
      'border-radius:50%', 'border:6px solid transparent', 'border-top-color:rgba(255,40,40,0.95)',
      'box-sizing:border-box', 'opacity:0',
      // border-top은 원의 위쪽 90° 정도를 차지한다 → 중심에서 위 변의 20~80% 지점으로 자르면 약 62°만 남는다
      'clip-path:polygon(50% 50%, 20% 0%, 80% 0%)',
    ].join(';');
    arcRoot.appendChild(el);
    arcs.push({ el, t: 0 });
  }

  // HP 바 (중앙 아래)
  const hpRoot = document.createElement('div');
  hpRoot.style.cssText = 'position:absolute;left:50%;bottom:60px;transform:translateX(-50%);width:260px;text-align:center;font:700 14px/1.3 system-ui, sans-serif;color:#eee;text-shadow:0 0 3px #000;font-variant-numeric:tabular-nums;user-select:none';
  const bar = document.createElement('div');
  bar.style.cssText = 'height:10px;background:rgba(0,0,0,0.55);border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,0.25)';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;width:100%;background:#3ddc84';
  bar.appendChild(fill);
  const num = document.createElement('div');
  num.style.marginTop = '3px';
  hpRoot.appendChild(bar);
  hpRoot.appendChild(num);
  layer.appendChild(hpRoot);

  // 사망 오버레이
  const death = document.createElement('div');
  // display를 인라인으로 바꾸므로 hidden 속성 대신 display로 켜고 끈다 (인라인 display:flex가 [hidden]을 이긴다)
  death.style.cssText = 'position:absolute;inset:0;background:rgba(120,0,0,0.45);display:none;align-items:center;justify-content:center;color:#fff;font:800 36px/1.2 system-ui, sans-serif;text-shadow:0 2px 6px #000;font-variant-numeric:tabular-nums';
  layer.appendChild(death);

  let vignetteT = 0;   // 남은 페이드 시간
  let lowHp = false;

  function setHp(hp, max) {
    const r = max > 0 ? hp / max : 0;
    fill.style.width = (r * 100).toFixed(1) + '%';
    fill.style.background = r <= LOW_HP_RATIO ? '#e03030' : '#3ddc84';
    num.textContent = `${Math.ceil(hp)} / ${max}`;
    lowHp = r <= LOW_HP_RATIO && hp > 0;
  }

  // angleDeg: 0 = 앞(화면 위), 시계방향
  function hit(angleDeg) {
    vignetteT = VIGNETTE_FADE;
    // 가장 오래된 호를 재사용
    let a = arcs[0];
    for (const x of arcs) if (x.t < a.t) a = x;
    a.t = ARC_TIME;
    a.el.style.transform = `rotate(${angleDeg}deg)`;
  }

  function setDead(remainSec) {
    death.style.display = remainSec === null ? 'none' : 'flex';
    if (remainSec !== null) death.textContent = `사망 — ${remainSec.toFixed(1)}초 후 부활`;
  }

  function update(dt) {
    if (vignetteT > 0) vignetteT = Math.max(0, vignetteT - dt);
    const a = Math.max(vignetteT / VIGNETTE_FADE * VIGNETTE_PEAK, lowHp ? LOW_HP_ALPHA : 0);
    vignette.style.opacity = a.toFixed(3);
    for (const x of arcs) {
      if (x.t <= 0) continue;
      x.t = Math.max(0, x.t - dt);
      x.el.style.opacity = Math.min(1, x.t / (ARC_TIME * 0.5)).toFixed(3);   // 후반 절반 동안 페이드
    }
  }

  return { layer, setHp, hit, setDead, update };
}
