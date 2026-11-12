// Copyright (c) 2026 Hao Sun
// SPDX-License-Identifier: MIT

export const MAX_INPUT_BYTES = 1024 * 1024;

const DATE = String.raw`(?<!\d)(?<year>\d{4})\s*(?:年\s*(?<cnMonth>\d{1,2})\s*月\s*(?<cnDay>\d{1,2})\s*[日号]|(?<separator>[-/.])\s*(?<month>\d{1,2})\s*\k<separator>\s*(?<day>\d{1,2})(?!\d))`;
const CLOCK = /^\s*(?:T|\(?北京时间\)?\s*)?(?<period>上午|下午|中午|凌晨|晚上)?\s*(?<hour>\d{1,2})(?::(?<minute>\d{2})(?::(?<second>\d{2}))?(?![\d:])|\s*[时点]\s*(?<cnMinute>\d{1,2})\s*分(?:\s*(?<cnSecond>\d{1,2})\s*秒)?)(?!\d)/u;
const CLOCK_FRAGMENT = /^\s*(?:T|\(?北京时间\)?\s*)?(?:(?:上午|下午|中午|凌晨|晚上)\s*)?(?:\d{1,2}\s*[:时点]|上午|下午|中午|凌晨|晚上|\d{1,2}\s*AM\b|\d{1,2}\s*PM\b)/iu;
const ZONE = /^\s*(?:Z\b|[+-]\d{2}:?\d{2}\b|UTC\b|GMT\b|AM\b|PM\b)/iu;
const RANGE_JOIN = /^\s*(?:至|到|[—–~]|-)\s*$/u;
const MAX_EVIDENCE_CHARS = 500;
const MAX_CANDIDATES = 20;

const slots = ["registration", "documentAcquisition", "supplierCollection", "submission", "opening"];
const registration = ["registration", "REGISTRATION_DEADLINE"];
const acquisition = ["documentAcquisition", "DOCUMENT_ACQUISITION_DEADLINE"];
const collection = ["supplierCollection", "SUPPLIER_COLLECTION_DEADLINE"];
const bid = ["submission", "BID_SUBMISSION_DEADLINE"];
const response = ["submission", "RESPONSE_SUBMISSION_DEADLINE"];
const quotation = ["submission", "QUOTATION_SUBMISSION_DEADLINE"];
const combined = ["submission", "BID_OR_RESPONSE_SUBMISSION_DEADLINE"];
const opening = ["opening", "OPENING_TIME"];

const explicitLabels = [
  [/^报名(?:登记)?(?:截止(?:日期|时间)?|结束时间|期限)$/u, registration],
  [/^(?:(?:招标|采购|谈判|磋商|询价)文件(?:获取|领取|下载|发售)|(?:获取|领取|下载|发售)(?:招标|采购|谈判|磋商|询价)文件)(?:截止(?:日期|时间)?|时间|期限)$/u, acquisition],
  [/^供应商(?:公开)?征集(?:截止(?:日期|时间)?|时间|期限)$/u, collection],
  [/^(?:投标\(响应\)|投标\/响应)(?:文件)?(?:(?:递交|提交))?截止(?:日期|时间)?$/u, combined],
  [/^(?:投标(?:文件)?(?:(?:递交|提交))?|(?:递交|提交)投标文件)截止(?:日期|时间)?$/u, bid],
  [/^(?:响应(?:文件)?(?:(?:递交|提交))?|(?:递交|提交)响应文件)截止(?:日期|时间)?$/u, response],
  [/^(?:报价(?:文件)?(?:(?:递交|提交))?|(?:递交|提交)报价文件)截止(?:日期|时间)?$/u, quotation],
  [/^(?:开标(?:\(谈判\))?|开启|响应文件开启)(?:日期|时间)$/u, opening]
];

