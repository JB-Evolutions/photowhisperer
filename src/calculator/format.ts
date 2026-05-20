export function formatAperture(ap: number): string {
  return `f/${ap}`;
}

export function formatShutter(seconds: number): string {
  if (seconds >= 1) {
    return `${seconds}"`;
  }
  return `1/${Math.round(1 / seconds)}`;
}
