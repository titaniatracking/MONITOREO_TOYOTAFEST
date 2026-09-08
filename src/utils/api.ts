export function apiUrl(path: string) {
  const base =
    typeof window === "undefined"
      ? "http://127.0.0.1:8087"
      : `${window.location.protocol}//${window.location.hostname}:8087`;

  return `${base}${path}`;
}
