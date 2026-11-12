// Copyright (c) 2026 Hao Sun
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MAX_INPUT_BYTES, parseNotice } from "../src/index.js";

const parse = text => parseNotice(text).deadlines;
const sample = new URL("../examples/synthetic-notice.txt", import.meta.url);

test("extracts synthetic project fields and independently identifies four deadlines", () => {
  const result = parseNotice(readFileSync(sample, "utf8"));
  assert.deepEqual(result.fields, {
    projectName: "示例市图书馆照明改造",
    projectId: "DEMO-2026-001",
    buyer: "示例市虚构图书馆",
    procurementMethod: "公开招标",
    region: "示例市",
    budget: { amountFen: 12_500_000, currency: "CNY" }
  });
  const { registration, documentAcquisition, submission, opening } = result.deadlines;
  assert.equal(registration.time, "17:00");
  assert.equal(documentAcquisition.date, "2026-11-10");
  assert.equal(documentAcquisition.time, null);
  assert.equal(documentAcquisition.precision, "DATE_ONLY");
  assert.deepEqual(documentAcquisition.evidence.section, { line: 9, text: "一、获取采购文件" });
  assert.equal(submission.time, "09:30");
  assert.equal(opening.time, submission.time);
  assert.notEqual(opening.semanticType, submission.semanticType);
});

test("preserves response, bid, quotation and combined submission labels", () => {
  const labels = {
    响应文件提交截止时间: "RESPONSE_SUBMISSION_DEADLINE",
    投标文件递交截止: "BID_SUBMISSION_DEADLINE",
    报价截止时间: "QUOTATION_SUBMISSION_DEADLINE",
    "投标（响应）截止时间": "BID_OR_RESPONSE_SUBMISSION_DEADLINE",
    "投标(响应)截止时间": "BID_OR_RESPONSE_SUBMISSION_DEADLINE"
  };
  for (const [label, semanticType] of Object.entries(labels)) {
    const result = parse(`${label}：2026年4月18日9时05分止`).submission;
    assert.equal(result.status, "FOUND", label);
    assert.equal(result.semanticType, semanticType, label);
    assert.equal(result.time, "09:05", label);
  }
});

test("normalizes full-width input while returning the original evidence", () => {
  const source = "报名截止时间：２０２６－０４－０９ １７：３０";
  const result = parse(source).registration;
  assert.equal(result.date, "2026-04-09");
  assert.equal(result.time, "17:30");
  assert.equal(result.evidence.label.text, source);
});

test("keeps file acquisition, registration and supplier collection distinct", () => {
  const result = parse("获取采购文件截止：2026-04-09 10:00\n供应商征集截止：2026-04-10 11:00");
  assert.equal(result.registration.status, "UNKNOWN");
  assert.equal(result.submission.status, "UNKNOWN");
  assert.equal(result.documentAcquisition.semanticType, "DOCUMENT_ACQUISITION_DEADLINE");
  assert.equal(result.supplierCollection.semanticType, "SUPPLIER_COLLECTION_DEADLINE");
});

test("accepts only dates and times that can be normalized without guessing", () => {
  for (const value of ["2026-02-29", "2026-04-31", "2026-04-12 24:00", "2026-04-12 09:5",
    "2026年4月12日18时", "2026-04-12T09:30Z", "2026-04-12 09:30+08:00", "4月12日 09:30"]) {
    const result = parse("报名截止：" + value).registration;
    assert.equal(result.status, "UNCERTAIN", value);
    assert.deepEqual(result.candidates, [], value);
  }
  assert.equal(parse("报名截止：2028-02-29").registration.precision, "DATE_ONLY");
  assert.equal(parse("报名截止：2026-04-12 00:00").registration.time, "00:00");
  assert.equal(parse("开标时间：2026年4月12日 下午2点5分30秒").opening.time, "14:05:30");
  assert.equal(parse("开标时间：2026-04-12T09:30").opening.time, "09:30");
});

test("handles an explicit range and rejects a reversed range", () => {
  assert.equal(parse("供应商征集时间：2026-04-01 10:00至2026-04-05 15:30").supplierCollection.time, "15:30");
  assert.equal(parse("获取采购文件时间：2026-04-05至2026-04-01").documentAcquisition.status, "UNCERTAIN");
});

test("keeps conflicts visible and deduplicates the same semantic value", () => {
  const row = "报名截止：2026-04-09 10:00";
  assert.equal(parse(row + "\n" + row).registration.candidates.length, 1);
  const result = parse(row + "\n报名截止：2026-04-09 11:00").registration;
  assert.equal(result.status, "CONFLICTING");
  assert.equal(result.time, undefined);
  assert.deepEqual(result.candidates.map(x => x.time), ["10:00", "11:00"]);
  const semantic = parse("响应截止：2026-04-09\n投标截止：2026-04-09").submission;
  assert.equal(semantic.status, "CONFLICTING");
});

test("does not reinterpret office hours, announcement expiry, or other sections", () => {
  const input = "三、获取采购文件\n获取期限：2026-04-01至2026-04-07\n办公时间：每天09:00至17:00\n四、公告期限\n截止时间：2026-04-10 10:00\n须提交报名登记表。";
  const result = parse(input);
  assert.equal(result.documentAcquisition.time, null);
  assert.equal(result.documentAcquisition.date, "2026-04-07");
  assert.equal(result.registration.status, "UNKNOWN");
  assert.equal(result.submission.status, "UNKNOWN");
});

test("does not pick a winner when evidence is incomplete or provisional", () => {
  const input = "投标截止：2026-04-09 09:00\n投标截止：另行通知\n开启时间：2026-04-09 11:00（已取消）";
  assert.equal(parse(input).submission.status, "UNCERTAIN");
  assert.equal(parse(input).submission.date, undefined);
  assert.equal(parse(input).opening.status, "UNCERTAIN");
  assert.equal(parse("报名截止：" + "字".repeat(501) + "2026-04-09").registration.status, "UNCERTAIN");
});

test("omits ambiguous business fields and amounts with no explicit unit", () => {
  const result = parseNotice("项目名称：示例甲\n项目名称：示例乙\n预算金额：123\n采购人：虚构单位");
  assert.deepEqual(result.conflictingFields, ["projectName"]);
  assert.deepEqual(result.fields, { buyer: "虚构单位" });
  assert.deepEqual(parseNotice("预算金额：人民币1,250.50元").fields.budget, { amountFen: 125_050, currency: "CNY" });
  assert.equal(parseNotice("预算金额：999999999999999999万元").fields.budget, undefined);
});

test("validates string type, empty input and UTF-8 byte limits", () => {
  assert.throws(() => parseNotice(null), TypeError);
  assert.throws(() => parseNotice("   "), /empty/);
  assert.throws(() => parseNotice("字".repeat(Math.ceil(MAX_INPUT_BYTES / 3))), /1 MiB/);
});
