// Configuration vitest — seul ajout : résoudre l'alias `@/*` sur la racine du
// projet, exactement comme `tsconfig.json` (`compilerOptions.paths`). Sans
// ça, tout module PUR testé (`lib/*.test.ts`) qui importe un autre module
// `lib/` via `@/lib/...` — le style d'import du reste du dépôt — échoue à la
// résolution sous vitest, qui ne lit pas les chemins de tsconfig tout seul.
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
