// 현재 무기 표시 (오른쪽 아래). 탄약 카운터 + 재장전 진행 바 + 이름 + 주요 수치.
export function createWeaponInfo() {
  const root = document.createElement('div');
  root.id = 'weaponInfo';
  root.style.cssText = [
    'position:fixed', 'right:12px', 'bottom:12px', 'z-index:10', 'min-width:240px',
    'padding:10px 12px', 'background:rgba(0,0,0,0.55)', 'color:#eee',
    'font:13px/1.5 system-ui, sans-serif', 'border-radius:6px', 'user-select:none',
  ].join(';');
  document.body.appendChild(root);

  // 탄약 카운터 (T12)
  const ammo = document.createElement('div');
  ammo.style.cssText = 'font-size:30px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums';
  const bar = document.createElement('div');
  bar.style.cssText = 'height:4px;margin:4px 0 8px;background:rgba(255,255,255,0.15);border-radius:2px;overflow:hidden';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;width:0%;background:#7cc4ff';
  bar.appendChild(fill);

  const name = document.createElement('div');
  name.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:4px';
  const stats = document.createElement('div');
  stats.style.cssText = 'opacity:0.85;white-space:pre';
  root.appendChild(ammo);
  root.appendChild(bar);
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

  let lastText = '', lastW = -1;
  // mag: 현재 탄, magSize: 탄창, progress: 재장전 진행도 0~1 또는 null
  function setAmmo(mag, magSize, progress) {
    const text = progress === null ? `${mag} / ${magSize}` : `재장전…  ${mag} / ${magSize}`;
    if (text !== lastText) {
      lastText = text;
      ammo.textContent = text;
      ammo.style.color = mag === 0 ? '#ff6b6b' : '#eee';
    }
    const w = progress === null ? 0 : Math.round(progress * 100);
    if (w !== lastW) { lastW = w; fill.style.width = w + '%'; }
  }

  return { root, set, setAmmo };
}
