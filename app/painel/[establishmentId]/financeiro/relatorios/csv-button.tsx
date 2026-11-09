"use client";

type Cell = string | number;

function csvCell(value: Cell) {
  // Neutralize formulas in text fields before opening the export in a spreadsheet.
  const text = typeof value === "number" ? String(value).replace(".", ",")
    : /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function CsvButton({ filename, rows }: { filename: string; rows: Cell[][] }) {
  function download() {
    const csv = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <button type="button" className="secondary" onClick={download}>Exportar CSV</button>;
}
