import type { CampusEvent } from "./types";
export function eventResponse(event: CampusEvent, userId: string) {
  return event.response ?? (event.attendees.includes(userId) ? "going" : null);
}
export const eventGoingCount = (event: CampusEvent) => event.attendeeCount ?? event.attendees.length;
