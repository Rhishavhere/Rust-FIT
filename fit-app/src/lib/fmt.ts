/** Format ₹ using Indian numbering (lakhs/crores for large amounts). */
export function formatInr(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: amount >= 100000 ? 0 : 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Short FIT ID prefix for badges. */
export function badgeText(shortId: string): string {
  return shortId.slice(0, 12).toUpperCase();
}

export function isoDate(tsSeconds: number): string {
  return new Date(tsSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
