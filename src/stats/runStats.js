// 한 판 통계 (T28 결과 화면). DOM 없음 — Node 테스트 대상.
//   - 타이머: 구역 1에 들어선 순간(start) → 보스 처치(finish). now는 main.js의 게임 시각(정지 시간 제외)이라 강화 선택·결과 화면 동안은 안 흐른다.
//   - 무기별 발사 / 몬스터 명중 / 헤드 / 입힌 피해. record는 running 동안만 센다 (사격장에서 세팅 만지는 발은 제외).
//     어디를 '명중'으로 칠지는 main.js가 정한다 (몬스터 몸·머리, 피해 > 0). 피해는 hit.result.damage (강화탄·멀티킬 배율 포함, 실제 값).
//   - 명중률 = 명중 / 발사, 헤드샷 비율 = 헤드 / 명중 (사격장 accuracy.js와 같은 정의). 사용 비율 = 무기 발사 / 전체 발사, 무기 피해 / 전체 피해.
export function createRunStats(weapons) {
  const state = { phase: 'idle', startNow: 0, endNow: 0, byId: {} };   // idle | running | done

  function entry(id, name) {
    if (!state.byId[id]) state.byId[id] = { name, shots: 0, hits: 0, head: 0, damage: 0 };
    return state.byId[id];
  }

  function start(now) {
    if (state.phase === 'running') return false;
    state.phase = 'running'; state.startNow = now; state.endNow = now;
    return true;
  }
  function finish(now) {
    if (state.phase !== 'running') return false;
    state.phase = 'done'; state.endNow = now;
    return true;
  }
  function reset() {
    state.phase = 'idle'; state.startNow = 0; state.endNow = 0;
    for (const k of Object.keys(state.byId)) delete state.byId[k];
  }

  // 한 발. hit = 몬스터 명중(피해 > 0), head = 그중 머리, damage = 입힌 피해
  function record(id, name, { hit = false, head = false, damage = 0 } = {}) {
    if (state.phase !== 'running') return false;
    const s = entry(id, name);
    s.shots++;
    if (hit) { s.hits++; if (head) s.head++; s.damage += Math.max(0, damage); }
    return true;
  }

  // 경과 시간 (s). running이면 now 기준, done이면 끝난 시각 기준
  function elapsed(now = state.endNow) {
    if (state.phase === 'idle') return 0;
    return Math.max(0, ((state.phase === 'running' ? now : state.endNow) - state.startNow) / 1000);
  }

  function summary(now) {
    const perWeapon = weapons.map((w) => {
      const s = state.byId[w.id] || { name: w.name, shots: 0, hits: 0, head: 0, damage: 0 };
      return { id: w.id, name: w.name, shots: s.shots, hits: s.hits, head: s.head, damage: Math.round(s.damage) };
    });
    const shots = perWeapon.reduce((a, s) => a + s.shots, 0);
    const hits = perWeapon.reduce((a, s) => a + s.hits, 0);
    const head = perWeapon.reduce((a, s) => a + s.head, 0);
    const damage = perWeapon.reduce((a, s) => a + s.damage, 0);
    for (const s of perWeapon) {
      s.shotsPct = shots > 0 ? s.shots / shots : 0;
      s.damagePct = damage > 0 ? s.damage / damage : 0;
      s.accuracy = s.shots > 0 ? s.hits / s.shots : null;
    }
    return {
      timeSec: elapsed(now), shots, hits, head, damage,
      accuracy: shots > 0 ? hits / shots : null,
      headRate: hits > 0 ? head / hits : null,
      perWeapon,
    };
  }

  return { state, start, finish, reset, record, elapsed, summary };
}

// m:ss.s 표기 (결과 화면·테스트 공용)
export function formatTime(sec) {
  const tenths = Math.round(Math.max(0, sec) * 10);   // 먼저 0.1초 단위로 반올림 — 59.96이 '60.0'으로 넘치지 않게
  const m = Math.floor(tenths / 600);
  const r = (tenths - m * 600) / 10;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}
