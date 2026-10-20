import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrbitData, Profile } from "@/lib/types";
import { AVATAR_BUCKET } from "@/lib/account";

/** Sign only images belonging to profiles already returned by the workspace RPC. */
export async function withAvatars(client: SupabaseClient, data: OrbitData): Promise<OrbitData> {
  const profiles: Profile[] = [data.profile, ...data.workspace.members,
    ...data.posts.flatMap(post => [post.author, ...post.comments.map(comment => comment.author)])];
  const paths = [...new Set(profiles.map(profile => profile.avatarPath).filter((path): path is string => Boolean(path)))];
  if (!paths.length) return data;
  const { data: urls } = await client.storage.from(AVATAR_BUCKET).createSignedUrls(paths, 3600);
  const signed = new Map(urls?.filter(item => item.signedUrl && item.path).map(item => [item.path, item.signedUrl]));
  for (const profile of profiles) profile.avatarUrl = profile.avatarPath ? signed.get(profile.avatarPath) || undefined : undefined;
  return data;
}
