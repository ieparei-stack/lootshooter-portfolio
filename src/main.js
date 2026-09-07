import * as THREE from 'three';
import { config } from './config.js';
import { createRenderer } from './core/renderer.js';
import { startLoop } from './core/loop.js';
import { createMouseLook, createKeyboard, createMouseButtons, createMouseWheel } from './core/input.js';
import { buildRange, PLAYER_START, RANGE } from './stage/range.js';
import { createStage } from './stage/stage.js';
import { createTargets } from './stage/targets.js';
import { createPlayerCamera } from './player/camera.js';
import { createMovement } from './player/movement.js';
import { createView } from './player/view.js';
import { createSettingsPanel } from './ui/settingsPanel.js';
import { showWarnings } from './ui/warnings.js';
import { createWeaponInfo } from './ui/weaponInfo.js';
import { createCrosshair } from './ui/crosshair.js';
import { createHitmarker } from './ui/hitmarker.js';
import { createReloadRing } from './ui/reloadRing.js';
import { createDamageNumbers } from './ui/damageNumbers.js';
import { restoreTuning } from './ui/tuningPanel.js';
import { createWeaponPanel } from './ui/weaponPanel.js';
import { createPatternOverlay } from './ui/patternOverlay.js';
import { loadWeapons } from './weapon/weaponData.js';
import { createRecoil } from './weapon/recoil.js';
import { createSpread } from './weapon/spread.js';
import { createAds } from './weapon/ads.js';
import { createImpactMarks } from './weapon/impactMarks.js';
import { createTracers, muzzlePosition } from './weapon/tracers.js';
import { createShooter } from './weapon/shooter.js';
import { createAccuracy } from './weapon/accuracy.js';
import { createLoadout } from './weapon/loadout.js';
import { createMonsters } from './monster/monsters.js';
import { createHealth } from './player/health.js';
import { createPlayerHud } from './ui/playerHud.js';
import { createPrompt } from './ui/prompt.js';
import { createPauseMenu } from './ui/pauseMenu.js';
import { createWeaponCard } from './ui/weaponCard.js';
import { createSound } from './audio/sound.js';
import { createViewModel } from './weapon/viewModel.js';
import { createGrowth } from './growth/growth.js';
import { createGrowthPick } from './ui/growthPick.js';
import { createRunStats } from './stats/runStats.js';
import { createResultScreen } from './ui/resultScreen.js';
import { emit } from './core/events.js';
import weaponsJson from '../data/weapons.json';

const canvas = document.getElementById('app');
document.getElementById('dev-notice')?.remove();   // index.html 더블클릭용 안내 — 실행되면 지운다
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
const blocks = [...buildRange(scene)];   // 공용 충돌·레이캐스트 블록. 방 4개(T26)는 아래 createStage가 여기에 push 한다 (같은 배열 참조)
const targets = createTargets(scene);
const player = createPlayerCamera(camera, PLAYER_START);
const mouseLook = createMouseLook(canvas, (dx, dy) => player.rotate(dx, dy));
const keyboard = createKeyboard(mouseLook);
const mouseButtons = createMouseButtons(mouseLook);
const movement = createMovement(player, keyboard, blocks);
const settingsPanel = createSettingsPanel();
const sound = createSound();   // T29 합성 사운드 — 이벤트 버스를 듣는다. 첫 클릭/키에서 오디오가 켜진다

