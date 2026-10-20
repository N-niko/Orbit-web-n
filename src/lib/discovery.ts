import type { OrbitData, Post, Profile } from "./types";

export const visibilityLabels = {
  major: "Major", year: "Year & graduation year", bio: "About me",
  courses: "Courses", clubs: "Clubs", posts: "Posts",
} as const;
export type VisibilityField = keyof typeof visibilityLabels;
export type ProfileVisibility = Record<VisibilityField, boolean>;
export const defaultVisibility: ProfileVisibility = { major: true, year: true, bio: true, courses: true, clubs: true, posts: true };
export interface DemoClub {
  id: string; name: string; category: string; description: string; meeting: string; color: string; eventIds: string[];
}
export interface DirectoryPerson {
  profile: Profile;
  courses: string[] | null;
  clubIds: string[] | null;
  posts: (Pick<Post, "id" | "body" | "category" | "createdAt"> & { likeCount: number; commentCount: number })[] | null;
}
export type SearchTarget = { type: "person" | "club" | "event"; id: string };
export interface SearchResult extends SearchTarget { title: string; subtitle: string }

// Illustrative demo organizations and courses, not university directory records.
export const demoClubs: DemoClub[] = [
  { id: "design-collective", name: "Design Collective", category: "Arts & creativity", description: "A space for sketches, side projects, and people who see things a little differently. Bring a work in progress or just your curiosity.", meeting: "Wednesdays · Arts Building, Studio 204", color: "peach", eventIds: ["event-2"] },
  { id: "code-and-coffee", name: "Code & Coffee", category: "Technology & learning", description: "Make something small, solve a problem together, and meet students who like a good idea as much as a good coffee.", meeting: "Thursdays · Library collaboration room", color: "violet", eventIds: ["event-3"] },
  { id: "campus-film-club", name: "Campus Film Club", category: "Film & community", description: "Great films are even better with good company. Discover a new favorite, talk about the ending, and help choose the next movie.", meeting: "Tuesdays · Student Center", color: "green", eventIds: ["event-1"] },
];
const demoDetails: Record<string, { courses: string[]; clubIds: string[]; visibility?: Partial<ProfileVisibility> }> = {
  alex: { courses: ["Data Structures", "Web Development", "Statistics"], clubIds: ["code-and-coffee", "campus-film-club"] },
  maya: { courses: ["Design Studio", "Art History", "Sustainable Design"], clubIds: ["design-collective", "campus-film-club"] },
  jordan: { courses: ["Marketing", "Business Analytics", "Accounting"], clubIds: ["code-and-coffee", "campus-film-club"], visibility: { courses: false } },
  sam: { courses: ["Typography", "Visual Communication", "Digital Illustration"], clubIds: ["design-collective"], visibility: { clubs: false } },
};

/** Build the demo's visitor view before rendering or indexing any optional fields. */
export function buildDirectory(data: OrbitData, demo: boolean, ownVisibility = defaultVisibility) {
  const profiles = new Map<string, Profile>();
  for (const profile of [...data.posts.map(post => post.author), ...data.workspace.members, data.profile]) profiles.set(profile.id, profile);
  const clubs = demo ? demoClubs : [];
  const people: DirectoryPerson[] = [...profiles.values()].map(profile => {
    const details = demo ? demoDetails[profile.id] : undefined;
    const visibility = demo ? profile.id === data.profile.id ? ownVisibility : { ...defaultVisibility, ...details?.visibility } : defaultVisibility;
    // Never put email, residence hall, or other account-only fields into the visitor view.
    const visibleProfile: Profile = {
      id: profile.id, name: profile.name, university: profile.university, color: profile.color,
      avatarUrl: profile.avatarUrl, major: visibility.major ? profile.major : "",
      year: visibility.year ? profile.year : "", graduationYear: visibility.year ? profile.graduationYear : null,
      bio: visibility.bio ? profile.bio : "",
    };
    return { profile: visibleProfile,
      courses: details && visibility.courses ? details.courses : null,
      clubIds: details && visibility.clubs ? details.clubIds : null,
      posts: visibility.posts ? data.posts.filter(post => post.author.id === profile.id).map(post => ({ id: post.id, body: post.body,
        category: post.category, createdAt: post.createdAt, likeCount: post.likes.length, commentCount: post.comments.length })) : null,
    };
  });
  return { people, clubs, events: data.events };
}
export type Directory = ReturnType<typeof buildDirectory>;

const categoryPriority = { person: 0, club: 1, event: 2 };
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim().replace(/\s+/g, " ");
export function searchDirectory(directory: Directory, query: string, scope: "all" | SearchTarget["type"] = "all"): SearchResult[] {
  const words = normalize(query).split(" ").filter(Boolean);
  const candidates: (SearchResult & { text: string })[] = [
    ...directory.people.map(({ profile }) => ({ type: "person" as const, id: profile.id, title: profile.name,
      subtitle: profile.major || profile.university, text: `${profile.name} ${profile.major}` })),
    ...directory.clubs.map(club => ({ type: "club" as const, id: club.id, title: club.name, subtitle: club.category, text: `${club.name} ${club.category} ${club.description}` })),
    ...directory.events.map(event => ({ type: "event" as const, id: event.id, title: event.title, subtitle: event.location, text: `${event.title} ${event.description} ${event.location} ${event.category}` })),
  ];
  return candidates.filter(item => (scope === "all" || item.type === scope) && words.every(word => normalize(item.text).includes(word)))
    .sort((a, b) => categoryPriority[a.type] - categoryPriority[b.type] ||
      Number(!normalize(a.title).startsWith(normalize(query))) - Number(!normalize(b.title).startsWith(normalize(query))) || a.title.localeCompare(b.title))
    .slice(0, 24).map(({ text: _text, ...result }) => result);
}

export function visibleClubMembers(people: DirectoryPerson[], clubId: string) {
  return people.filter(person => person.clubIds?.includes(clubId));
}
