import * as THREE from 'three';
import { patternIndex } from '../weapon/recoil.js';
import { directionFromAngles } from '../weapon/raycast.js';

// 이론 패턴 오버레이 (T19). 현재 무기의 반동 궤적(무작위 없음)을 화면 위 2D 캔버스에 겹쳐 그린다.
// 기준: docs/총기 시뮬레이터.html showPat — compiled를 탄창 발 수만큼 누적해 점을 찍고,
//   hMode 'random'이면 점 좌우로 ±|h| 막대. 여기에 cap 클램프(결정 룰)를 더해 실제 탄착과 맞춘다.
//
// 원점(궤적의 시작)은 "월드 고정":
//   패턴 인덱스가 0(쉬는 중)이면 매 프레임 실제 조준 방향(yaw−offYaw, pitch+offPitch — recoil.state, 탄도 기준. T35 viewTracking과 무관하게 탄이 가는 자리)을 따라가고,
//   첫 발이 나가면 그 직전 방향을 잠근다 → 반동으로 화면이 올라가도 궤적은 벽 위에 남아 T18 자국과 비교된다.
//   사격 정지 500ms 후 recoil이 인덱스를 0으로 되돌리면 다시 조준선을 따라간다.
//   beforeShoot()를 루프 맨 앞(shooter.update 전)에서 불러야 첫 발 직전 방향이 정확히 잡힌다.
// 점 i(1부터) = i발째 탄이 이론상 맞는 자리(그 발까지의 누적 반동). 현재 탄 = recoil.state.shotIdx.

// 순수 계산 (Node 테스트 대상). 반환: [{ cumH, cumV, halfH }] — °, cumH > 0 = 오른쪽, cumV > 0 = 위
export function theoryPoints(compiled, mag, cap, recoilMul = 1) {
  const n = compiled.length;
  const out = [];
  let cumH = 0, cumV = 0;
  for (let i = 0; i < mag && n > 0; i++) {
    const p = compiled[Math.min(patternIndex(i, n), n - 1)];
    const random = p.hMode === 'random';
    cumH += (random ? 0 : p.h) * recoilMul;
    cumV += p.v * recoilMul;
    if (cap && cap.on && cumV > cap.deg) cumV = cap.deg;
    out.push({ cumH, cumV, halfH: random ? Math.abs(p.h) * recoilMul : 0 });
  }
  return out;
}

export function createPatternOverlay(camera, player) {
  const canvas = document.createElement('canvas');
  canvas.id = 'patternOverlay';
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:4';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const origin = { yaw: 0, pitch: 0 };   // 궤적 원점 (조준 방향, °)
  const state = { enabled: true, locked: false, points: [] };   // enabled: 사용자 토글 (P 키 / 패널 버튼)
  const v = new THREE.Vector3();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // 루프 맨 앞에서. 쉬는 중이면 원점을 실제 조준 방향으로, 연사 중이면 잠근 원점 유지
  function beforeShoot(recoil) {
    if (recoil.state.shotIdx === 0) {
      origin.yaw = player.state.yaw - recoil.state.offYaw;
      origin.pitch = player.state.pitch + recoil.state.offPitch;
      state.locked = false;
    } else {
      state.locked = true;
    }
  }

  // 조준 방향(°) → 화면 px. 카메라 뒤면 null
  function toScreen(yawDeg, pitchDeg) {
    const d = directionFromAngles(yawDeg, pitchDeg);
    v.set(camera.position.x + d.x, camera.position.y + d.y, camera.position.z + d.z).project(camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }

  // 매 프레임, player.apply()·view.update() 뒤, render 앞. kit = { weapon, recoil, ads }
  function draw(kit) {
    const w = window.innerWidth, h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    if (!state.enabled) return;
    const { weapon, recoil, ads } = kit;
    // 렌더 전에 그리므로 역행렬을 직접 갱신한다 (renderer.render가 하는 일). 안 하면 한 프레임 전 카메라로 투영돼 반동 중 어긋난다
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const pts = theoryPoints(recoil.compiled, weapon.mag, weapon.cap, ads.recoilMul());
    state.points = pts;

    const screen = pts.map((p) => toScreen(origin.yaw - p.cumH, origin.pitch + p.cumV));
    const o = toScreen(origin.yaw, origin.pitch);
    if (!o) return;

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 폴리라인 (검정 외곽 + 흰 선)
    for (const [width, style] of [[3, 'rgba(0,0,0,0.55)'], [1.2, 'rgba(255,255,255,0.9)']]) {
      ctx.lineWidth = width; ctx.strokeStyle = style;
      ctx.beginPath(); ctx.moveTo(o.x, o.y);
      for (const s of screen) if (s) ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    // random 모드 좌우 막대 (점 기준 ±halfH)
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    pts.forEach((p, i) => {
      if (!p.halfH || !screen[i]) return;
      const a = toScreen(origin.yaw - p.cumH + p.halfH, origin.pitch + p.cumV);
      const b = toScreen(origin.yaw - p.cumH - p.halfH, origin.pitch + p.cumV);
      if (!a || !b) return;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    // 점 + 5발마다 번호
    ctx.font = '700 11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    screen.forEach((s, i) => {
      if (!s) return;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      if ((i + 1) % 5 === 0) {
        const label = String(i + 1);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(label, s.x + 6, s.y);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(label, s.x + 6, s.y);
      }
    });
    // 현재 탄: 이번 연사에서 마지막으로 나간 발
    const cur = recoil.state.shotIdx;
    if (cur > 0 && cur <= screen.length && screen[cur - 1]) {
      const s = screen[cur - 1];
      ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.stroke();
      ctx.font = '700 14px system-ui, sans-serif';
      const label = `${cur}발`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(label, s.x + 10, s.y);
      ctx.fillStyle = '#fff'; ctx.fillText(label, s.x + 10, s.y);
    }
  }

  function setEnabled(on) { state.enabled = !!on; }
  function toggle() { state.enabled = !state.enabled; return state.enabled; }

  return { canvas, origin, state, beforeShoot, draw, toScreen, setEnabled, toggle };
}
