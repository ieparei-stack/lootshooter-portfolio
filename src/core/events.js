// 작은 이벤트 버스 (T29). 게임 모듈은 emit만 하고, 사운드(T29)·뷰모델(T30)·통계(T28) 같은 관찰자가 on으로 듣는다.
// 콜백을 여러 층으로 꿰지 않기 위한 장치. 동기 호출, 구독 순서대로.
const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
  return () => { const list = handlers.get(name); const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
}

export function emit(name, data) {
  const list = handlers.get(name);
  if (!list) return;
  for (const fn of list.slice()) fn(data);
}

export function clearAll() { handlers.clear(); }   // 테스트용
