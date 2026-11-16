"use client";

import { useState } from "react";

export function RestoreShopFields({ shops }: { shops: { id: string; name: string }[] }) {
  const [shopId, setShopId] = useState(shops[0]?.id ?? "");
  const name = shops.find(shop => shop.id === shopId)?.name ?? "";
  return <>
    <label>Loja <select name="shop" required value={shopId} onChange={event => setShopId(event.target.value)}>
      {shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
    </select></label>
    <label>Nome da loja selecionada <input name="shop_name" value={name} readOnly autoComplete="off" /></label>
  </>;
}
