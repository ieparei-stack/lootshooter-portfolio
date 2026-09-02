import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 빌드 결과를 dist/index.html 한 개로 합친다.
// 제출본은 오프라인 더블클릭으로 열려야 하므로 외부 참조가 남으면 안 된다.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000_000,
    cssCodeSplit: false,
  },
});
