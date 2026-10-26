import { applyPostResponse } from "./post-social";
import { eventStatus } from "./events";
import type { OrbitAction, OrbitData, Profile } from "./types";

/** All people, conversations, and activity in the demo are fictional. */
export function createDemoData(now = new Date()): OrbitData {
  const at = (days: number, hour: number, minute = 0) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const day = (offset: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  };
  const members: Profile[] = [
    { id: "alex", name: "Alex Morgan", email: "alex@example.com", university: "Caldwell University", major: "Computer Science", year: "Junior", bio: "Usually at the library, occasionally making a very good playlist.", color: "#e9e3ff" },
    { id: "maya", name: "Maya Patel", university: "Caldwell University", major: "Architecture", year: "Sophomore", bio: "Studio days, matcha breaks, and finding the best corners of campus.", color: "#f8e1d3" },
    { id: "jordan", name: "Jordan Lee", university: "Caldwell University", major: "Business", year: "Junior", bio: "Coffee runs and pickup basketball. Happy to help with a spreadsheet.", color: "#e0eafa" },
    { id: "sam", name: "Sam Rivera", university: "Caldwell University", major: "Graphic Design", year: "Senior", bio: "Making things, meeting people, and trying every campus coffee spot.", color: "#e2ecd9" },
  ];
  const [alex, maya, jordan, sam] = members;

  return {
    profile: alex,
    workspace: { id: "workspace-1", name: "The Maple House", inviteCode: "MAPLEHOUSE026", members },
    posts: [
      { id: "post-1", author: maya, body: "Anyone up for a library study session? 📚\nHeading to the second floor around 3. Bring your to-do list — I’ll bring the snacks.", category: "general", createdAt: ago(24), likes: ["jordan", "sam"], comments: [{ id: "comment-1", author: jordan, body: "Count me in! Saving a seat by the windows?", createdAt: ago(16) }] },
      { id: "post-2", author: jordan, body: "Sunday reset, Maple House edition 🌿\nFresh groceries, a clean kitchen, and absolutely no unread group chat messages. We can dream.", category: "general", createdAt: ago(95), likes: ["alex", "maya", "sam"], comments: [{ id: "comment-2", author: sam, body: "I can handle the kitchen after class 🙌", createdAt: ago(72) }] },
      { id: "post-3", author: sam, body: "Does anyone know a quiet spot on campus for a video interview? Ideally somewhere I can book for an hour.", category: "question", createdAt: ago(180), likes: ["maya"], comments: [{ id: "comment-3", author: alex, body: "The library has individual study rooms — check the desk for availability!", createdAt: ago(145) }] },
      { id: "post-4", author: alex, body: "Passing along my desk lamp before I upgrade my setup. Great condition, warm light. $12 — message me when you see me around campus.", category: "marketplace", createdAt: ago(280), likes: ["jordan"], comments: [] },
    ],
    tasks: [
      { id: "task-1", title: "Take out the recycling", assignee: "alex", dueDate: day(0), completed: false, kind: "task" },
      { id: "task-2", title: "Give the kitchen a little reset", assignee: "sam", dueDate: day(0), completed: false, kind: "task" },
      { id: "task-3", title: "Water our plant family", assignee: "maya", dueDate: day(1), completed: false, kind: "task" },
      { id: "task-4", title: "Pay the internet bill", assignee: "jordan", dueDate: day(2), completed: true, kind: "task" },
      { id: "task-5", title: "Oat milk", assignee: "maya", dueDate: day(0), completed: false, kind: "grocery" },
      { id: "task-6", title: "Coffee beans", assignee: "alex", dueDate: day(0), completed: false, kind: "grocery" },
      { id: "task-7", title: "Dish soap", assignee: "sam", dueDate: day(1), completed: true, kind: "grocery" },
    ],
    expenses: [
      { id: "expense-1", title: "Weekly groceries", amount: 38.5, paidBy: "maya", createdAt: ago(120) },
      { id: "expense-2", title: "Internet", amount: 24, paidBy: "jordan", createdAt: ago(1440) },
      { id: "expense-3", title: "Cleaning supplies", amount: 16.75, paidBy: "alex", createdAt: ago(2880) },
    ],
    events: [
      { id: "event-1", title: "Campus movie night", description: "A cozy evening, a crowd favorite, and plenty of popcorn. Bring a blanket and your favorite people.", location: "The Quad · Student Center", startsAt: at(1, 19), endsAt: at(1,21), audience:"public", createdAt:ago(60), category: "Social", cover: "violet", attendees: ["maya", "jordan", "sam"], host: "jordan",hostName:"Jordan Lee" },
      { id: "event-2", title: "Design collective", description: "An open studio for curious minds. Share something you’re working on, swap ideas, or just come to get inspired.", location: "Arts Building · Studio 204", startsAt: at(2, 17, 30), endsAt:at(2,19,30), clubId:"design-collective", audience:"club", createdAt:ago(10), category: "Clubs", cover: "peach", attendees: ["sam", "maya"], host: "sam",hostName:"Sam Rivera" },
      { id: "event-3", title: "Coffee & catchup", description: "Start the morning slowly. Meet a few new faces over coffee and talk about whatever’s on your mind.", location: "Maple Café", startsAt: at(3,23), endsAt:at(4,1), audience:"public", createdAt:ago(80), category: "Wellness", cover: "green", attendees: ["alex", "jordan"], host: "maya",hostName:"Maya Patel" },
      {id:"event-4",title:"Open study lounge",description:"Drop in while the session is running. Bring your notes and a question.",location:"Library lounge",startsAt:ago(30),endsAt:new Date(now.getTime()+5400000).toISOString(),createdAt:ago(120),audience:"public",category:"Academic",cover:"blue",attendees:[],host:"alex",hostName:"Alex Morgan"},
      {id:"event-5",title:"Yesterday’s campus walk",description:"A past event with your response saved.",location:"Campus green",startsAt:ago(1500),endsAt:ago(1440),createdAt:ago(2000),audience:"public",category:"Wellness",cover:"green",attendees:["alex"],response:"going",host:"maya",hostName:"Maya Patel"},
    ],
  };
}

