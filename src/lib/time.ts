export function currentTimeMs(): number {
  return Date.now();
}

export function currentDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
