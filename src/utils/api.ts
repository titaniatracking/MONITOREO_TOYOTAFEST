export function apiUrl(path: string) {
  const base = import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:8087`
    : window.location.origin;

  return `${base}${path}`;
}
