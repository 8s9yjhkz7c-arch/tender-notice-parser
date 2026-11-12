# Tender Notice Parser

Extract project fields and deadlines from Chinese procurement notices supplied as UTF-8 plain text. The CLI and JavaScript API run locally with Node.js 22 or newer and have no runtime dependencies, network calls, accounts, or credentials.

## Try it from a source checkout

```sh
node bin/tender-notice-parser.js --pretty examples/synthetic-notice.txt
npm test
```

To install a locally built package:

```sh
npm pack
npm install --no-audit --no-fund ./tender-notice-parser-0.1.0.tgz
./node_modules/.bin/tender-notice-parser --pretty path/to/notice.txt
```

The CLI accepts a file path or standard input:

```sh
node bin/tender-notice-parser.js --pretty < examples/synthetic-notice.txt
```

The CLI prints JSON to standard output. Unrecognized or ambiguous fields remain in the JSON with their corresponding statuses. Invalid input or a file error produces a diagnostic on standard error and exits with status 1.

## JavaScript API

```js
import { parseNotice } from "tender-notice-parser";

const parsed = parseNotice(
  "项目名称：示例市图书馆照明改造\n" +
  "报名截止时间：2026年11月10日 17:00\n" +
  "投标截止时间：2026年11月15日"
);

console.log(parsed.deadlines.registration.time); // "17:00"
console.log(parsed.deadlines.submission.precision); // "DATE_ONLY"
console.log(parsed.deadlines.submission.time); // null
```

In a source checkout, import from `./src/index.js`. `parseNotice(text)` accepts a non-empty string of at most 1 MiB in UTF-8 and returns an object with `schemaVersion: 1`. It throws a `TypeError` for empty or non-string input and a `RangeError` for input over the size limit.

## Output

- `fields` contains explicit project name, project ID, buyer, procurement method, region and budget when recognized. Budgets use integer `amountFen` and currency `CNY` so callers can store the amount without floating-point conversion. Contradictory field values are omitted and their keys appear in `conflictingFields`.
- `deadlines` has separate `registration`, `documentAcquisition`, `supplierCollection`, `submission` and `opening` slots. Submission retains the source action, such as bid, response, quotation, or the notice's combined bid/response label.
- Each slot includes a status and a list of distinct candidates. `FOUND` provides a top-level result with `semanticType`, `date`, `time`, `precision` and `evidence`. `UNKNOWN` means a supported label was absent. `UNCERTAIN` means a supported label had incomplete, invalid or provisional evidence. `CONFLICTING` reports distinct values or competing semantics without selecting one.
- Dates use `YYYY-MM-DD`. Times use `HH:mm` or `HH:mm:ss` and retain the wall-clock time in the notice. A date with no stated time has precision `DATE_ONLY` and `time: null`. Evidence includes the original label line and, when used, its section heading. Line numbers start at 1.

## Supported text and limits

The rules handle supported Chinese labels on their own line and simple numbered sections followed by a generic deadline line. Supported inputs include full dates with a year, explicit 24-hour times, Chinese hour/minute notation and clear two-endpoint ranges. File acquisition, registration and submission remain distinct even when their dates coincide.

This release does not fetch pages, parse HTML or PDFs, perform OCR, reconcile amendments across documents, derive times from separate office-hour rows, infer missing years, or convert time zones. Verify business-critical results against the source, especially when the notice has an amendment or conflicting evidence. The synthetic tests check supported formats and failure modes. They do not measure accuracy on a representative corpus.

## Contributing

Run `npm test` before submitting a change. Add short synthetic fixtures for new forms or regressions. For a parser bug, include the smallest synthetic text that reproduces it, the current JSON, and the expected status and semantics. Read [SECURITY.md](SECURITY.md) before sharing an input.

This project is released under the MIT License. The distribution terms and attribution are in [LICENSE](LICENSE).
