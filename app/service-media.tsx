import type { ServiceMediaPaths } from "../lib/service-media";

export function ServiceMedia({ service, urls, compact = false }: { service: ServiceMediaPaths & { name: string }; urls: Map<string, string>; compact?: boolean }) {
  const photo = urls.get(service.photo_path);
  const video = service.video_path ? `/api/service-video?${new URLSearchParams({ path: service.video_path })}` : null;
  if (!photo && !video) return null;
  return <div className={compact ? "service-media service-media-thumbnail" : "service-media"}>
    {photo && <img src={photo} alt={`Foto do serviço ${service.name}`} loading="lazy" />}
    {video && <video src={video} controls playsInline preload="metadata" aria-label={`Vídeo do serviço ${service.name}`} />}
  </div>;
}
