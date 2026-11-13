"use client";
import { useState } from "react";
import PeekRating from "./PeekRating";

export function RatingField({ required = false }) {
  const [value, setValue] = useState(3);
  return <fieldset>
    <legend>Nota da avaliação</legend>
    <PeekRating value={value} count={5} labels={["Ruim", "Regular", "Bom", "Ótimo", "Excelente"]}
      size={32} lift={7} allowClear={!required} ariaLabel="Nota da avaliação" onChange={setValue} />
    <input type="hidden" name="stars" value={value} />
  </fieldset>;
}
