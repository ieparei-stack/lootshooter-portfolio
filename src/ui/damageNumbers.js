// 피해 숫자 — 화면 우측 위 고정 스택 (T17.5: 맞은 자리에 띄우면 에임을 가려서 옮김. 사용자 결정).
// 최신 숫자가 맨 위. 0.7초 동안 위로 떠오르며 사라진다. 몸통 흰색, 머리 노란색 + 큰 글씨.
// 인터페이스는 이전과 같다: add(point, damage, part) — point는 쓰지 않는다. update(dt).
const LIFE = 0.7;
const RISE = 20;   // px

export function createDamageNumbers(poolSize = 20) {
  const root = document.createElement('div');
  root.id = 'damageNumbers';
  root.style.cssText = [
    'position:fixed', 'top:44px', 'right:24px', 'z-index:6', 'pointer-events:none',   // T26.1: 경고 배지(우상단 22px) 아래
    'display:flex', 'flex-direction:column', 'align-items:flex-end', 'gap:2px',
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

  return { root, add, update, items, LIFE };
}