// 무기 데이터 — 값 오류는 화면 경고 + 기본값으로 진행
const { weapons, warnings } = loadWeapons(weaponsJson);
showWarnings(warnings);
// 튜닝 패널(T17.5): 파일 값을 보관하고, 저장된 튜닝이 있으면 kit을 만들기 전에 weapon에 덮어쓴다
const tuning = restoreTuning(weapons);
const weaponInfo = createWeaponInfo();
// T38 강화: weapons[i] = 튜닝 층, growth.effective[i] = 튜닝 × 강화 = 최종. kit은 effective를 잡는다 (아래 makeKit).
//   튜닝이 바뀌면 growth.refresh(i) → 반동 재컴파일 + 탄창 비율 유지 (onRefresh). 지원하지 않는 카드 필드는 경고 배지.
let loadout = null;   // 아래에서 만든다 (onRefresh가 kits를 참조)
const growth = createGrowth(weapons, tuning.origs, {
  onRefresh: (i, eff, prevMag) => {
    const kit = loadout ? loadout.kits[i] : null;
    if (!kit) return;
    kit.recoil.recompile();
    const s = kit.shooter.state;
    if (prevMag > 0 && eff.mag !== prevMag) s.mag = Math.min(eff.mag, Math.round(s.mag * eff.mag / prevMag));   // 탄창이 늘면 현재 탄도 비율 유지
    if (i === loadout.state.index) { weaponInfo.set(eff); weaponInfo.setPerks(perksOf(i)); }   // T49: 강화 확정·초기화·튜닝 변경 모두 여기로 온다
  },
});
// T49: 슬롯에 보일 적용 중 강화 — Lv 1 이상 카드의 { name, lv }
function perksOf(i) { const id = weapons[i].id; return growth.cards(id).map((c, k) => (c ? { name: c.name, lv: growth.level(id, k) } : null)).filter((it) => it && it.lv > 0); }   // 지원 안 하는 카드(null)는 건너뛴다
showWarnings(growth.warnings);

// 탄자국 + 명중 피드백 + 조준선(원) — 무기와 무관한 공용 요소
const marks = createImpactMarks(scene);
const tracers = createTracers(scene);
const hitmarker = createHitmarker();
const damageNumbers = createDamageNumbers();

