/** Share a workspace load across repeated notifications for the same account. */
export function sessionLoader(load: (userId: string | null) => Promise<void>) {
 let current: string | null | undefined;
 let pending = Promise.resolve();
 return (userId: string | null) => {
  if (userId !== current) {
   current = userId;
   pending = load(userId);
  }
  return pending;
 };
}
