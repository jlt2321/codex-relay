import "./style.css";

const loadedAt = document.querySelector<HTMLElement>("#loaded-at");
const currentHost = document.querySelector<HTMLElement>("#current-host");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-targets");
const targetList = document.querySelector<HTMLElement>("#target-list");

type PreviewTarget = {
  description: string;
  label: string;
  port: number;
};

const previewTargets: PreviewTarget[] = [
  {
    description: "Vite dev server",
    label: "Vite",
    port: 5173,
  },
  {
    description: "Vite built preview",
    label: "Vite Preview",
    port: 4173,
  },
  {
    description: "Common local web server",
    label: "Local Web",
    port: 8080,
  },
  {
    description: "Expo web server",
    label: "Expo Web",
    port: 19006,
  },
];

if (loadedAt) {
  loadedAt.textContent = new Date().toLocaleString();
}

if (currentHost) {
  currentHost.textContent = window.location.host || "localhost";
}

refreshButton?.addEventListener("click", () => {
  void renderTargets();
});

void renderTargets();

async function renderTargets() {
  if (!targetList) {
    return;
  }

  targetList.innerHTML = '<div class="target-card muted">Checking local preview targets...</div>';
  refreshButton?.setAttribute("disabled", "true");

  const results = await Promise.all(previewTargets.map(checkTarget));
  targetList.innerHTML = "";

  for (const result of results) {
    targetList.appendChild(createTargetCard(result.target, result.available));
  }

  if (!results.some((result) => result.available)) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "No active preview server detected.";
    targetList.prepend(emptyState);
  }

  refreshButton?.removeAttribute("disabled");
}

async function checkTarget(target: PreviewTarget) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(previewUrl(String(target.port)), {
      cache: "no-store",
      signal: controller.signal,
    });
    return { available: response.ok, target };
  } catch {
    return { available: false, target };
  } finally {
    window.clearTimeout(timeout);
  }
}

function createTargetCard(target: PreviewTarget, available: boolean) {
  const card = document.createElement("article");
  card.className = `target-card${available ? "" : " unavailable"}`;

  const copy = document.createElement("div");
  copy.className = "target-copy";

  const title = document.createElement("h3");
  title.textContent = target.label;

  const meta = document.createElement("p");
  meta.textContent = `${target.description} · ${target.port}`;

  copy.append(title, meta);
  card.appendChild(copy);

  if (available) {
    const link = document.createElement("a");
    link.className = "preview-link";
    link.href = previewUrl(String(target.port));
    link.textContent = "Open";
    card.appendChild(link);
  } else {
    const badge = document.createElement("span");
    badge.className = "status-badge";
    badge.textContent = "Unavailable";
    card.appendChild(badge);
  }

  return card;
}

function previewUrl(port: string) {
  return `/v1/workspace/web-preview/${encodeURIComponent(port)}/`;
}
