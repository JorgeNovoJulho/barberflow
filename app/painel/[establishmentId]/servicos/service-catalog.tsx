import Link from "next/link";
import { SubmitButton } from "../../../auth/submit";
import { changeServiceAvailability, deleteService, moveService, saveService } from "../../actions";
import { PanelStatus } from "../../status";
import { ServiceMedia } from "../../../service-media";
import { serviceMediaUrls, type ServiceMediaPaths } from "../../../../lib/service-media";
import { productImageTypes, productVideoTypes } from "../../../../lib/product-media";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Service = ServiceMediaPaths & {
  id: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  display_order: number;
  duration_minutes: number;
  active: boolean;
};

function ServiceForm({ establishmentId, service, team, nextOrder = 1 }: { establishmentId: string; service?: Service; team: boolean; nextOrder?: number }) {
  return <form className="account-form" action={saveService.bind(null, establishmentId, service?.id ?? null, team)}>
    <label>Nome <input name="name" required maxLength={120} defaultValue={service?.name} /></label>
    <label>Descrição <textarea name="description" maxLength={1000} rows={3} defaultValue={service?.description} /></label>
    <label>Categoria <input name="category" maxLength={80} defaultValue={service?.category} /></label>
    <fieldset>
      <legend>Foto e vídeo</legend>
      <label>{service?.photo_path ? "Substituir foto" : "Enviar foto"} <input type="file" name="photo" accept={productImageTypes.join(",")} /></label>
      <small>JPG, PNG, WebP ou AVIF, até 5 MB.</small>
      {service?.photo_path && <label><input type="checkbox" name="remove_photo" /> Remover foto salva</label>}
      <label>{service?.video_path ? "Substituir vídeo" : "Enviar vídeo"} <input type="file" name="video" accept={productVideoTypes.join(",")} /></label>
      <small>MP4 ou WebM, até 15 MB. Os arquivos são enviados ao salvar.</small>
      {service?.video_path && <label><input type="checkbox" name="remove_video" /> Remover vídeo salvo</label>}
    </fieldset>
    <div className="form-columns">
      <label>Valor (R$) <input name="price" inputMode="decimal" required placeholder="0,00"
        defaultValue={service ? (service.price_cents / 100).toFixed(2).replace(".", ",") : undefined} /></label>
      <label>Duração (min) <input name="duration" type="number" min={1} max={1440} required defaultValue={service?.duration_minutes ?? 30} /></label>
    </div>
    <label>Ordem no catálogo <input name="order" type="number" min={0} max={9999} defaultValue={service?.display_order ?? nextOrder} required /></label>
    <SubmitButton>Salvar serviço</SubmitButton>
  </form>;
}

export async function ServiceCatalog({ establishmentId, name, services, failed, estado, team = false }: {
  establishmentId: string; name: string; services: Service[]; failed: boolean; estado?: string; team?: boolean;
}) {
  const urls = await serviceMediaUrls(services);
  const occupiedOrders = new Set(services.map(({ display_order }) => display_order));
  let nextOrder = services.length + 1;
  while (occupiedOrders.has(nextOrder) && nextOrder <= 9999) nextOrder += 1;
  return <section className="container section">
    <Link href={team ? `/equipe/${establishmentId}` : "/painel"}>{team ? "Voltar à equipe" : "Meus estabelecimentos"}</Link>
    <p className="eyebrow">{name}</p>
    <h1>Serviços</h1>
    <PanelStatus status={estado} />
    {failed ? <p role="alert">Não foi possível carregar os serviços.</p> : <>
      <details className="card panel-form">
        <summary>Novo serviço</summary>
        <ServiceForm key={nextOrder} establishmentId={establishmentId} team={team} nextOrder={nextOrder} />
      </details>
      <h2>Catálogo</h2>
      <p>A ordem dos serviços ativos também aparece na página pública.</p>
      {services?.length ? <ul className="cards">
        {services.map((service: Service, index) => <li className="card" key={service.id}>
          <h3>{service.name}</h3>
          <ServiceMedia service={service} urls={urls} />
          <p>{currency.format(service.price_cents / 100)} · {service.duration_minutes} min · {service.active ? "Ativo" : "Arquivado"}</p>
          {service.category && <p>{service.category}</p>}
          {service.description && <p>{service.description}</p>}
          <details><summary>Editar serviço</summary><ServiceForm establishmentId={establishmentId} team={team} service={service} /></details>
          {service.active && <div className="account-links">
            {([-1, 1] as const).map((step) => {
              const neighbor = services[index + step];
              const label = step === -1 ? "Mover para cima" : "Mover para baixo";
              return neighbor?.active ? <form key={step} aria-label={`${label}: ${service.name}`}
                action={moveService.bind(null, establishmentId, service.id, neighbor.id, step, team)}>
                <SubmitButton>{label}</SubmitButton>
              </form> : <button key={step} className="secondary" type="button" disabled>{label}</button>;
            })}
          </div>}
          <form className="account-links" action={changeServiceAvailability.bind(null, establishmentId, service.id, !service.active, team)}>
            <SubmitButton>{service.active ? "Arquivar serviço" : "Reativar serviço"}</SubmitButton>
          </form>
          <details>
            <summary>Excluir serviço</summary>
            <p>O serviço sairá do catálogo. Agendamentos e registros anteriores serão preservados.</p>
            <form className="account-links" action={deleteService.bind(null, establishmentId, service.id, team)}>
              <SubmitButton>Confirmar exclusão</SubmitButton>
            </form>
          </details>
        </li>)}
      </ul> : <p>Nenhum serviço cadastrado.</p>}
    </>}
  </section>;
}
