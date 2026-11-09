import type { ServiceMediaPaths } from "../lib/service-media";

export function ServiceMedia({ service, urls }: { service: ServiceMediaPaths & { name: string }; urls: Map<string, string> }) {
  const photo = urls.get(service.photo_path);
  const video = urls.get(service.video_path);
  if (!photo && !video) return null;
  return <div className="service-media">
    {photo && <img src={photo} alt={`Foto do serviço ${service.name}`} loading="lazy" />}
    {video && <video src={video} controls playsInline preload="metadata" aria-label={`Vídeo do serviço ${service.name}`} />}
  </div>;
}