function nextId(prefix: string, ids: string[]): string {
  const largest = ids.reduce((max, id) => {
    const value = Number(id.startsWith(`${prefix}-`) ? id.slice(prefix.length + 1) : 0);
    return Number.isSafeInteger(value) ? Math.max(max, value) : max;
  }, 0);
  return `${prefix}-${largest + 1}`;
}

function required(value: string, label: string, max: number): string {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required.`);
  if (clean.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return clean;
}

function requireMember(data: OrbitData, id: string): void {
  if (!data.workspace.members.some((member) => member.id === id)) {
    throw new Error("Choose someone in your workspace.");
  }
}

/** Returns new state without mutating the previous state; pass `now` for deterministic tests. */
export function applyDemoAction(data: OrbitData, action: OrbitAction, now = new Date()): OrbitData {
  const id = data.profile.id;
  const createdAt = now.toISOString();

  switch (action.type) {
    case "update_visibility":
      return { ...data, profile: { ...data.profile, visibility: { major: true, year: true, bio: true, posts: true, ...data.profile.visibility, [action.field]: action.visible } } };
    case "create_post": {
      if (!action.body.trim() && !action.attachments?.length) throw new Error("Write a post or attach a file.");
      if (action.body.trim().length > 3000 || (action.attachments?.length ?? 0)>4) throw new Error("This post is too large.");
      if (action.id && data.posts.some(post=>post.id===action.id)) return data;
      return { ...data, posts: [{ id: action.id ?? nextId("post", data.posts.map(post=>post.id)), author: data.profile, body: action.body.trim(), category: "general", audience:action.audience??"public", createdAt, likes: [], comments: [], attachments: action.attachments ?? [] }, ...data.posts] };
    }
    case "respond_post": {
      const response=action.action.type==="comment"?{...action.action,body:required(action.action.body,"Comment",1000)}:action.action;
      return {...data,posts:data.posts.map(post=>post.id===action.id?applyPostResponse(post,data.profile,response):post)};
    }
    case "toggle_like":
      return { ...data, posts: data.posts.map((post) => post.id === action.id ? { ...post, likes: post.likes.includes(id) ? post.likes.filter((like) => like !== id) : [...post.likes, id] } : post) };
    case "add_comment": {
      const body = required(action.body, "Comment", 1000);
      const commentId = nextId("comment", data.posts.flatMap((post) => post.comments.map((comment) => comment.id)));
      return { ...data, posts: data.posts.map((post) => post.id === action.id ? { ...post, comments: [...post.comments, { id: commentId, author: data.profile, body, createdAt }] } : post) };
    }
    case "create_task": {
      requireMember(data, action.assignee);
      const dueDate = new Date(`${action.dueDate}T12:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(action.dueDate) || !Number.isFinite(dueDate.getTime()) || dueDate.toISOString().slice(0, 10) !== action.dueDate) throw new Error("Choose a valid due date.");
      return { ...data, tasks: [...data.tasks, { id: nextId("task", data.tasks.map((task) => task.id)), title: required(action.title, "Item", 160), assignee: action.assignee, dueDate: action.dueDate, completed: false, kind: action.kind }] };
    }
    case "toggle_task":
      return { ...data, tasks: data.tasks.map((task) => task.id === action.id ? { ...task, completed: !task.completed } : task) };
    case "delete_task":
      return { ...data, tasks: data.tasks.filter((task) => task.id !== action.id) };
    case "create_expense": {
      requireMember(data, action.paidBy);
      if (!Number.isFinite(action.amount) || action.amount <= 0 || action.amount > 100_000) throw new Error("Enter an amount between $0.01 and $100,000.");
      const amount = Math.round((action.amount + Number.EPSILON) * 100) / 100;
      if (amount < 0.01) throw new Error("Enter an amount of at least $0.01.");
      return { ...data, expenses: [{ id: nextId("expense", data.expenses.map((expense) => expense.id)), title: required(action.title, "Expense", 160), amount, paidBy: action.paidBy, createdAt }, ...data.expenses] };
    }
    case "delete_expense":
      return { ...data, expenses: data.expenses.filter((expense) => expense.id !== action.id) };
    case "create_club_event":
    case "create_event": {
      const startsAt = new Date(action.startsAt); const endsAt=new Date(action.endsAt);
      if(!Number.isFinite(endsAt.getTime())||endsAt<=startsAt)throw new Error("End time must be after start time.");
      if (!Number.isFinite(startsAt.getTime())) throw new Error("Choose a valid event date and time.");
      if (action.description.trim().length > 3000) throw new Error("Description must be 3000 characters or fewer.");
      if (action.id && data.events.some(event => event.id === action.id)) return data;
      return { ...data, events: [...data.events, { id: action.id ?? nextId("event", data.events.map((event) => event.id)), title: required(action.title, "Event name", 160), description: action.description.trim(), location: required(action.location, "Location", 160), startsAt: startsAt.toISOString(), endsAt:endsAt.toISOString(), createdAt, audience:action.type==="create_club_event"?"club" as const:"public" as const, category: action.type === "create_club_event" ? "Clubs" : action.category, ...(action.type === "create_club_event" ? { clubId: action.clubId } : {}), cover: action.cover, attendees: [], host: id,hostName:data.profile.name }].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) };
    }
    case "edit_event_schedule": {
      const event=data.events.find(e=>e.id===action.id);if(!event||event.host!==id)throw new Error("Only the event creator can edit its schedule.");
      if(!Number.isFinite(Date.parse(action.startsAt))||!Number.isFinite(Date.parse(action.endsAt))||Date.parse(action.endsAt)<=Date.parse(action.startsAt))throw new Error("End time must be after start time.");
      return {...data,events:data.events.map(e=>e.id===action.id?{...e,startsAt:action.startsAt,endsAt:action.endsAt}:e)};
    }
    case "toggle_rsvp":
    case "respond_event": {
      const event=data.events.find(e=>e.id===action.id);if(!event)throw new Error("Event not found.");
      if(eventStatus(event,now.getTime())==="past")throw new Error("This event has ended. Your previous response is saved.");
      const response=action.type==="respond_event"?action.response:event.attendees.includes(id)?"not_going":"going";
      return {...data,events:data.events.map(e=>e.id===action.id?{...e,response,removed:false,attendees:response==="going"?[...new Set([...e.attendees,id])]:e.attendees.filter(user=>user!==id),attendeeCount:undefined}:e)};
    }
    case "remove_event":
      if (!data.events.some(event => event.id === action.id && event.response === "not_going")) throw new Error("Choose Not going before removing an event.");
      return { ...data, events: data.events.map(event => event.id === action.id ? { ...event, removed: true } : event) };
    case "restore_event":
      return { ...data, events: data.events.map(event => event.id === action.id ? { ...event, removed: false } : event) };
    case "update_profile": {
      const profile = { ...data.profile, name: required(action.name, "Name", 80), major: action.major.trim(), year: action.year.trim(), bio: action.bio.trim() };
      if (profile.major.length > 100 || profile.year.length > 40 || profile.bio.length > 500) throw new Error("One of your profile fields is too long.");
      return {
        ...data,
        profile,
        workspace: { ...data.workspace, members: data.workspace.members.map((member) => member.id === id ? profile : member) },
        posts: data.posts.map((post) => ({ ...post, author: post.author.id === id ? profile : post.author, comments: post.comments.map((comment) => comment.author.id === id ? { ...comment, author: profile } : comment) })),
      };
    }
    case "join_workspace":
      throw new Error("Demo mode cannot connect to a shared workspace. Sign in to join using an invite code.");
    case "create_workspace": {
      const workspaceId = nextId("workspace", [data.workspace.id]);
      return { ...data, workspace: { id: workspaceId, name: required(action.name, "Workspace name", 80), inviteCode: `DEMO${workspaceId.split("-").at(-1)?.padStart(8, "0")}`, members: [data.profile] }, tasks: [], expenses: [] };
    }
  }
}
