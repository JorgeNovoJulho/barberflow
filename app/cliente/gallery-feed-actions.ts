"use server";

import { httpsUrl } from "../../lib/business-profile";
import { isUuid } from "../../lib/establishments";
import { mediaLinks, socialSession } from "./social";

export type GalleryComment = { id: string; parent: string | null; body: string; name: string; avatar?: string; likes: number; dislikes: number; vote: number };
export type GalleryFeed = { likes: number; dislikes: number; vote: number; comments: GalleryComment[] };

export async function loadGalleryFeed(post: string): Promise<GalleryFeed | null> {
  if (!isUuid(post)) return null;
  const { supabase } = await socialSession();
  const { data, error } = await supabase.rpc("barberflow_gallery_feed", { post_id: post });
  if (error || !data) return null;
  const feed = data as Omit<GalleryFeed, "comments"> & { comments: (GalleryComment & { logo?: string })[] };
  const images = await mediaLinks(supabase, feed.comments.flatMap(({ avatar }) => avatar ? [avatar] : []));
  return { ...feed, comments: feed.comments.map(({ logo, ...comment }) => ({
    ...comment, avatar: (comment.avatar && images.get(comment.avatar)) || httpsUrl(logo),
  })) };
}

export async function galleryVote(post: string, comment: string | null, direction: 1 | -1) {
  if (!isUuid(post) || (comment !== null && !isUuid(comment)) || ![1, -1].includes(direction)) return false;
  const { supabase } = await socialSession();
  const { data, error } = await supabase.rpc("barberflow_gallery_vote", { post_id: post, comment_id: comment, direction });
  return !error && data === true;
}

export async function galleryComment(post: string, parent: string | null, raw: string) {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!isUuid(post) || (parent !== null && !isUuid(parent)) || !body || body.length > 500) return false;
  const { supabase } = await socialSession();
  const { error } = await supabase.from("barberflow_social_comments").insert({ photo: post, parent, body });
  return !error;
}

export async function reportGalleryComment(comment: string, reason: string) {
  if (!isUuid(comment) || typeof reason !== "string" || reason.trim().length < 3 || reason.length > 500) return false;
  const { supabase } = await socialSession();
  const { data, error } = await supabase.rpc("barberflow_report_feed_comment", { comment_id: comment, report_reason: reason });
  return !error && data === true;
}