// 몬스터 (T22·T26 보스) + 스테이지 흐름/웨이브 (T23·T26) + 플레이어 HP (T24).
// 몬스터 공격 → health.damage → HUD(비네트·방향 호·HP 바). HP 0 → 웨이브 정지(몬스터 제거) → 2초 뒤 같은 자리 부활 → 같은 웨이브 재스폰.
const hitsTaken = { count: 0, text: null };
const playerHud = createPlayerHud();
const prompt = createPrompt();   // 중앙 상황 프롬프트 (T26.1)
let stage = null;   // 아래에서 만든다 (health 콜백이 참조)
const health = createHealth({
  player,
  onHit: (angle) => playerHud.hit(angle),
  onDeath: () => stage.holdForRespawn(),
  onRespawn: () => stage.restartCurrent(),
});
const monsters = createMonsters(scene, {
  blocks, player, tracers,
  onPlayerHit: (damage, kind, m) => {
    if (!health.damage(damage, m ? m.pos : null)) return;
    hitsTaken.count++;
    if (hitsTaken.text) hitsTaken.text.textContent = `받은 공격: ${hitsTaken.count}회 (마지막 −${damage} ${kind === 'melee' ? '근접' : kind === 'boss' ? '보스' : '원거리'})`;
  },
});
// T39 강화 선택 화면 — 구역 1~3 클리어 시 stage.onPick → open. 루프는 growthPick.state.open 동안 정지(아래). 포인터 해제·일시정지 메뉴 차단은 onOpen/onClose에서
let pauseMenu = null, crosshair = null, weaponCard = null;   // 아래에서 만든다
let pickDone = null;           // 확정 시 부를 stage의 finish (문 열림·안내·클리어 음)
let pendingClearText = null;   // 확정 뒤 포인터가 풀린 채 붙잡아 둔 클리어 문구 — 재잠금 시 3초 프롬프트로 바꾼다
// T39/T28 공용: 전면 오버레이(강화 선택·결과 화면)가 열리면 포인터 해제·일시정지 메뉴 차단·조준원/프롬프트/카드 숨김. 닫히면 되돌린다
function setOverlay(open) {
  if (open && mouseLook.isLocked()) document.exitPointerLock();
  if (pauseMenu) pauseMenu.setBlocked(open);
  if (crosshair) crosshair.ring.hidden = open;
  prompt.el.style.visibility = open ? 'hidden' : '';
  if (weaponCard) weaponCard.root.style.visibility = open ? 'hidden' : '';
}
const growthPick = createGrowthPick({
  weapons, growth,
  onOpen: () => setOverlay(true),
  onClose: (applied, zone) => {
    setOverlay(false);
    const finish = pickDone; pickDone = null;
    if (!applied || !finish) return;   // 리셋으로 닫힘 — 문은 안 연다
    finish();   // 문 열림 + T34 안내 + 클리어 프롬프트(3초) + 클리어 음. 성장 탭은 열릴 때 다시 그리므로(setVisible) Lv가 반영된다
    if (!mouseLook.isLocked()) { pendingClearText = stage.zones[zone].clearText(); prompt.hold(pendingClearText + '  (클릭하여 계속)'); }
  },
});
// T28 결과 화면 — 한 판 통계(runStats)는 구역이 처음 발동할 때 시작, 보스 처치(stage.onBossClear)에서 멈춘다.
//      RESULT_DELAY_MS 뒤(게임 시각) 루프가 resultScreen.open → 정지. '처음부터 다시 시작'은 아래 restartRun.
const RESULT_DELAY_MS = 2000;
const runStats = createRunStats(weapons);
let gameNow = 0;       // 루프의 게임 시각(정지 시간 제외) — onBossClear가 읽는다
let resultAt = -1;     // 결과 화면을 열 게임 시각. −1 = 예정 없음
let restartRun = null; // 아래에서 정의 (loadout·kits가 필요)
const resultScreen = createResultScreen({
  weapons, growth,
  onOpen: () => setOverlay(true),
  onClose: () => setOverlay(false),
  onRestart: () => { if (restartRun) restartRun(); },
});
stage = createStage(scene, {
  player, monsters, blocks, prompt,
  onPick: (i, finish) => { pickDone = finish; growthPick.open(i); },
  onBossClear: () => { runStats.finish(gameNow); resultAt = gameNow + RESULT_DELAY_MS; },
});   // 구역 1~3 + 보스 방, 문 열림
document.addEventListener('pointerlockchange', () => {
  if (mouseLook.isLocked() && pendingClearText !== null) { prompt.show(pendingClearText, 3); pendingClearText = null; }
});
// 사망 중에는 사격·정조준 입력을 막는다 (버튼 상태를 감싼다)
const gunButtons = { isDown: (b) => !health.state.dead && mouseButtons.isDown(b) };

// T37 명중률 카운터 — 사격장 안(백스톱 앞, z > RANGE.zFar)에서 쏜 발만 세고, 인간형 표적 명중만 명중으로 (과녁판·벽·몬스터 제외)
const accuracy = createAccuracy();
let accuracyLines = [];   // 플레이어 세팅 그룹의 줄 (아래에서 만든다)
function refreshAccuracy() { accuracy.summary(weapons).forEach((t, i) => { if (accuracyLines[i]) accuracyLines[i].textContent = t; }); }

