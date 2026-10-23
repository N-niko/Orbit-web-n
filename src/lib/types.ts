export type PostCategory = "general" | "question" | "marketplace";
export type EventCategory = "Social" | "Academic" | "Clubs" | "Wellness";

export interface Profile {
  id: string;
  name: string;
  email?: string;
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
  visibility?: { major: boolean; year: boolean; bio: boolean };
}

export interface Comment {
  id: string;
  author: Profile;
  body: string;
  createdAt: string;
}

export interface Post {
  id: string;
  author: Profile;
  body: string;
  category: PostCategory;
  createdAt: string;
  likes: string[];
  comments: Comment[];
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
  category: EventCategory;
  cover: string;
  attendees: string[];
  host: string;
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
}

export type OrbitAction =
  | { type: "create_post"; body: string; category: PostCategory }
  | { type: "toggle_like"; id: string }
  | { type: "add_comment"; id: string; body: string }
  | { type: "create_task"; title: string; assignee: string; dueDate: string; kind: "task" | "grocery" }
  | { type: "toggle_task"; id: string }
  | { type: "delete_task"; id: string }
  | { type: "create_expense"; title: string; amount: number; paidBy: string }
  | { type: "delete_expense"; id: string }
  | { type: "create_event"; title: string; description: string; location: string; startsAt: string; category: EventCategory; cover: string }
  | { type: "toggle_rsvp"; id: string }
  | { type: "update_profile"; name: string; major: string; year: string; bio: string }
  | { type: "update_visibility"; field: "major" | "year" | "bio"; visible: boolean }
  | { type: "join_workspace"; code: string }
  | { type: "create_workspace"; name: string };
