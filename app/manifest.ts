import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "TOP BARBER", short_name: "TOP BARBER", lang: "pt-BR",
    start_url: "/", scope: "/", display: "standalone",
    background_color: "#f4f5fb", theme_color: "#151a34",
    icons: [192, 512].map(size => ({
      src: `/media/top-barber-pwa-${size}.png`, sizes: `${size}x${size}`, type: "image/png",
    })),
  };
}
