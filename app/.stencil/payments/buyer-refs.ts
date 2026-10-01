/**
 * The buyer ref a guest is stored under: their email, lowercase and trimmed,
 * behind a prefix that can never collide with a user id. `hasPurchased` and
 * `getPurchases` build it for you from `buyerEmail`; use this only when you
 * store refs yourself (e.g. an order row keyed by buyer). Mirrors the payments
 * worker's encoding — do not change it.
 */
export function guestBuyerRef(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

/**
 * Every buyer ref a purchase read must check. A checkout stores the order under
 * the signed-in user id when there is one, else under the guest email ref, so a
 * signed-in buyer whose page also passes `buyerEmail` needs both looked up.
 */
export function buyerRefCandidates(opts: {
  buyerRef?: string | null;
  buyerEmail?: string | null;
  sessionUserId?: string | null;
}): string[] {
  if (opts.buyerRef) return [opts.buyerRef];
  const refs: string[] = [];
  if (opts.buyerEmail?.trim()) refs.push(guestBuyerRef(opts.buyerEmail));
  if (opts.sessionUserId && !refs.includes(opts.sessionUserId)) refs.push(opts.sessionUserId);
  return refs;
}
