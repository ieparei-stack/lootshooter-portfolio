import { config } from '../config.js';
import { emit } from '../core/events.js';

// 플레이어 HP·사망·부활 (T24). 사용자 결정: HP 1000, 자동 회복 없음, HP 0 → 2초 뒤 같은 자리에서 부활.
//   damage(amount, from) : 몬스터 공격(monsters.js onPlayerHit)이 부른다. from = 공격자 위치 {x, z} (피격 방향 표시용)
//   onHit(angleDeg)      : 피격 방향. 플레이어 시선 기준 시계방향 각도 (0 = 앞, 90 = 오른쪽, 180 = 뒤)
//   onDeath / onRespawn  : main.js가 웨이브 정지·재시작에 연결
// 사망 중에는 눈높이를 deathEyeHeight로 내린다 (movement.update는 main이 건너뛴다). 부활 시 원래 눈높이로.
export function createHealth({ player, onHit = null, onDeath = null, onRespawn = null } = {}) {
  const P = config.player;
  const state = { hp: P.hpMax, hpMax: P.hpMax, dead: false, deathT: 0, eyeBefore: P.eyeHeight };

  function hitAngle(from) {
    const dx = from.x - player.state.x, dz = from.z - player.state.z;
    if (Math.hypot(dx, dz) < 1e-6) return 0;
    const worldDeg = Math.atan2(dx, -dz) * 180 / Math.PI;   // 0 = −Z(앞), +90 = +X(오른쪽)
    let a = worldDeg + player.state.yaw;                     // yaw > 0 = 왼쪽으로 돌아봄 → 오른쪽에 있던 것이 더 오른쪽으로
    a = ((a % 360) + 360) % 360;
    return a;
  }

  function damage(amount, from = null) {
    if (state.dead || amount <= 0) return false;
    state.hp = Math.max(0, state.hp - amount);
    emit('playerHit');
    if (onHit) onHit(from ? hitAngle(from) : 0);
    if (state.hp === 0) die();
    return true;
  }

  function die() {
    state.dead = true;
    state.deathT = 0;
    state.eyeBefore = player.state.eyeHeight;
    emit('playerDeath');
    if (onDeath) onDeath();
  }

  function respawn() {
    state.dead = false;
    state.deathT = 0;
    state.hp = state.hpMax;
    player.state.eyeHeight = P.eyeHeight;
    emit('playerRespawn');
    if (onRespawn) onRespawn();
  }

  // 남은 부활 시간 (s). 살아 있으면 null
  function respawnRemain() { return state.dead ? Math.max(0, P.respawnTime - state.deathT) : null; }

  function update(dt) {
    if (!state.dead) return;
    state.deathT += dt;
    // 눈높이를 바닥 쪽으로 (0.3s 동안)
    const k = Math.min(1, state.deathT / 0.3);
    player.state.eyeHeight = state.eyeBefore + (P.deathEyeHeight - state.eyeBefore) * k;
    if (state.deathT >= P.respawnTime) respawn();
  }

  // 구역 리셋용: 가득 채우고 살아있는 상태로 (콜백 없음)
  function reset() {
    state.hpMax = P.hpMax;
    state.hp = state.hpMax;
    if (state.dead) { state.dead = false; state.deathT = 0; player.state.eyeHeight = P.eyeHeight; }
  }

  return { state, damage, update, reset, respawnRemain };
}
