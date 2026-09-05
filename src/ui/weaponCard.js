import { colorOf } from './weaponColors.js';

// 무기 전환 카드 (T26.3). 휠·숫자키로 무기가 바뀌면 하단 중앙에 1.5초 동안 뜬다.
// 요소는 하나뿐이고 내용만 갈아끼운다 → 빠르게 여러 번 바꿔도 마지막 무기 카드 하나만 남고 타이머가 1.5초로 다시 센다.
// 같은 무기 재선택은 loadout.select가 onChange를 부르지 않으므로 여기까지 오지 않는다.
const SHOW_TIME = 1.5;   // s
const FADE = 0.3;        // 마지막 0.3초 페이드

export function createWeaponCard() {
  const root = document.createElement('div');
  root.id = 'weaponCard';
  root.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:110px', 'transform:translateX(-50%)', 'z-index:7',
    'width:420px', 'max-width:90vw', 'padding:10px 14px', 'box-sizing:border-box',
    'background:rgba(0,0,0,0.65)', 'color:#eee', 'border-radius:8px', 'user-select:none', 'pointer-events:none',
    'font:13px/1.4 system-ui, sans-serif', 'opacity:0',
  ].join(';');
  const icon = document.createElement('span');
  icon.style.cssText = 'display:inline-block;width:18px;height:18px;margin-right:8px;border-radius:3px;vertical-align:-3px';
  const name = document.createElement('div');
  name.style.cssText = 'font-size:17px;font-weight:800';
  const nameText = document.createTextNode('');
  name.append(icon, nameText);
  const stats = document.createElement('div');
  stats.style.cssText = 'margin-top:2px;opacity:0.9;font-variant-numeric:tabular-nums';
  const desc = document.createElement('div');
  desc.style.cssText = 'margin-top:4px;opacity:0.85';
  root.append(name, stats, desc);
  document.body.appendChild(root);

  const state = { remain: 0, weaponId: null };

  function show(w) {
    icon.style.background = colorOf(w);
    nameText.textContent = w.name;
    stats.textContent = `탄창 ${w.mag} · 발당 ${w.damage} · ${w.rpm} RPM`;
    desc.textContent = w.desc || w.tag || '';
    state.remain = SHOW_TIME;
    state.weaponId = w.id;
    root.style.opacity = '1';
  }

  function update(dt) {
    if (state.remain <= 0) return;
    state.remain = Math.max(0, state.remain - dt);
    root.style.opacity = state.remain <= 0 ? '0' : Math.min(1, state.remain / FADE).toFixed(2);
  }

  function hide() { state.remain = 0; root.style.opacity = '0'; }

  return { root, state, show, update, hide };
}
