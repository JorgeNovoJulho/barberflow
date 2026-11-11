import { bookingCurrency } from "../../lib/public-booking";
import { showcaseOrderNumber } from "../../lib/showcase";

export function OrderCardHeading({ order, photo, label, status, alert = false }: {
  order: { order_number: number; product_name: string; product_sku: string; total_cents: number };
  photo?: string; label: string; status: string; alert?: boolean;
}) {
  return <span className="order-card-heading">
    {photo ? <img src={photo} alt="" width={72} height={72} loading="lazy" decoding="async" />
      : <span className="order-card-placeholder" aria-hidden="true">◇</span>}
    <span className="order-card-identity">
      <strong className="showcase-order-number">Pedido {showcaseOrderNumber(order.order_number)}</strong>
      <strong>{order.product_name}</strong>
      <small>{label}{order.product_sku && " · SKU " + order.product_sku}</small>
    </span>
    <span className="order-card-facts">
      <strong>{bookingCurrency.format(order.total_cents / 100)}</strong>
      <span className="order-status" role={alert ? "alert" : "status"} data-feedback={alert ? "warning" : undefined}>{status}</span>
    </span>
  </span>;
}
