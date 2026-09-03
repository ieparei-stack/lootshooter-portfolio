import * as THREE from 'three';

// 데미지 숫자 — 맞은 지점에서 0.7초 동안 위로 떠오르며 사라진다. 몸통 흰색, 머리 노란색 + 큰 글씨.
const LIFE = 0.7;
const RISE = 0.6;   // m

export function createDamageNumbers(poolSize = 20) {
  const items = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < poolSize; i++) {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'transform:translate(-50%,-50%)',
      'font:700 18px system-ui, sans-serif', 'color:#fff', 'text-shadow:0 0 3px #000, 0 0 6px #000',
      'pointer-events:none', 'z-index:6', 'display:none', 'white-space:nowrap',
    ].join(';');
    document.body.appendChild(el);
    items.push({ el, pos: new THREE.Vector3(), t: 0, active: false });
  }
  let next = 0;

  function add(point, damage, part) {
    const it = items[next];
    next = (next + 1) % items.length;
    it.pos.set(point.x, point.y, point.z);
    it.t = 0;
    it.active = true;
    const head = part === 'head';
    it.el.textContent = String(Math.round(damage));
    it.el.style.color = head ? '#ffd24a' : '#fff';
    it.el.style.fontSize = head ? '24px' : '18px';
    it.el.style.display = 'block';
  }

  function update(dt, camera) {
    for (const it of items) {
      if (!it.active) continue;
      it.t += dt;
      if (it.t >= LIFE) { it.active = false; it.el.style.display = 'none'; continue; }
      const k = it.t / LIFE;
      tmp.copy(it.pos);
      tmp.y += RISE * k;
      tmp.project(camera);
      if (tmp.z > 1) { it.el.style.display = 'none'; continue; }   // 카메라 뒤
      it.el.style.display = 'block';
      it.el.style.left = ((tmp.x + 1) / 2 * window.innerWidth) + 'px';
      it.el.style.top = ((1 - tmp.y) / 2 * window.innerHeight) + 'px';
      it.el.style.opacity = String(1 - k);
    }
  }

  return { add, update, items, LIFE };
}
