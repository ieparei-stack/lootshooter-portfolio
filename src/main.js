import * as THREE from 'three';
import { config } from './config.js';
import { createRenderer } from './core/renderer.js';
import { startLoop } from './core/loop.js';
import { createMouseLook, createKeyboard, createMouseButtons } from './core/input.js';
import { buildTestRoom, PLAYER_START } from './stage/testRoom.js';
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
import { loadWeapons } from './weapon/weaponData.js';
import { createRecoil } from './weapon/recoil.js';
import { createSpread } from './weapon/spread.js';
import { createAds } from './weapon/ads.js';
import { createImpactMarks } from './weapon/impactMarks.js';
import { createTracers, muzzlePosition } from './weapon/tracers.js';
import { createShooter } from './weapon/shooter.js';
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

// 테스트 공간 + 표적 + 1인칭 카메라 + 입력 + 이동 + 조절 패널
const blocks = buildTestRoom(scene);
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
const weaponInfo = createWeaponInfo();
const weapon = weapons[0];          // 시작 무기 = 라인업 1번 (CS형). 전환은 T16
weaponInfo.set(weapon);
weaponInfo.setLineup(weapons, 0);

// 정조준 + FOV 보간 + 반동 + 퍼짐 + 탄자국 + 명중 피드백 + 발사·탄약·재장전·판정 + 조준선(원)
const ads = createAds(weapon, mouseButtons);
const view = createView(camera, ads);
const recoil = createRecoil(weapon);
const spread = createSpread(weapon);
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

const shooter = createShooter(weapon, recoil, spread, ads, mouseButtons, keyboard,
  { player, movement, blocks, marks, targets, onFire });
const crosshair = createCrosshair();

// 개발 서버에서만: 콘솔 검증용 (빌드에는 포함되지 않음)
if (import.meta.env.DEV) {
  window.__debug = { player, movement, view, config, weapons, warnings, showWarnings, recoil, spread, ads, marks, shooter, targets, tracers, damageNumbers, hitmarker };
}

startLoop((dt) => {
  const now = performance.now();
  movement.update(dt);
  ads.update(dt);                 // 이 프레임의 배율이 발사에 쓰이도록 shooter보다 먼저
  shooter.update(now, dt);
  targets.update(dt, camera);
  tracers.update(dt);
  player.state.offYaw = recoil.state.offYaw;
  player.state.offPitch = recoil.state.offPitch;
  player.apply();
  view.update();
  damageNumbers.update(dt, camera);
  crosshair.set(shooter.state.currentSpread, view.state.fov);
  weaponInfo.setAmmo(shooter.state.mag, weapon.mag, shooter.state.reloadProgress);
  renderer.render(scene, camera);
});