function onFire({ origin, dir, yaw, pitch, hit, enhanced = false }) {   // enhanced = T38 강화탄 (굵은 트레이서·강조 숫자)
  tracers.add(viewModel.muzzleWorld(camera) || muzzlePosition(origin, yaw, pitch), hit ? hit.point : null, dir, enhanced);   // T52: 뷰모델 총구 끝에서 출발 (뷰모델 꺼짐이면 옛 오프셋)
  if (player.state.z > RANGE.zFar) {
    const w = loadout.current().weapon;
    const onTarget = !!(hit && hit.collider && hit.collider.system === targets && (hit.part === 'body' || hit.part === 'head') && hit.result && hit.result.damage > 0);
    accuracy.record(w.id, w.name, { hit: onTarget, head: onTarget && hit.part === 'head' });
    refreshAccuracy();
  }
  // T28 한 판 통계 — 타이머가 도는 동안 쏜 모든 발. 명중 = 몬스터 몸·머리(피해 > 0), 피해 = 실제 입힌 값(배율 포함)
  if (runStats.state.phase === 'running') {
    const w = loadout.current().weapon;
    const onMonster = !!(hit && hit.collider && hit.collider.system === monsters && (hit.part === 'body' || hit.part === 'head') && hit.result && hit.result.damage > 0);
    runStats.record(w.id, w.name, { hit: onMonster, head: onMonster && hit.part === 'head', damage: onMonster ? hit.result.damage : 0 });
  }
  if (hit && (hit.part === 'body' || hit.part === 'head') && hit.result && hit.result.damage > 0) {
    hitmarker.show(hit.part, crosshair.radius());   // 조준원 바깥에 붙는 마커
    emit('hit', { part: hit.part });
    damageNumbers.add(hit.point, hit.result.damage, hit.part, enhanced);
  }
}

// 무기마다 정조준·반동·퍼짐·발사 한 벌(kit). 전환(T16)은 loadout이 맡는다 — 시작 무기 = 라인업 1번 (CS형)
// T38: weapon = growth.effective[i] (최종값). 반동·퍼짐·정조준·피해·탄창·이론 궤적·뷰모델이 전부 강화된 값을 읽는다
function makeKit(weapon) {
  const ads = createAds(weapon, gunButtons);
  const recoil = createRecoil(weapon);
  const spread = createSpread(weapon);
  const shooter = createShooter(weapon, recoil, spread, ads, gunButtons,
    { player, movement, blocks, marks, hittables: [targets, monsters], onFire });
  return { weapon, ads, recoil, spread, shooter };
}
weaponCard = createWeaponCard();   // T26.3 전환 카드 (첫 무기 장착 때는 안 띄운다)
let loadoutReady = false;
let weaponPanel = null;   // 아래에서 만든다 (kits가 필요)
loadout = createLoadout(growth.effective, makeKit, (kit, i) => {
  if (loadoutReady) { weaponCard.show(kit.weapon); emit('weaponSwitch'); }
  weaponInfo.set(kit.weapon);
  weaponInfo.setPerks(perksOf(i));   // T49
  weaponInfo.setLineup(weapons, i);
  if (weaponPanel) weaponPanel.setEquipped(i);   // 패널의 선택 무기는 유지, 드롭다운에 ▶만 옮긴다
});
loadoutReady = true;
// T30 총기 뷰모델 — 별도 씬으로 본 씬 위에 덧그린다. 현재 kit을 매 프레임 다시 읽는다 (view.js와 같은 방식)
const viewModel = createViewModel(renderer, { getKit: () => loadout.current() });
renderer.autoClear = false;   // 본 씬 → clearDepth → 뷰모델 씬 순서로 그리기 위해 수동 clear
// T26.4 무기 세팅 패널 — 튜닝 패널(T17.5) 대체. 드롭다운으로 고른 무기를 편집한다 (장착 무기와 무관)
weaponPanel = createWeaponPanel({
  weapons, kits: loadout.kits, origs: tuning.origs, arrMuls: tuning.arrMuls, curveMuls: tuning.curveMuls, growth,
  notice: tuning.dropped.length ? `파일 값이 바뀌어 저장된 튜닝을 초기화했습니다: ${tuning.dropped.map((id) => (weapons.find((w) => w.id === id) || { name: id }).name).join(', ')}` : null,   // T36
  // T38: 튜닝이 바뀌면 최종값(effective)을 다시 계산한다 — onRefresh가 recompile·탄창·슬롯 표시를 맡는다
  onChange: (w) => { growth.refresh(weapons.indexOf(w)); weaponInfo.setLineup(weapons, loadout.state.index); },
});
weaponPanel.setEquipped(loadout.state.index);
const view = createView(camera, () => loadout.current());   // T35: 정조준 FOV는 무기별 ads.fov
// T38 정조준 이동 페널티: 현재 무기의 정조준 진행도 + 조준 보정 Lv3(perks.adsMoveFree)
movement.setAdsEase(() => { const k = loadout.current(); return { ease: k.ads.state.ease, free: !!(k.weapon.perks && k.weapon.perks.adsMoveFree) }; });
crosshair = createCrosshair();
const reloadRing = createReloadRing();   // T51 재장전 링 — 조준원 바깥 호
const patternOverlay = createPatternOverlay(camera, player);   // T19 이론 반동 궤적

