"use client";

import { useEffect, useState } from "react";
import { SubmitButton } from "../../../auth/submit";
import { SubscriptionProofPreview } from "../../../subscription-review-ui";

export function ProofUpload({ action, highlight }: {
  action: (form: FormData) => Promise<void>; highlight: boolean;
}) {
  const [preview, setPreview] = useState<{ url: string; pdf: boolean }>();
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  return <form className="account-form" action={action}>
    <label className={highlight && !preview ? "subscription-proof-attention" : undefined}>
      Depois de pagar, escolha o comprovante (PDF, JPG, JPEG, PNG, BMP ou WebP, até 5 MB)
      <input name="proof" type="file" accept=".pdf,.jpg,.jpeg,.png,.bmp,.webp" required onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        setPreview(file ? { url: URL.createObjectURL(file), pdf: /\.pdf$/i.test(file.name) } : undefined);
      }} />
    </label>
    {preview && <SubscriptionProofPreview src={preview.url} pdf={preview.pdf} />}
    <SubmitButton>Enviar comprovante</SubmitButton>
  </form>;
}
