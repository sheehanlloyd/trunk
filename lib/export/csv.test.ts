import { describe, expect, it } from "vitest";

import { toCsv, type CsvColumn } from "./csv";

const columns: CsvColumn[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
];

describe("toCsv", () => {
  it("emits a header row plus one CRLF-terminated line per row", () => {
    const csv = toCsv(
      [
        { name: "Jane", phone: "5551234567" },
        { name: "Bob", phone: "5559876543" },
      ],
      columns,
    );
    expect(csv).toBe("Name,Phone\r\nJane,5551234567\r\nBob,5559876543\r\n");
  });

  it("returns only the header when there are no rows", () => {
    expect(toCsv([], columns)).toBe("Name,Phone\r\n");
  });

  it("quotes fields containing commas, quotes, and newlines", () => {
    const csv = toCsv(
      [{ name: 'Acme "HVAC", Inc.', phone: "line one\nline two" }],
      columns,
    );
    expect(csv).toBe(
      'Name,Phone\r\n"Acme ""HVAC"", Inc.","line one\nline two"\r\n',
    );
  });

  it("renders null, undefined, and missing keys as empty fields", () => {
    const csv = toCsv([{ name: null, phone: undefined }, {}], columns);
    expect(csv).toBe("Name,Phone\r\n,\r\n,\r\n");
  });

  it("prefixes strings starting with =, +, -, or @ to block formula injection", () => {
    const rows = [
      { name: "=1+2", phone: "+15551234567" },
      { name: "-cmd", phone: "@SUM(A1)" },
    ];
    const csv = toCsv(rows, columns);
    expect(csv).toBe("Name,Phone\r\n'=1+2,'+15551234567\r\n'-cmd,'@SUM(A1)\r\n");
  });

  it("does not formula-prefix negative numbers or booleans", () => {
    const csv = toCsv(
      [{ name: -42, phone: true }],
      columns,
    );
    expect(csv).toBe("Name,Phone\r\n-42,true\r\n");
  });

  it("quotes a formula-guarded field that also contains a comma", () => {
    const csv = toCsv([{ name: "=a,b", phone: "x" }], columns);
    expect(csv).toBe('Name,Phone\r\n"\'=a,b",x\r\n');
  });

  it("serializes objects as JSON", () => {
    const csv = toCsv([{ name: { a: 1 }, phone: "x" }], columns);
    expect(csv).toBe('Name,Phone\r\n"{""a"":1}",x\r\n');
  });

  it("escapes header labels too", () => {
    const csv = toCsv([], [{ key: "a", label: 'Weird, "label"' }]);
    expect(csv).toBe('"Weird, ""label"""\r\n');
  });
});