// 키 1~3 직접 전환 (라인업 3정 — COD형 제외, 사용자 결정 2026-09-05), 휠 순환 전환, R 재장전(현재 무기)
['Digit1', 'Digit2', 'Digit3'].forEach((code, i) => keyboard.onPress(code, () => loadout.select(i)));
createMouseWheel(mouseLook, (step) => (step > 0 ? loadout.next() : loadout.prev()));
keyboard.onPress('KeyR', () => { const k = loadout.current(); k.shooter.startReload(k.shooter.state.now); });
// T18: 탄착군 지우기 — 잠금 중 X, 해제 중엔 왼쪽 위 패널 버튼
const clearMarks = () => { marks.clear(); accuracy.reset(); refreshAccuracy(); };   // T37: 탄착군과 명중률을 같이 비운다
keyboard.onPress('KeyX', clearMarks);
settingsPanel.addButton('탄착군·명중률 지우기 (X)', clearMarks);
// T19: 이론 궤적 켜기/끄기 — 잠금 중 P, 해제 중엔 패널 버튼 (사용자 지시 2026-09-04, SPEC '항상 켜짐' 변경)
const overlayLabel = () => `이론 궤적: ${patternOverlay.state.enabled ? '켜짐' : '꺼짐'} (P)`;
const overlayBtn = settingsPanel.addButton(overlayLabel(), () => { patternOverlay.toggle(); overlayBtn.textContent = overlayLabel(); });
keyboard.onPress('KeyP', () => { patternOverlay.toggle(); overlayBtn.textContent = overlayLabel(); });