const headings = [
  [/^(?:报名|报名登记)$/u, registration],
  [/^(?:获取|领取|下载)(?:招标|采购|谈判|磋商|询价)文件$/u, acquisition],
  [/^供应商(?:公开)?征集$/u, collection],
  [/^(?:(?:递交|提交)投标\(响应\)文件|投标\(响应\)文件(?:递交|提交))$/u, combined],
  [/^(?:(?:递交|提交)投标文件|投标文件(?:递交|提交))$/u, bid],
  [/^(?:(?:递交|提交)响应文件|响应文件(?:递交|提交))$/u, response],
  [/^(?:(?:递交|提交)报价文件|报价文件(?:递交|提交))$/u, quotation],
  [/^(?:开标(?:\(谈判\))?|开启|响应文件开启)(?:时间和地点|时间及地点)?$/u, opening]
];

const textFields = new Map([
  ["项目名称", "projectName"], ["采购项目名称", "projectName"],
  ["项目编号", "projectId"], ["采购项目编号", "projectId"], ["招标编号", "projectId"],
  ["采购人", "buyer"], ["采购单位", "buyer"], ["招标人", "buyer"],
  ["采购方式", "procurementMethod"], ["项目所在地", "region"], ["项目地区", "region"]
]);

function findLabel(rules, label) {
  return rules.find(([pattern]) => pattern.test(label))?.[1];
}

function sectionLabel(label, context) {
  if (!context) return null;
  const [slot] = context.type;
  const genericCutoff = /^截止(?:日期|时间)?$/u.test(label);
  if (slot === "opening") return /^(?:时间|日期)$/u.test(label) ? context.type : null;
  if (slot === "documentAcquisition" && /^(?:获取|领取)(?:期限|时间)$/u.test(label)) return context.type;
  if (slot === "registration" && /^(?:时间|期限)$/u.test(label)) return context.type;
  return genericCutoff ? context.type : null;
}

function cleanDate(groups) {
  const year = Number(groups.year);
  const month = Number(groups.cnMonth || groups.month);
  const day = Number(groups.cnDay || groups.day);
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return [String(year), padded(month), padded(day)].join("-");
}

function padded(value) {
  return String(value).padStart(2, "0");
}

function cleanClock(groups) {
  let hour = Number(groups.hour);
  const minute = Number(groups.minute ?? groups.cnMinute);
  const seconds = groups.second ?? groups.cnSecond;
  if (hour > 23 || minute > 59 || Number(seconds) > 59) return null;
  if (groups.period) {
    if (hour < 1 || hour > 12) return null;
    const isPM = ["下午", "中午", "晚上"].includes(groups.period);
    hour = (hour % 12) + (isPM ? 12 : 0);
  }
  return [padded(hour), padded(minute), ...(seconds === undefined ? [] : [padded(seconds)])].join(":");
}

function dateMentions(value) {
  const matches = [...value.matchAll(new RegExp(DATE, "gu"))];
  const mentions = matches.map((match, index) => {
    const tailIndex = match.index + match[0].length;
    const tail = value.slice(tailIndex, matches[index + 1]?.index);
    const clock = tail.match(CLOCK);
    const time = clock ? cleanClock(clock.groups) : null;
    const consumed = clock?.[0].length || 0;
    const date = cleanDate(match.groups);
    const rest = tail.slice(consumed);
    const malformed = !date || (clock ? !time || ZONE.test(rest) : CLOCK_FRAGMENT.test(tail) || ZONE.test(tail));
    return { index: match.index, end: tailIndex + consumed, date, time, malformed };
  });
  // Bind only an explicit two-endpoint range to its end.
  if (mentions.length === 2) {
    const [start, end] = mentions;
    if (RANGE_JOIN.test(value.slice(start.end, end.index))) {
      const reversed = start.date > end.date || (start.date === end.date && start.time && end.time && start.time > end.time);
      return [{ ...end, malformed: start.malformed || end.malformed || Boolean(reversed) }];
    }
  }
  return mentions;
}

function evidenceAt(text, line) {
  const trimmed = text.trim();
  return { line, text: trimmed.slice(0, MAX_EVIDENCE_CHARS), ...(trimmed.length > MAX_EVIDENCE_CHARS ? { truncated: true } : {}) };
}

