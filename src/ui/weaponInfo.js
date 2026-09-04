import { colorOf } from './weaponColors.js';

// 현재 무기 표시 (오른쪽 아래). 탄약 카운터 + 재장전 진행 바 + 이름 + 주요 수치.
// 아래에 사격장 라인업(4정)의 이름과 핵심 수치를 항상 나열하고 현재 무기를 강조한다 (T15).
// 이름과 라인업 앞의 색 네모 = 그 무기의 탄착 자국 색 (T18).
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
  const lineup = document.createElement('div');
  lineup.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.2);white-space:pre;font-size:12px';
  root.appendChild(ammo);
  root.appendChild(bar);
  root.appendChild(name);
  root.appendChild(stats);
  root.appendChild(lineup);

  // 무기 색 스와치 (T18: 탄착 자국과 같은 색)
  function swatch(w) {
    const s = document.createElement('span');
    s.style.cssText = `display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:2px;background:${colorOf(w)}`;
    return s;
  }

  function set(w) {
    name.replaceChildren(swatch(w), document.createTextNode(`${w.name}  ·  ${w.tag}`));
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

  // 라인업 한 줄 요약: 이름 · RPM/탄창 · 패턴 종류 · 무작위 · 복귀 · 기본 퍼짐 · ADS
  function summary(w) {
    const p = w.pattern;
    const pat = p.mode === 'array' ? `고정배열 ${p.arr.length}발` : `curve v0 ${p.v0}° h ${p.hMode}`;
    const ads = w.ads.allowed ? `ADS ×${w.ads.spread} ${w.ads.time}ms` : 'ADS 불가';
    return `${w.rpm}rpm/${w.mag}발 · ${pat} · 무작위 ${w.randV}/${w.randH} · 복귀 ${w.recovery.delay}ms ${w.recovery.speed}°/s · 퍼짐 ${w.spread.base}° · ${ads}`;
  }

  // 라인업 전체 표시. current: 현재 무기 인덱스
  function setLineup(list, current) {
    lineup.replaceChildren();
    list.forEach((w, i) => {
      const row = document.createElement('div');
      row.style.cssText = i === current ? 'color:#fff;font-weight:700' : 'opacity:0.7';
      row.append(
        document.createTextNode(`${i === current ? '▶' : ' '} `),
        swatch(w),
        document.createTextNode(`${i + 1}. ${w.name} — ${summary(w)}`),
      );
      lineup.appendChild(row);
    });
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

  return { root, set, setAmmo, setLineup };
}
