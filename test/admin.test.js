// 관리자 페이지는 HTML 안에 스크립트가 있어서 문법 오류가 나도 다른 테스트로는 안 잡힌다 → 꺼내서 node --check
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('관리자 페이지 스크립트 문법', () => {
  const html = readFileSync(new URL('../public/admin/index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  const dir = mkdtempSync(join(tmpdir(), 'admin-'));
  scripts.forEach((code, i) => {
    const f = join(dir, `s${i}.mjs`);
    writeFileSync(f, code);
    execFileSync(process.execPath, ['--check', f]); // 문법 오류면 여기서 실패
  });
});
