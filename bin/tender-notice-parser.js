#!/usr/bin/env node
// Copyright (c) 2026 Hao Sun
// SPDX-License-Identifier: MIT

import { createReadStream } from "node:fs";
import { MAX_INPUT_BYTES, parseNotice } from "../src/index.js";

const usage = "Usage: tender-notice-parser [--pretty] [FILE|-]\nRead UTF-8 notice text from FILE or standard input and write JSON to standard output.";

async function readText(stream) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    if (bytes > MAX_INPUT_BYTES) throw new RangeError("Notice exceeds the 1 MiB UTF-8 limit.");
    chunks.push(chunk);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(usage);
  } else {
    const paths = args.filter(arg => arg !== "--pretty");
    if (paths.length > 1 || paths.some(arg => arg.startsWith("-") && arg !== "-")) throw new Error(usage);
    const file = paths[0];
    const stream = file && file !== "-" ? createReadStream(file) : process.stdin;
    const result = parseNotice(await readText(stream));
    console.log(JSON.stringify(result, null, args.includes("--pretty") ? 2 : undefined));
  }
} catch (error) {
  // Do not repeat an input path or notice text in diagnostics.
  console.error(error.code ? `Input error (${error.code}).` : error.message);
  process.exitCode = 1;
}
