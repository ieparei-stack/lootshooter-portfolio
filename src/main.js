import * as THREE from 'three';
import { config } from './config.js';
import { createRenderer } from './core/renderer.js';
import { startLoop } from './core/loop.js';
import { createMouseLook, createKeyboard, createMouseButtons, createMouseWheel } from './core/input.js';
import { buildRange, PLAYER_START } from './stage/range.js';
import { createTargets } from './stage/targets.js';
import { createPlayerCamera } from './player/camera.js';
import { createMovement } from './player/movement.js';
import { createView } from './player/view.js';
import { createSettingsPanel } from './ui/settingsPanel.js';
import { showWarnings } from './ui/warnings.js';
import { createWeaponInfo } from './ui/weaponInfo.js';
import { createCrosshair } from './ui/crosshair.js';
import { createHitmarker } from './ui/hitmarker.js';
import { createDamageNumbers } from './ui/damageNumbers.js';
import { createTuningPanel, restoreTuning } from './ui/tuningPanel.js';
import { loadWeapons } from './weapon/weaponData.js';
import { createRecoil } from './weapon/recoil.js';
import { createSpread } from './weapon/spread.js';
import { createAds } from './weapon/ads.js';
import { createImpactMarks } from './weapon/impactMarks.js';
import { createTracers, muzzlePosition } from './weapon/tracers.js';
import { createShooter } from './weapon/shooter.js';
import { createLoadout } from './weapon/loadout.js';
import weaponsJson from '../data/weapons.json';

const canvas = document.getElementById('app');
const { renderer, scene, camera } = createRenderer(canvas);

// 조명 — 반구광(전체 밝기) + 방향광(박스 면 구분). 그림자 없음.
scene.add(new THREE.HemisphereLight(0xffffff, 0x8c8c8c, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(6, 12, 20);   // 플레이어 뒤쪽 위에서 앞벽을 비춘다
scene.add(sun);

// 회색 바닥
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(config.ground.size, config.ground.size),
  new THREE.MeshLambertMaterial({ color: config.ground.color }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// 사격장 + 표적 + 1인칭 카메라 + 입력 + 이동 + 조절 패널
const blocks = buildRange(scene);
const targets = createTargets(scene);
const player = createPlayerCamera(camera, PLAYER_START);
const mouseLook = createMouseLook(canvas, (dx, dy) => player.rotate(dx, dy));
const keyboard = createKeyboard(mouseLook);
const mouseButtons = createMouseButtons(mouseLook);
const movement = createMovement(player, keyboard, blocks);
createSettingsPanel();

// 무기 데이터 — 값 오류는 화면 경고 + 기본값으로 진행
const { weapons, warnings } = loadWeapons(weaponsJson);
showWarnings(warnings);
// 튜닝 패널(T17.5): 파일 값을 보관하고, 저장된 튜닝이 있으면 kit을 만들기 전에 weapon에 덮어쓴다
const tuning = restoreTuning(weapons);
const weaponInfo = createWeaponInfo();

// 탄자국 + 명중 피드백 + 조준선(원) — 무기와 무관한 공용 요소
const marks = createImpactMarks(scene);
const tracers = createTracers(scene);
const hitmarker = createHitmarker();
const damageNumbers = createDamageNumbers();

function onFire({ origin, dir, yaw, pitch, hit }) {
  tracers.add(muzzlePosition(origin, yaw, pitch), hit ? hit.point : null, dir);
  if (hit && (hit.part === 'body' || hit.part === 'head') && hit.result && hit.result.damage > 0) {
    hitmarker.show(hit.part);
    damageNumbers.add(hit.point, hit.result.damage, hit.part);
  }
}

// 무기마다 정조준·반동·퍼짐·발사 한 벌(kit). 전환(T16)은 loadout이 맡는다 — 시작 무기 = 라인업 1번 (CS형)
function makeKit(weapon) {
  const ads = createAds(weapon, mouseButtons);
  const recoil = createRecoil(weapon);
  const spread = createSpread(weapon);
  const shooter = createShooter(weapon, recoil, spread, ads, mouseButtons,
    { player, movement, blocks, marks, targets, onFire });
  return { weapon, ads, recoil, spread, shooter };
}
const tuningPanel = createTuningPanel({
  weapons, origs: tuning.origs, arrMuls: tuning.arrMuls,
  onChange: (w) => { weaponInfo.set(w); weaponInfo.setLineup(weapons, loadout.state.index); },
});
const loadout = createLoadout(weapons, makeKit, (kit, i) => {
  weaponInfo.set(kit.weapon);
  weaponInfo.setLineup(weapons, i);
  tuningPanel.show(kit, i);
});
const view = createView(camera, () => loadout.current().ads);
const crosshair = createCrosshair();

// 키 1~4 직접 전환, 휠 순환 전환, R 재장전(현재 무기)
['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((code, i) => keyboard.onPress(code, () => loadout.select(i)));
createMouseWheel(mouseLook, (step) => (step > 0 ? loadout.next() : loadout.prev()));
keyboard.onPress('KeyR', () => { const k = loadout.current(); k.shooter.startReload(k.shooter.state.now); });

// 개발 서버에서만: 콘솔 검증용 (빌드에는 포함되지 않음)
if (import.meta.env.DEV) {
  window.__debug = { player, movement, view, config, weapons, warnings, showWarnings, loadout, tuning, tuningPanel, marks, targets, tracers, damageNumbers, hitmarker };
}

startLoop((dt) => {
  const now = performance.now();
  const { weapon, ads, recoil, spread, shooter } = loadout.current();
  movement.update(dt);
  ads.update(dt);                 // 이 프레임의 배율이 발사에 쓰이도록 shooter보다 먼저
  shooter.update(now, dt);
  targets.update(dt, camera);
  tracers.update(dt);
  player.state.offYaw = recoil.state.offYaw;
  player.state.offPitch = recoil.state.offPitch;
  player.apply();
  view.update();
  damageNumbers.update(dt);
  crosshair.set(shooter.state.currentSpread, view.state.fov);
  weaponInfo.setAmmo(shooter.state.mag, weapon.mag, shooter.state.reloadProgress);
  renderer.render(scene, camera);
});
