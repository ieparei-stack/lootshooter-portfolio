import * as THREE from 'three';
import { config } from '../config.js';
import { on } from '../core/events.js';
import { colorOf } from '../ui/weaponColors.js';

// 총기 뷰모델 (T30, 단순 그레이박스). 화면 오른쪽 아래에 박스 2~3개짜리 총을 띄운다.
//   - 별도 씬 + 고정 FOV 카메라로 본 씬 위에 덧그린다 (main.js: 본 씬 렌더 → clearDepth → 이 씬 렌더).
//     본 카메라는 정조준 때 FOV가 바뀌므로 자식으로 두면 총이 같이 확대된다. 고정 카메라면 크기가 일정하고 벽도 안 뚫린다.
//   - 움직임: 발사 반동(fire 이벤트의 recoil v/h에 비례, 지수 감쇠 복귀) / 정조준(ads.state.ease로 hip↔ads 위치 보간)
//     / 재장전(shooter.state.reloadProgress를 매 프레임 읽어 sin 곡선으로 내려갔다 올라옴 — 취소돼도 null이 되어 자동 복귀)
//     / 무기 전환(weaponSwitch 이벤트 → 자체 타이머, 앞 절반 내려감 → 메쉬 교체 → 뒤 절반 올라옴. 순수 연출, 사격을 막지 않음)
//   - 모양은 weapon.id로 분기, 색은 탄착 색(weaponColors). 모르는 id는 cs 모양 + 기본 색.
//   - 켜기/끄기는 localStorage viewModel.v1. 카운터(kicks/swaps)는 검증용 — 이벤트 → 반응 호출만 확인한다.
export const VIEWMODEL_KEY = 'viewModel.v1';

const DEG = Math.PI / 180;

// 돌격소총 실루엣 (사용자 지시 2026-09-06: 박스 2~3개 → AR 형태). 부품: [w, h, d, x, y, z, rotXdeg, tone]  (m, °)
//   총은 -z 방향(앞)을 향한다. 원점 = 몸통(리시버) 뒤쪽 위. tone 'dark'는 무기 색을 어둡게 (총열·탄창·손잡이 — 실루엣이 읽히게).
//   무기별 차이: CS형 = 길고 가는 총열 + 휜 탄창 + 고정 개머리판 / PUBG형 = 굵은 몸통 + 짧은 총열 + 캐링핸들 + 긴 개머리판
//              루트슈터형(옛 데스티니형, T36 개명) = 납작·넓은 몸통 + 총구 제동기 + 위 조준경 + 뼈대 개머리판
function arParts({ recv, hgLen, barrelLen, magTilt, magLen, stock, top, brake }) {
  const [rw, rh, rd] = recv;
  const P = [];
  P.push([rw, rh, rd, 0, 0, -rd / 2, 0, 'main']);                                   // 리시버
  P.push([rw * 0.85, rh * 0.7, hgLen, 0, 0.005, -rd - hgLen / 2, 0, 'main']);       // 핸드가드
  P.push([0.018, 0.018, barrelLen, 0, 0.012, -rd - hgLen - barrelLen / 2, 0, 'dark']);   // 총열
  P.push([0.012, 0.028, 0.012, 0, rh / 2 + 0.008, -rd - hgLen + 0.02, 0, 'dark']);  // 가늠쇠
  P.push([0.03, magLen, 0.05, 0, -rh / 2 - magLen / 2 + 0.01, -rd * 0.62, magTilt, 'dark']);   // 탄창
  P.push([0.03, 0.08, 0.035, 0, -rh / 2 - 0.035, -rd * 0.18, -18, 'dark']);         // 손잡이
  if (stock === 'fixed') { P.push([rw * 0.7, rh * 0.75, 0.17, 0, -0.005, 0.085, 0, 'main']); P.push([rw * 0.8, rh * 1.1, 0.02, 0, -0.01, 0.18, 0, 'dark']); }
  if (stock === 'long')  { P.push([rw * 0.6, rh * 0.6, 0.20, 0, 0, 0.10, 0, 'main']); P.push([rw * 0.8, rh * 1.2, 0.02, 0, -0.01, 0.21, 0, 'dark']); }
  if (stock === 'frame') { P.push([0.02, 0.02, 0.18, 0, rh / 2 - 0.01, 0.09, 0, 'dark']); P.push([0.03, rh * 1.1, 0.02, 0, -0.01, 0.18, 0, 'main']); }
  if (top === 'rear')    P.push([0.03, 0.02, 0.02, 0, rh / 2 + 0.01, -0.02, 0, 'dark']);                       // 가늠자
  if (top === 'handle')  P.push([0.025, 0.035, 0.12, 0, rh / 2 + 0.017, -rd * 0.45, 0, 'main']);              // 캐링핸들
  if (top === 'optic')   { P.push([0.05, 0.01, 0.16, 0, rh / 2 + 0.005, -rd * 0.5, 0, 'dark']); P.push([0.032, 0.036, 0.09, 0, rh / 2 + 0.028, -rd * 0.45, 0, 'dark']); }   // 레일 + 조준경
  if (brake) P.push([0.03, 0.03, 0.05, 0, 0.012, -rd - hgLen - barrelLen - 0.02, 0, 'dark']);                 // 총구 제동기
  return P;
}
const SHAPES = {
  cs:   arParts({ recv: [0.05, 0.07, 0.24], hgLen: 0.15, barrelLen: 0.20, magTilt: 18, magLen: 0.14, stock: 'fixed', top: 'rear' }),
  pubg: arParts({ recv: [0.065, 0.085, 0.26], hgLen: 0.14, barrelLen: 0.10, magTilt: 6, magLen: 0.12, stock: 'long', top: 'handle' }),
  d2:   arParts({ recv: [0.075, 0.055, 0.26], hgLen: 0.16, barrelLen: 0.08, magTilt: 0, magLen: 0.10, stock: 'frame', top: 'optic', brake: true }),
};