// T22: 몬스터 레버 (접이식 그룹) + 리셋. 설정 패널이 길어지면 튜닝 패널을 그 아래로 내린다
// T26.2: 튜닝(무기 세팅) 패널은 우측 무기 슬롯 바로 위까지. 설정 패널은 좌측 고정이라 서로 무관
const layoutPanels = () => { weaponPanel.root.style.bottom = (weaponInfo.root.getBoundingClientRect().height + 24) + 'px'; };
// T37: 명중률 그룹 (기본 펼침) — 무기별 한 줄 + 초기화
const ag = settingsPanel.addGroup('명중률 (사격장)', { open: true, onToggle: layoutPanels });
accuracyLines = accuracy.summary(weapons).map((t) => ag.addText(t));
ag.addButton('명중률 초기화', () => { accuracy.reset(); refreshAccuracy(); });
const M = config.monster;
const mg = settingsPanel.addGroup('몬스터 (T22)', { onToggle: layoutPanels });
mg.addSlider({ label: '근접형 HP (리셋 후 적용)', min: 500, max: 6000, step: 100, get: () => M.melee.hp, set: (v) => { M.melee.hp = v; } });
mg.addSlider({ label: '원거리형 HP (리셋 후 적용)', min: 500, max: 6000, step: 100, get: () => M.ranged.hp, set: (v) => { M.ranged.hp = v; } });
mg.addSlider({ label: '정예 근접 HP (리셋 후 적용)', min: 500, max: 9000, step: 100, get: () => M.melee.eliteHp, set: (v) => { M.melee.eliteHp = v; } });   // T46
mg.addSlider({ label: '정예 원거리 HP (리셋 후 적용)', min: 500, max: 9000, step: 100, get: () => M.ranged.eliteHp, set: (v) => { M.ranged.eliteHp = v; } });
mg.addSlider({ label: '근접형 속도 (m/s)', min: 2, max: 10, step: 0.5, get: () => M.melee.speed, set: (v) => { M.melee.speed = v; }, format: (v) => v.toFixed(1) });
mg.addSlider({ label: '원거리형 속도 (m/s)', min: 2, max: 8, step: 0.5, get: () => M.ranged.speed, set: (v) => { M.ranged.speed = v; }, format: (v) => v.toFixed(1) });
mg.addSlider({ label: '조준선 딜레이 (s)', min: 0.2, max: 2.0, step: 0.1, get: () => M.ranged.aimDelay, set: (v) => { M.ranged.aimDelay = v; }, format: (v) => v.toFixed(1) });
mg.addSlider({ label: '조준선 표시 지연 (s, 딜레이보다 크면 조준선 없이 발사)', min: 0, max: 1.5, step: 0.1, get: () => M.laserDelay, set: (v) => { M.laserDelay = v; }, format: (v) => v.toFixed(1) });   // T55
mg.addSlider({ label: '근접형 피해', min: 5, max: 300, step: 5, get: () => M.melee.damage, set: (v) => { M.melee.damage = v; } });
mg.addSlider({ label: '원거리형 피해', min: 5, max: 300, step: 5, get: () => M.ranged.damage, set: (v) => { M.ranged.damage = v; } });
mg.addSlider({ label: '보스 HP (리셋 후 적용)', min: 5000, max: 40000, step: 1000, get: () => M.boss.hp, set: (v) => { M.boss.hp = v; } });
mg.addSlider({ label: '플레이어 최대 HP (리셋 후 적용)', min: 100, max: 3000, step: 100, get: () => config.player.hpMax, set: (v) => { config.player.hpMax = v; } });
hitsTaken.text = mg.addText('받은 공격: 0회');
// T29: 사운드 그룹 — 마스터 볼륨 + 켜기/끄기 (localStorage audio.v1)
const sg = settingsPanel.addGroup('사운드', { open: true, onToggle: layoutPanels });
sg.addSlider({ label: '마스터 볼륨', min: 0, max: 1, step: 0.05, get: () => sound.state.volume, set: (v) => sound.setVolume(v), format: (v) => Math.round(v * 100) + '%' });
const muteLabel = () => `소리: ${sound.state.muted ? '꺼짐' : '켜짐'}`;
const muteBtn = sg.addButton(muteLabel(), () => { sound.setMuted(!sound.state.muted); muteBtn.textContent = muteLabel(); });
// T30: 총기 뷰모델 켜기/끄기 (localStorage viewModel.v1)
const vg = settingsPanel.addGroup('총기 뷰모델', { open: true, onToggle: layoutPanels });
const vmLabel = () => `뷰모델: ${viewModel.state.enabled ? '켜짐' : '꺼짐'}`;
const vmBtn = vg.addButton(vmLabel(), () => { viewModel.setEnabled(!viewModel.state.enabled); vmBtn.textContent = vmLabel(); });
// T23/T26: 스테이지 리셋 — 몬스터 전부 제거, 존 재무장, 문 전부 닫힘, HP 회복 (플레이어 위치는 그대로)
// T28: 리셋은 결과 화면·통계도 비운다 (강화는 그대로 — T40 제외 결정)
const resetZone = () => { growthPick.close(false); resultScreen.close(); resultAt = -1; runStats.reset(); stage.reset(); health.reset(); hitsTaken.count = 0; hitsTaken.text.textContent = '받은 공격: 0회'; accuracy.reset(); refreshAccuracy(); };
settingsPanel.addButton('스테이지 리셋 (M)', resetZone);
keyboard.onPress('KeyM', resetZone);
// T28 처음부터 다시 시작 (사용자 결정 2026-09-07): 강화 Lv 0 · 사격장 시작 위치(0,0) · 스테이지·HP·통계 리셋 · 1번 무기(CS형) · 탄창 가득. 튜닝(무기 세팅)은 유지
restartRun = () => {
  resetZone();          // 결과 화면 닫힘 + 스테이지·HP·받은 공격·명중률·통계
  growth.reset();       // Lv 0 → onRefresh가 kit 반동 재컴파일
  for (const k of loadout.kits) {   // 탄창 가득 · 버프 0 · 반동 누적·bloom·정조준 0
    k.shooter.cancelReload(); k.shooter.state.mag = k.weapon.mag; k.shooter.state.enhancedCount = 0;
    k.shooter.state.buffs.damageUntil = 0; k.shooter.state.buffs.freeAmmoUntil = 0;
    k.recoil.reset(); k.spread.reset(); k.ads.reset();
  }
  loadout.select(0);
  player.state.x = PLAYER_START.x; player.state.z = PLAYER_START.z; player.state.yaw = 0; player.state.pitch = 0;
  movement.state.vx = movement.state.vz = movement.state.speed = 0; movement.state.crouched = false;
  prompt.hold('클릭하여 시작');   // 포인터가 풀려 있다 — 잠기면 아래 리스너가 지운다
};
layoutPanels();
window.addEventListener('resize', layoutPanels);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(layoutPanels).observe(weaponInfo.root);   // 슬롯 높이가 바뀌면(내용 갱신) 패널 bottom 재계산
// T26.1: 상시 HUD 비우기 — 설정 패널·튜닝 패널은 만들어 두고 숨긴다 (T26.2 일시정지 메뉴가 다시 연다). 키(M·P·X)는 계속 동작
settingsPanel.setVisible(false);
weaponPanel.setVisible(false);
// T26.2: 일시정지 메뉴 — 잠금이 풀리면(ESC 등) 뜨고 Tab으로 열고 닫는다. 디버그 = 설정 패널, 무기 세팅 = 튜닝 패널(T26.4 전까지)
pauseMenu = createPauseMenu({
  canvas, mouseLook, onReset: resetZone,
  panels: { settings: settingsPanel, tuning: weaponPanel },
  onStateChange: (mode) => { layoutPanels(); crosshair.ring.hidden = mode !== 'closed'; prompt.el.style.visibility = weaponCard.root.style.visibility = mode === 'closed' ? '' : 'hidden'; },   // 메뉴 중엔 조준점·프롬프트 숨김 (카드와 겹침)
});
// 시작 안내: 첫 잠금 전까지 중앙 프롬프트 (잠기면 지움)
prompt.hold('클릭하여 시작');
// T49: 첫 잠금(처음부터 다시 시작 뒤 포함) 순간 사격장 통과 안내를 5초 (바닥 초록 점선·문 빛기둥은 stage.js rangeGuide)
document.addEventListener('pointerlockchange', () => { if (mouseLook.isLocked() && prompt.state.text === '클릭하여 시작') prompt.show('총을 시험해 본 뒤, 초록 선을 따라 문으로 가세요', 5); }, { once: false });

