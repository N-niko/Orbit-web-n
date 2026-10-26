import type { Attachment, PostResponse } from "./post-social";

export type PostCategory = "general" | "question" | "marketplace";
export type PostAudience = "public" | "followers" | "legacy";
export type EventCategory = "Social" | "Academic" | "Clubs" | "Wellness";

export interface Profile {
  id: string;
  name: string;
  email?: string;
  postCount?: number;
  university: string;
  major: string;
  year: string;
  bio: string;
  color: string;
  graduationYear?: number | null;
  residency?: "commuter" | "resident" | null;
  residenceHall?: string | null;
  avatarPath?: string | null;
  avatarUrl?: string;
  onboardingCompletedAt?: string | null;
  visibility?: { major: boolean; year: boolean; bio: boolean; posts?: boolean };
}

export interface Comment {
  id: string;
  author: Profile;
  body: string;
  createdAt: string;
  parentId?: string | null;
  replyToId?: string | null;
  replyToName?: string | null;
  likes?: string[];
  likeCount?: number;
  liked?: boolean;
}

export interface Post {
  id: string;
  author: Profile;
  body: string;
  category: PostCategory;
  audience?: PostAudience;
  createdAt: string;
  likes: string[];
  comments: Comment[];
  attachments?: Attachment[];
}

export interface Task {
  id: string;
  title: string;
  assignee: string;
  dueDate: string;
  completed: boolean;
  kind: "task" | "grocery";
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  paidBy: string;
  createdAt: string;
}

export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt?: string | null;
  createdAt?: string;
  audience?: "public" | "workspace" | "club";
  followingHost?: boolean;
  clubColor?: string | null;
  category: EventCategory;
  cover: string;
  attendees: string[];
  host: string;
  hostName?: string;
  clubId?: string | null;
  clubName?: string | null;
  attendeeCount?: number;
  response?: "going" | "not_going" | null;
  removed?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  inviteCode: string;
  members: Profile[];
}

export interface OrbitData {
  profile: Profile;
  workspace: Workspace;
  posts: Post[];
  tasks: Task[];
  expenses: Expense[];
  events: CampusEvent[];
  feed?: import("./feed").FeedPage;
}

export type OrbitAction =
  | { type: "create_post"; id?: string; body: string; audience?: "public" | "followers"; category?: PostCategory; attachmentIds?: string[]; attachments?: Attachment[] }
  | { type: "respond_post"; id: string; action: PostResponse }
  | { type: "toggle_like"; id: string }
  | { type: "add_comment"; id: string; body: string }
  | { type: "create_task"; title: string; assignee: string; dueDate: string; kind: "task" | "grocery" }
  | { type: "toggle_task"; id: string }
  | { type: "delete_task"; id: string }
  | { type: "create_expense"; title: string; amount: number; paidBy: string }
  | { type: "delete_expense"; id: string }
  | { type: "create_event"; id?: string; title: string; description: string; location: string; startsAt: string; endsAt: string; category: EventCategory; cover: string }
  | { type: "edit_event_schedule"; id: string; startsAt: string; endsAt: string }
  | { type: "toggle_rsvp"; id: string }
  | { type: "respond_event"; id: string; response: "going" | "not_going" }
  | { type: "remove_event" | "restore_event"; id: string }
  | { type: "create_club_event"; id: string; clubId: string; title: string; description: string; location: string; startsAt: string; endsAt: string; cover: string }
  | { type: "update_profile"; name: string; major: string; year: string; bio: string }
  | { type: "update_visibility"; field: "major" | "year" | "bio" | "posts"; visible: boolean }
  | { type: "join_workspace"; code: string }
  | { type: "create_workspace"; name: string };
