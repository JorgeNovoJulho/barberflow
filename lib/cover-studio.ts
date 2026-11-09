export function isStudioCover(url: string | undefined) {
  return !!url && /\/storage\/v1\/object\/public\/barberflow-profile-media\/[0-9a-f-]{36}\/cover-studio-[0-9a-f-]{36}\.png$/.test(new URL(url).pathname);
}