// 개발 서버에서만: 콘솔 검증용 (빌드에는 포함되지 않음)
if (import.meta.env.DEV) {
  window.__debug = { player, movement, view, config, weapons, warnings, showWarnings, loadout, tuning, weaponPanel, patternOverlay, marks, targets, monsters, stage, blocks, health, playerHud, prompt, pauseMenu, weaponCard, sound, settingsPanel, tracers, damageNumbers, hitmarker, reloadRing, viewModel, accuracy, growth, growthPick, runStats, resultScreen, restartRun, events: { emit } };
}

// T39: 강화 선택 화면 동안 게임 정지. 게임 시각 now = 실시간 − 정지 누적. shooter·recoil의 재장전·버프·패턴 리셋 타이머가 전부 이 now를 받으므로
//      정지 중 흐르지 않는다. 정지 중엔 갱신을 전부 건너뛰고(사망 타이머 포함 — "클리어 우선, 닫힌 뒤 부활") 렌더만 계속한다.
let pausedMs = 0, pauseStart = -1;
startLoop((dt) => {
  const real = performance.now();
  // T28: 보스 처치 + 2초(게임 시각)가 되면 결과 화면 — 정지 판정 앞에서 열어 이 프레임부터 멈춘다
  if (resultAt >= 0 && !growthPick.state.open && real - pausedMs >= resultAt) { resultAt = -1; resultScreen.open(runStats.summary()); }
  const paused = growthPick.state.open || resultScreen.state.open;
  if (paused) { if (pauseStart < 0) pauseStart = real; }
  else if (pauseStart >= 0) { pausedMs += real - pauseStart; pauseStart = -1; }
  const now = (paused ? pauseStart : real) - pausedMs;
  gameNow = now;
  const kit = loadout.current();
  const { weapon, ads, recoil, spread, shooter } = kit;
  if (!paused) {
    if (runStats.state.phase === 'idle' && stage.state.current >= 0) runStats.start(now);   // T28: 구역이 처음 발동한 순간 = 타이머 시작 (정상 흐름은 구역 1)
    patternOverlay.beforeShoot(recoil);   // 첫 발 직전 조준 방향을 궤적 원점으로 (shooter.update보다 먼저)
    health.update(dt);              // 사망 타이머·눈높이·부활 (movement보다 먼저 — 죽으면 이동을 건너뛴다)
    if (health.state.dead) { movement.state.vx = movement.state.vz = movement.state.speed = 0; }
    else movement.update(dt);
    ads.update(dt);                 // 이 프레임의 배율이 발사에 쓰이도록 shooter보다 먼저
    shooter.update(now, dt);
    targets.update(dt, camera);
    stage.update(dt);               // 트리거·스폰·웨이브 전이·문 열림 (monsters.update 앞 — 스폰된 프레임에 바로 움직인다)
    monsters.update(dt, camera);
    tracers.update(dt);
  }
  // T35 viewTracking: recoil.state.off*는 탄도 기준 누적 반동(100%). 카메라는 그중 viewTracking 비율만 따라간다 — 탄은 shooter가 100%로 쏜다
  player.state.offYaw = recoil.state.offYaw * weapon.viewTracking;
  player.state.offPitch = recoil.state.offPitch * weapon.viewTracking;
  player.apply();
  view.update();
  if (!paused) {
    viewModel.update(dt);           // 카메라 확정 뒤 — ads ease·재장전 진행도·반동 반영
    damageNumbers.update(dt);
    playerHud.update(dt);
    prompt.update(dt);
    weaponCard.update(dt);
  }
  playerHud.setHp(health.state.hp, health.state.hpMax);
  playerHud.setDead(health.respawnRemain());
  crosshair.set(shooter.state.currentSpread, view.state.fov);
  damageNumbers.setAnchor(crosshair.radius());   // 피해 숫자를 조준원 바로 오른쪽 위에
  reloadRing.set(crosshair.ring.hidden ? null : shooter.state.reloadProgress, crosshair.radius());   // T51: 메뉴·오버레이로 조준원이 숨으면 링도 숨김
  weaponInfo.setAmmo(shooter.state.mag, weapon.mag, shooter.state.reloadProgress);
  weaponInfo.setBuffs(shooter.buffRemain(now));   // T38 멀티킬 피해 · 탄약 무한 남은 시간
  patternOverlay.draw(kit);
  renderer.clear();
  renderer.render(scene, camera);
  viewModel.render();             // T30: 깊이만 지우고 총을 덧그린다
});
