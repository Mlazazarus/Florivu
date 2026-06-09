export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) {
        return;
      }

      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        registration.update().catch((error) => {
          console.warn('Florivu service worker update check failed.', error);
        });
      })
      .catch((error) => {
        console.warn('Florivu service worker registration failed.', error);
      });
  });
}
