// 현재 무기 표시 (오른쪽 아래). T07: 이름과 주요 수치. T12에서 탄약 카운터가 붙는다.
export function createWeaponInfo() {
  const root = document.createElement('div');
  root.id = 'weaponInfo';
  root.style.cssText = [
    'position:fixed', 'right:12px', 'bottom:12px', 'z-index:10', 'min-width:240px',
    'padding:10px 12px', 'background:rgba(0,0,0,0.55)', 'color:#eee',
    'font:13px/1.5 system-ui, sans-serif', 'border-radius:6px', 'user-select:none',
  ].join(';');
  document.body.appendChild(root);

  const name = document.createElement('div');
  name.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:4px';
  const stats = document.createElement('div');
  stats.style.cssText = 'opacity:0.85;white-space:pre';
  root.appendChild(name);
  root.appendChild(stats);

  function set(w) {
    name.textContent = `${w.name}  ·  ${w.tag}`;
    const p = w.pattern;
    const patternLine = p.mode === 'array'
      ? `패턴 고정 배열 ${p.arr.length}발`
      : `패턴 v0 ${p.v0}° · vG ${p.vG} · vMax ${p.vMax}° · h ${p.hMode} ${p.hMax}°`;
    stats.textContent = [
      `${w.rpm} RPM · 탄창 ${w.mag} · 재장전 ${w.reloadTime}s`,
      `피해 ${w.damage} · 헤드 ×${w.headshotMul} · 감쇠 ${w.falloff.start}~${w.falloff.end}m → ${Math.round(w.falloff.minRatio * 100)}%`,
      patternLine,
      `무작위 V ${w.randV} / H ${w.randH} · cap ${w.cap.on ? w.cap.deg + '°' : 'off'}`,
      `복귀 ${w.recovery.delay}ms / ${w.recovery.speed}°/s`,
      `퍼짐 base ${w.spread.base}° · bloom ${w.spread.bloom} · max ${w.spread.max}° · decay ${w.spread.decay} · 이동 ×${w.moveSpreadMul}`,
      `ADS ${w.ads.allowed ? `반동 ×${w.ads.recoil} · 퍼짐 ×${w.ads.spread} · ${w.ads.time}ms` : '불가'}`,
    ].join('\n');
  }

  return { root, set };
}
