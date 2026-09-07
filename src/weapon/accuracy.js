// 사격장 명중률 카운터 (T37). 발당 피해 역산을 위해 사용자가 25m 표적에 10발 점사를 반복하며 명중률을 잰다.
//   - 무기별로 발사 / 명중 / 헤드를 센다. 어디서 무엇을 셀지는 main.js가 정한다 (사격장 안 + 인간형 표적만).
//   - 명중률 = 명중 / 발사, 헤드율 = 헤드 / 명중 (명중 0이면 '—').
//   - 순수 로직 (DOM 없음, Node 테스트 대상). 표시는 플레이어 세팅 '명중률 (사격장)' 그룹.
export function createAccuracy() {
  const stats = {};   // id → { name, shots, hits, head }

  function entry(id, name) {
    if (!stats[id]) stats[id] = { name, shots: 0, hits: 0, head: 0 };
    return stats[id];
  }

  // 한 발. hit = 인간형 표적 명중 여부, head = 그중 머리
  function record(id, name, { hit = false, head = false } = {}) {
    const s = entry(id, name);
    s.shots++;
    if (hit) { s.hits++; if (head) s.head++; }
    return s;
  }

  function reset() { for (const k of Object.keys(stats)) delete stats[k]; }

  const pct = (a, b) => (b > 0 ? Math.round(a / b * 100) + '%' : '—');
  function line(id, name) {
    const s = stats[id] || { name, shots: 0, hits: 0, head: 0 };
    return `${s.name || name}: 발사 ${s.shots} · 명중 ${s.hits} · 헤드 ${s.head} · 명중률 ${pct(s.hits, s.shots)} · 헤드율 ${pct(s.head, s.hits)}`;
  }
  // 무기 목록 순서대로 한 줄씩 (아직 안 쏜 무기도 0으로)
  function summary(weapons) { return weapons.map((w) => line(w.id, w.name)); }

  return { stats, record, reset, line, summary };
}
