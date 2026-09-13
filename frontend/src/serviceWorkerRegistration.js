// Registers /service-worker.js so the app can be installed as a PWA and
// keeps working (app shell + static assets) when offline. API calls are
// always excluded — see public/service-worker.js.

const isLocalhost = Boolean(
  window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]",
);

export function register() {
  if (!("serviceWorker" in navigator)) return;

  // Skip in local dev to avoid caching surprises during craco start.
  if (isLocalhost) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  });
}

export function unregister() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then((registration) => {
    registration.unregister();
  });
}
