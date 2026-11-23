import * as XLSX from 'xlsx';

/**
 * Sanitize a cell value to prevent Excel formula injection.
 * Prefixes dangerous characters with a single quote.
 */
function sanitizeCell(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const dangerous = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerous.some((char) => value.startsWith(char))) {
    return `'${value}`;
  }
  return value;
}

/**
 * Convert data array to sanitized CSV string.
 */
export function toCSV(
  headers: string[],
  rows: Record<string, unknown>[]
): string {
  const headerLine = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',');

  const dataLines = rows.map((row) =>
    headers
      .map((h) => {
        const value = sanitizeCell(row[h]);
        if (value === null || value === undefined) return '""';
        const str = String(value);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  return [headerLine, ...dataLines].join('\n');
}

/**
 * Convert data array to Excel buffer.
 * All cell values are sanitized against formula injection.
 */
export function toExcel(
  headers: string[],
  rows: Record<string, unknown>[],
  sheetName = 'Report'
): Buffer {
  const sanitizedRows = rows.map((row) => {
    const sanitized: Record<string, unknown> = {};
    for (const h of headers) {
      sanitized[h] = sanitizeCell(row[h]);
    }
    return sanitized;
  });

  const worksheet = XLSX.utils.json_to_sheet(sanitizedRows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

