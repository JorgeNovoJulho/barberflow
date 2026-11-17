import { serviceMediaBucket } from "../../../lib/service-media-config";
import { supabaseServer } from "../../../lib/supabase";

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}-video$/.test(path)) return new Response(null, { status: 404 });

  const supabase = await supabaseServer();
  if (!supabase) return new Response(null, { status: 503 });
  const { data, error } = await supabase.storage.from(serviceMediaBucket).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return new Response(null, { status: 404 });

  const headers = new Headers();
  for (const name of ["range", "if-range"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const video = await fetch(data.signedUrl, { headers, cache: "no-store", signal: request.signal }).catch(() => null);
  if (!video || (!video.ok && video.status !== 416)) return new Response(null, { status: 502 });

  const responseHeaders = new Headers({ "Cache-Control": "private, no-store", "Accept-Ranges": "bytes" });
  for (const name of ["Content-Type", "Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
    const value = video.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(video.body, { status: video.status, headers: responseHeaders });
}
