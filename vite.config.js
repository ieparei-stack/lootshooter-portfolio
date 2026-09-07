import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { copyFileSync, statSync } from 'node:fs';

// 빌드 결과를 dist/index.html 한 개로 합친 뒤 루트 `게임실행.html`로 복사한다.
// 제출본은 오프라인 더블클릭으로 열려야 하므로 외부 참조가 남으면 안 된다.
// dist/는 git 무시, 게임실행.html은 git 포함 — 저장소를 받아 더블클릭만으로 실행.
const SUBMIT_FILE = '게임실행.html';

function copyToRoot() {
  return {
    name: 'copy-to-root',
    apply: 'build',
    closeBundle() {
      copyFileSync('dist/index.html', SUBMIT_FILE);
      const kb = Math.round(statSync(SUBMIT_FILE).size / 1024);
      console.log(`\n${SUBMIT_FILE} (${kb} KB) ← dist/index.html`);
    },
  };
}

export default defineConfig({
  plugins: [viteSingleFile(), copyToRoot()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000_000,
    cssCodeSplit: false,
  },
});
