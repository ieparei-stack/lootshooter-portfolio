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
import { createPatternOverlay } from './ui/patternOverlay.js';
import { loadWeapons } from './weapon/weaponData.js';
import { createRecoil } from './weapon/recoil.js';
import { createSpread } from './weapon/spread.js';
import { createAds } from './weapon/ads.js';
import { createImpactMarks } from './weapon/impactMarks.js';
import { createTracers, muzzlePosition } from './weapon/tracers.js';
import { createShooter } from './weapon/shooter.js';
import { createLoadout } from './weapon/loadout.js';
import { createMonsters } from './monster/monsters.js';
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
const settingsPanel = createSettingsPanel();

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

// 몬스터 2종 (T22). T22에서는 사격장 끝에 1마리씩 세워 두고 M으로 리셋한다 — 스폰/웨이브는 T23, 플레이어 HP는 T24.
// 받은 공격은 횟수만 센다 (HP·피격 표시는 T24).
const MONSTER_TEST_SPAWNS = [{ kind: 'melee', x: -4, z: -38 }, { kind: 'ranged', x: 4, z: -45 }];
const hitsTaken = { count: 0, text: null };
const monsters = createMonsters(scene, {
  blocks, player, tracers,
  onPlayerHit: (damage, kind) => {
    hitsTaken.count++;
    if (hitsTaken.text) hitsTaken.text.textContent = `받은 공격: ${hitsTaken.count}회 (마지막 −${damage} ${kind === 'melee' ? '근접' : '원거리'})`;
  },
});
monsters.reset(MONSTER_TEST_SPAWNS);

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
    { player, movement, blocks, marks, hittables: [targets, monsters], onFire });
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
const patternOverlay = createPatternOverlay(camera, player);   // T19 이론 반동 궤적

// 키 1~4 직접 전환, 휠 순환 전환, R 재장전(현재 무기)
['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((code, i) => keyboard.onPress(code, () => loadout.select(i)));
createMouseWheel(mouseLook, (step) => (step > 0 ? loadout.next() : loadout.prev()));
keyboard.onPress('KeyR', () => { const k = loadout.current(); k.shooter.startReload(k.shooter.state.now); });
// T18: 탄착군 지우기 — 잠금 중 X, 해제 중엔 왼쪽 위 패널 버튼
keyboard.onPress('KeyX', () => marks.clear());
settingsPanel.addButton('탄착군 지우기 (X)', () => marks.clear());
// T19: 이론 궤적 켜기/끄기 — 잠금 중 P, 해제 중엔 패널 버튼 (사용자 지시 2026-09-04, SPEC '항상 켜짐' 변경)
const overlayLabel = () => `이론 궤적: ${patternOverlay.state.enabled ? '켜짐' : '꺼짐'} (P)`;
const overlayBtn = settingsPanel.addButton(overlayLabel(), () => { patternOverlay.toggle(); overlayBtn.textContent = overlayLabel(); });
keyboard.onPress('KeyP', () => { patternOverlay.toggle(); overlayBtn.textContent = overlayLabel(); });

// T22: 몬스터 레버 (접이식 그룹) + 리셋. 설정 패널이 길어지면 튜닝 패널을 그 아래로 내린다
const layoutPanels = () => { tuningPanel.root.style.top = (settingsPanel.root.getBoundingClientRect().bottom + 12) + 'px'; };
const M = config.monster;
const mg = settingsPanel.addGroup('몬스터 (T22)', { onToggle: layoutPanels });
mg.addSlider({ label: '근접형 HP (리셋 후 적용)', min: 500, max: 6000, step: 100, get: () => M.melee.hp, set: (v) => { M.melee.hp = v; } });
mg.addSlider({ label: '원거리형 HP (리셋 후 적용)', min: 500, max: 6000, step: 100, get: () => M.ranged.hp, set: (v) => { M.ranged.hp = v; } });
mg.addSlider({ label: '근접형 속도 (m/s)', min: 2, max: 10, step: 0.5, get: () => M.melee.speed, set: (v) => { M.melee.speed = v; }, format: (v) => v.toFixed(1) });
mg.addSlider({ label: '원거리형 속도 (m/s)', min: 2, max: 8, step: 0.5, get: () => M.ranged.speed, set: (v) => { M.ranged.speed = v; }, format: (v) => v.toFixed(1) });
mg.addSlider({ label: '조준선 딜레이 (s)', min: 0.2, max: 2.0, step: 0.1, get: () => M.ranged.aimDelay, set: (v) => { M.ranged.aimDelay = v; }, format: (v) => v.toFixed(1) });
mg.addSlider({ label: '근접형 피해', min: 5, max: 50, step: 5, get: () => M.melee.damage, set: (v) => { M.melee.damage = v; } });
mg.addSlider({ label: '원거리형 피해', min: 5, max: 50, step: 5, get: () => M.ranged.damage, set: (v) => { M.ranged.damage = v; } });
hitsTaken.text = mg.addText('받은 공격: 0회');
const resetMonsters = () => { monsters.reset(MONSTER_TEST_SPAWNS); hitsTaken.count = 0; hitsTaken.text.textContent = '받은 공격: 0회'; };
settingsPanel.addButton('몬스터 리셋 (M)', resetMonsters);
keyboard.onPress('KeyM', resetMonsters);
layoutPanels();
window.addEventListener('resize', layoutPanels);

// 개발 서버에서만: 콘솔 검증용 (빌드에는 포함되지 않음)
if (import.meta.env.DEV) {
  window.__debug = { player, movement, view, config, weapons, warnings, showWarnings, loadout, tuning, tuningPanel, patternOverlay, marks, targets, monsters, tracers, damageNumbers, hitmarker };
}

startLoop((dt) => {
  const now = performance.now();
  const kit = loadout.current();
  const { weapon, ads, recoil, spread, shooter } = kit;
  patternOverlay.beforeShoot(recoil);   // 첫 발 직전 조준 방향을 궤적 원점으로 (shooter.update보다 먼저)
  movement.update(dt);
  ads.update(dt);                 // 이 프레임의 배율이 발사에 쓰이도록 shooter보다 먼저
  shooter.update(now, dt);
  targets.update(dt, camera);
  monsters.update(dt, camera);
  tracers.update(dt);
  player.state.offYaw = recoil.state.offYaw;
  player.state.offPitch = recoil.state.offPitch;
  player.apply();
  view.update();
  damageNumbers.update(dt);
  crosshair.set(shooter.state.currentSpread, view.state.fov);
  weaponInfo.setAmmo(shooter.state.mag, weapon.mag, shooter.state.reloadProgress);
  patternOverlay.draw(kit);
  renderer.render(scene, camera);
});
