"use client";
export function PrintClosing({ label = "Imprimir relatório" }: { label?: string }) {
  return <button className="secondary finance-print-hide" type="button" onClick={()=>window.print()}>{label}</button>;
}