function readStore() {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(VIEWMODEL_KEY) || '{}') || {}; } catch { return {}; }
}

export function createViewModel(renderer, { getKit }) {
  const V = config.viewModel;
  const state = {
    enabled: true,
    kicks: 0, swaps: 0,          // 검증용 카운터
    swapT: -1,                   // 전환 연출 경과 (s). -1 = 진행 중 아님
    swapped: false,              // 이번 전환에서 메쉬를 이미 교체했는가
    kick: { z: 0, pitch: 0, yaw: 0 },
    weaponId: null,
  };
  const stored = readStore();
  if (typeof stored.enabled === 'boolean') state.enabled = stored.enabled;
  function save() { try { localStorage.setItem(VIEWMODEL_KEY, JSON.stringify({ enabled: state.enabled })); } catch { /* 저장 불가 */ } }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(V.fov, 1, 0.01, 10);
  const light = new THREE.HemisphereLight(0xffffff, 0x555555, 1.6);
  light.position.set(0.5, 1, 0.5);
  scene.add(light);
  const group = new THREE.Group();   // 총 메쉬의 부모. 위치·회전은 update가 매 프레임 확정
  group.scale.setScalar(V.scale);
  scene.add(group);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if (typeof window !== 'undefined') { window.addEventListener('resize', resize); resize(); }   // Node 테스트에서는 window 없음

  // 총 만들기 — 이전 메쉬는 지운다
  function build(weapon) {
    for (const m of [...group.children]) { group.remove(m); m.geometry.dispose(); m.material.dispose(); }
    const shape = SHAPES[weapon && weapon.id] || SHAPES.cs;
    const base = new THREE.Color(colorOf(weapon));
    const mats = { main: new THREE.MeshLambertMaterial({ color: base }), dark: new THREE.MeshLambertMaterial({ color: base.clone().multiplyScalar(0.45) }) };
    for (const [w, h, d, x, y, z, rx, tone] of shape) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[tone] || mats.main);
      mesh.position.set(x, y, z);
      mesh.rotation.x = (rx || 0) * DEG;
      group.add(mesh);
    }
    state.weaponId = weapon ? weapon.id : null;
  }

  // 발사: 반동 각도(°)에 비례해 뒤로 밀리고 총구가 들린다. T38 조준 보정: 정조준 중 perks.adsKickMul (ease에 비례)
  function kick(recoil) {
    const kit = getKit();
    const e = kit ? kit.ads.state.ease : 0;
    const km = kit && kit.weapon.perks ? kit.weapon.perks.adsKickMul : 1;
    const scale = 1 + (km - 1) * e;
    const v = (recoil ? Math.abs(recoil.v || 0) : 0.3) * scale, h = (recoil ? (recoil.h || 0) : 0) * scale;
    state.kick.z += v * V.kickBack;
    state.kick.pitch += v * V.kickPitch;
    state.kick.yaw += h * V.kickYaw;
    state.kicks++;
  }
  function startSwap() { state.swapT = 0; state.swapped = false; state.swaps++; }

  on('fire', (d) => kick(d && d.recoil));
  on('weaponSwitch', startSwap);

  function update(dt) {
    const kit = getKit();
    if (!kit) return;
    // 전환 연출: 아직 메쉬가 없거나(첫 장착) 연출 중간이면 교체
    if (state.weaponId === null && state.swapT < 0) build(kit.weapon);
    let swapDip = 0;
    if (state.swapT >= 0) {
      state.swapT += dt;
      const t = Math.min(1, state.swapT / V.swapTime);
      if (t >= 0.5 && !state.swapped) { build(kit.weapon); state.swapped = true; }
      swapDip = Math.sin(t * Math.PI) * V.dipDepth;
      if (t >= 1) { state.swapT = -1; if (state.weaponId !== kit.weapon.id) build(kit.weapon); }
    } else if (state.weaponId !== kit.weapon.id) {
      build(kit.weapon);   // 이벤트 없이 무기가 바뀐 경우(안전망)
    }
    // 정조준 보간
    const e = kit.ads.state.ease;
    const px = V.hip.x + (V.ads.x - V.hip.x) * e;
    const py = V.hip.y + (V.ads.y - V.hip.y) * e;
    const pz = V.hip.z + (V.ads.z - V.hip.z) * e;
    // 재장전: 0~1 진행도 → 내려갔다 올라옴. 취소되면 null → 0
    const rp = kit.shooter.state.reloadProgress;
    const reloadDip = rp === null || rp === undefined ? 0 : Math.sin(rp * Math.PI) * V.dipDepth;
    // 반동 복귀 (지수 감쇠)
    const k = Math.exp(-V.kickReturn * dt);
    state.kick.z *= k; state.kick.pitch *= k; state.kick.yaw *= k;

    group.position.set(px + state.kick.yaw * 0.004, py - reloadDip - swapDip, pz + state.kick.z);
    group.rotation.set(state.kick.pitch * DEG + reloadDip * 0.6 + swapDip * 0.6, (V.hipYaw * (1 - e) - state.kick.yaw) * DEG, 0);
  }

  function render() {
    if (!state.enabled) return;
    renderer.clearDepth();
    renderer.render(scene, camera);
  }
  function setEnabled(v) { state.enabled = !!v; save(); }

  return { state, group, scene, camera, update, render, setEnabled, build };
}
