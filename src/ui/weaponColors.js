// 무기별 표시 색 (T18). 탄착 자국과 무기 정보 패널의 스와치가 같은 색을 쓴다 — "이 색 자국 = 이 총".
// 무기 데이터 파일에는 넣지 않는다(순수 표시용). 모르는 id는 회색.
export const WEAPON_COLORS = {
  cs: '#ff4d4d',     // 빨강
  pubg: '#3d8bff',   // 파랑
  cod: '#2ecc71',    // 초록
  d2: '#ffb84d',     // 주황
};
export const DEFAULT_COLOR = '#444444';

export function colorOf(weapon) {
  return (weapon && WEAPON_COLORS[weapon.id]) || DEFAULT_COLOR;
}
