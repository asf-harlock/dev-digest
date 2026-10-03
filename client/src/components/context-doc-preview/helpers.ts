/** Byte size → whole KB for the "too large" notes; rounds up so 64 KB + 1 B reads as 65. */
export function sizeKb(bytes: number | null | undefined): number {
  return Math.ceil((bytes ?? 0) / 1024);
}
