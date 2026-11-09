import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default function setup() {
  const paths = ['chat-history.json', 'settings.json'].map(name =>
    fileURLToPath(new URL(`../.data/${name}`, import.meta.url)));
  const absentBefore = paths.filter(path => !existsSync(path));
  // Global teardown runs after every worker, so later tests cannot escape this check.
  // Never remove or assert against a developer's pre-existing files.
  return () => {
    for (const path of absentBefore) {
      assert.equal(existsSync(path), false, `Tests created real application storage: ${path}`);
    }
  };
}
