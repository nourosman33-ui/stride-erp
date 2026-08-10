/** RFC4180-style CSV: values are quoted whenever they contain a comma, quote,
 * or newline, and embedded quotes are doubled. No external dependency needed
 * for something this small. */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (value: string | number | null): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  // Leading BOM so Excel opens UTF-8 CSVs (e.g. Arabic category names) without mangling.
  return "﻿" + lines.join("\r\n");
}
