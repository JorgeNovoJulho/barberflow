"use client";
export function PrintClosing() {
  return <button className="secondary finance-print-hide" type="button" onClick={()=>window.print()}>Imprimir relatório</button>;
}
