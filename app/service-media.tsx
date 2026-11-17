import { serviceVideoEmbed } from "../lib/service-presentation";
import { ServicePhotoCarousel } from "./service-photo-carousel";
import type { ServiceMediaPaths } from "../lib/service-media";

export function ServiceMedia({ service, urls, compact = false }: { service: ServiceMediaPaths & { name: string }; urls: Map<string, string>; compact?: boolean }) {
  const photos = [service.photo_path, ...(service.extra_photos ?? [])].flatMap(path => urls.get(path) ?? []);
  const embed = serviceVideoEmbed(service.video_url ?? "");
  const video = service.video_path ? `/api/service-video?${new URLSearchParams({ path: service.video_path })}` : null;
  if (!photos.length && !video && !embed) return null;
  return <div className={compact ? "service-media service-media-thumbnail" : "service-media"}>
    {photos.length > 0 && <ServicePhotoCarousel photos={photos} name={service.name} />}
    {embed ? <div className="service-video-embed" data-provider={embed.provider}>
      <iframe src={embed.src} title={`Vídeo de ${service.name} no ${embed.provider}`} loading="lazy"
        allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
      <a href={embed.href} target="_blank" rel="noopener noreferrer">Abrir no {embed.provider}</a>
    </div> : video && <video src={video} controls playsInline preload="metadata" aria-label={`Vídeo do serviço ${service.name}`} />}
  </div>;
}
