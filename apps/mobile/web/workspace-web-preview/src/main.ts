import "./style.css";

const loadedAt = document.querySelector<HTMLElement>("#loaded-at");
const currentHost = document.querySelector<HTMLElement>("#current-host");

if (loadedAt) {
  loadedAt.textContent = new Date().toLocaleString();
}

if (currentHost) {
  currentHost.textContent = window.location.host || "localhost";
}

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-preview-port]")) {
  const port = link.dataset.previewPort;
  if (port) {
    link.href = previewUrl(port);
  }
}

function previewUrl(port: string) {
  return `/v1/workspace/web-preview/${encodeURIComponent(port)}/`;
}
