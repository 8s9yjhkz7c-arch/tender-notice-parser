// Copyright (c) 2026 Hao Sun
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const cli = fileURLToPath(new URL("../bin/tender-notice-parser.js", import.meta.url));
const sample = fileURLToPath(new URL("../examples/synthetic-notice.txt", import.meta.url));
const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { input, encoding: "utf8" });

test("reads a file and outputs JSON only", () => {
  const result = run(["--pretty", sample]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).deadlines.submission.time, "09:30");
  assert.match(result.stdout, /^\{\n /);
});

test("reads stdin and gives help without input", () => {
  assert.equal(JSON.parse(run(["-"], "报名截止：2026-06-09").stdout).deadlines.registration.date, "2026-06-09");
  assert.match(run(["--help"]).stdout, /^Usage:/);
});

test("fails on unknown flags, missing files and malformed UTF-8", () => {
  for (const result of [run(["--unknown"]), run(["missing-fixture-file.txt"]), run([], Buffer.from([0xff]))]) {
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr);
  }
  assert.doesNotMatch(run(["missing-fixture-file.txt"]).stderr, /missing-fixture-file/);
});
