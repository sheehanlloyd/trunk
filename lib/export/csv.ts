/**
 * Pure CSV serialization for the export endpoints. No I/O, no deps — unit
 * tested in csv.test.ts. RFC 4180 shaped: CRLF row endings, fields quoted when
 * they contain delimiters/quotes/newlines, quotes doubled inside quoted fields.
 *
 * Spreadsheet safety: string cells that start with `=`, `+`, `-`, or `@` are
 * prefixed with a `'` so Excel/Sheets render them as text instead of executing
 * them as formulas (CSV formula injection). Numbers and booleans are never
 * prefixed — a negative number must stay a number.
 */

export interface CsvColumn {
  /** Property to read off each row object. */
  key: string;
  /** Header text for the column. */
  label: string;
}

/** Characters that force a field to be quoted. */
const NEEDS_QUOTING = /[",\r\n]/;

/** Leading characters spreadsheets interpret as a formula. */
const FORMULA_PREFIX = /^[=+\-@]/;

/** One value -> one escaped CSV field. */
function toCell(value: unknown): string {
  let text: string;
  if (value == null) {
    text = "";
  } else if (typeof value === "string") {
    // Formula-injection guard applies only to genuine strings; stringified
    // numbers like "-5" below must survive as numbers in the spreadsheet.
    text = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  } else if (typeof value === "object") {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }
  if (NEEDS_QUOTING.test(text)) {
    text = `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * Serializes rows into a CSV document: one header row from `columns` labels,
 * then one row per entry reading `columns[].key` off each object. Missing keys
 * become empty fields. Ends with a trailing CRLF.
 */
export function toCsv(
  rows: Record<string, unknown>[],
  columns: CsvColumn[],
): string {
  const lines = [columns.map((c) => toCell(c.label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => toCell(row[c.key])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
