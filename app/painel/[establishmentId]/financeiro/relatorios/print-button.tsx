"use client";

export function PrintButton() {
  return <button className="primary" type="button" onClick={() => window.print()}>Imprimir relatório</button>;
}
