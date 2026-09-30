// Formatează id-ul lung (UUID) al unui jucător într-o etichetă scurtă și prietenoasă,
// afișată în toată aplicația în loc de id-ul brut (ex: "Jucător #A1B2C3").
// Codul scurt e derivat printr-un hash simplu al întregului id (nu doar un prefix),
// ca id-urile generate cu fallback-ul "player-<timestamp>-<random>" (folosit când
// crypto.randomUUID() nu e disponibil, ex. acces prin IP local fără HTTPS) să nu
// producă toate același prefix "PLAYER" și deci aceeași etichetă pentru jucători diferiți.
export function formatPlayerLabel(id: string | null | undefined): string {
  if (!id) return "Jucător necunoscut";
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const shortId = hash.toString(16).toUpperCase().padStart(6, "0").slice(0, 6);
  return `Jucător #${shortId}`;
}
