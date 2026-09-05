// 피해 숫자 — 조준원 바로 오른쪽 위 스택 (사용자 지시 2026-09-06: 'HUD 우상단'이 아니라 조준원과 겹치지 않는 선에서 살짝 오른쪽 위).
// 원 반지름만큼 띄운다(setAnchor). 최신 숫자가 원에 가까운 아래쪽, 0.7초 동안 위로 떠오르며 사라진다. 몸통 흰색, 머리 노란색 + 큰 글씨.
// 인터페이스는 이전과 같다: add(point, damage, part) — point는 쓰지 않는다. update(dt).
const LIFE = 0.7;
const RISE = 20;   // px

export function createDamageNumbers(poolSize = 20) {
  const root = document.createElement('div');
  root.id = 'damageNumbers';
  root.style.cssText = [
    'position:fixed', 'left:calc(50% + 24px)', 'bottom:calc(50% + 16px)', 'z-index:6', 'pointer-events:none',
    'display:flex', 'flex-direction:column-reverse', 'align-items:flex-start', 'gap:2px',
  ].join(';');
  document.body.appendChild(root);

  const items = [];
  for (let i = 0; i < poolSize; i++) {
    const el = document.createElement('div');
    el.style.cssText = [
      'font:700 18px/1 system-ui, sans-serif', 'color:#fff', 'text-shadow:0 0 3px #000, 0 0 6px #000',
      'display:none', 'white-space:nowrap', 'font-variant-numeric:tabular-nums',
    ].join(';');
    root.appendChild(el);
    items.push({ el, t: 0, active: false });
  }
  let next = 0;
  let anchorR = -1;
  // 조준원 반지름(px)에 맞춰 원 밖으로 띄운다. 매 프레임 불러도 값이 같으면 아무것도 안 한다
  function setAnchor(r) {
    const v = Math.round(r);
    if (v === anchorR) return;
    anchorR = v;
    root.style.left = `calc(50% + ${v + 14}px)`;
    root.style.bottom = `calc(50% + ${v + 8}px)`;
  }

  function add(_point, damage, part) {
    const it = items[next];
    next = (next + 1) % items.length;
    it.t = 0;
    it.active = true;
    const head = part === 'head';
    it.el.textContent = String(Math.round(damage));
    it.el.style.color = head ? '#ffd24a' : '#fff';
    it.el.style.fontSize = head ? '24px' : '18px';
    it.el.style.transform = 'translateY(0)';
    it.el.style.opacity = '1';
    it.el.style.display = 'block';
    root.prepend(it.el);   // 최신이 위
  }

  function update(dt) {
    for (const it of items) {
      if (!it.active) continue;
      it.t += dt;
      if (it.t >= LIFE) { it.active = false; it.el.style.display = 'none'; continue; }
      const k = it.t / LIFE;
      it.el.style.transform = `translateY(${(-RISE * k).toFixed(1)}px)`;
      it.el.style.opacity = String(1 - k);
    }
  }

  return { root, add, update, setAnchor, items, LIFE };
}