function recordDeadline(state, type, value, evidence) {
  const [, semanticType] = type;
  if (evidence.label.truncated || /已取消|已作废|暂缓|另行通知|以.{1,20}为准/u.test(value)) {
    state.unresolved = true;
    return;
  }
  const mentions = dateMentions(value);
  if (!mentions.length || mentions.some(mention => mention.malformed)) state.unresolved = true;
  for (const mention of mentions) {
    if (mention.malformed) continue;
    const { date, time } = mention;
    const key = [semanticType, date, time].join("|");
    if (state.candidates.has(key)) continue;
    if (state.candidates.size >= MAX_CANDIDATES) {
      state.truncated = true;
      break;
    }
    state.candidates.set(key, { semanticType, date, time, precision: time ? "DATETIME" : "DATE_ONLY", evidence });
  }
}

function resultFor({ candidates, unresolved, truncated }) {
  const values = [...candidates.values()];
  const status = values.length > 1 ? "CONFLICTING" : unresolved ? "UNCERTAIN" : values.length ? "FOUND" : "UNKNOWN";
  return { status, ...(status === "FOUND" ? values[0] : {}), candidates: values, ...(truncated ? { truncated: true } : {}) };
}

function budget(value) {
  const match = value.match(/^\s*(?:(?:人民币|CNY|[¥￥])\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(万元|元)\s*[。.]?\s*$/u);
  if (!match) return null;
  const [whole, fraction = ""] = match[1].replaceAll(",", "").split(".");
  const fen = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  const multiplier = match[2] === "万元" ? 10000 : 1;
  return Number.isSafeInteger(fen * multiplier) ? { amountFen: fen * multiplier, currency: "CNY" } : null;
}

export function parseNotice(text) {
  if (typeof text !== "string") throw new TypeError("Notice input must be a string.");
  if (Buffer.byteLength(text, "utf8") > MAX_INPUT_BYTES) throw new RangeError("Notice exceeds the 1 MiB UTF-8 limit.");
  if (!text.trim()) throw new TypeError("Notice input is empty.");

  const fields = {};
  const conflictingFields = new Set();
  const states = Object.fromEntries(slots.map(slot => [slot, { candidates: new Map(), unresolved: false, truncated: false }]));
  const remember = (key, value) => {
    if (conflictingFields.has(key)) return;
    if (Object.hasOwn(fields, key) && JSON.stringify(fields[key]) !== JSON.stringify(value)) {
      delete fields[key];
      conflictingFields.add(key);
    } else fields[key] = value;
  };

  let section = null;
  for (const [index, raw] of text.split(/\r\n|\n|\r/u).entries()) {
    const line = raw.normalize("NFKC").trim();
    if (!line) continue;
    const current = evidenceAt(raw, index + 1);
    const topHeading = /^(?:第[一二三四五六七八九十]+[章节]|[一二三四五六七八九十]+[、.])\s*/u;
    if (topHeading.test(line)) section = null;
    const content = line.replace(topHeading, "").replace(/^\d{1,2}[、.]\s*/u, "");
    const pair = content.match(/^([^:：]{1,48})[:：]\s*(.*)$/u);
    if (!pair) {
      const headingType = findLabel(headings, content);
      section = headingType ? { type: headingType, evidence: current } : null;
      continue;
    }
    const [, rawLabel, value] = pair;
    const label = rawLabel.replace(/\s+/gu, "");
    const explicit = findLabel(explicitLabels, label);
    const headingType = findLabel(headings, label);
    const type = explicit || sectionLabel(label, section);
    if (type) {
      const evidence = { label: current, ...(explicit ? {} : { section: section.evidence }) };
      recordDeadline(states[type[0]], type, value, evidence);
      continue;
    }
    if (headingType) section = { type: headingType, evidence: current };
    const key = textFields.get(label);
    if (key && value.trim() && value.length <= MAX_EVIDENCE_CHARS) remember(key, value.trim());
    if (/^(?:采购预算|预算金额|项目预算)$/u.test(label)) {
      const amount = budget(value);
      if (amount) remember("budget", amount);
    }
  }

  return {
    schemaVersion: 1,
    fields,
    conflictingFields: [...conflictingFields],
    deadlines: Object.fromEntries(slots.map(slot => [slot, resultFor(states[slot])]))
  };
}
