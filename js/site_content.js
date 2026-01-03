// Charme site content loader (live data)
(function () {
const CONTENT_JSON_URL = "data/site_content.json";
const AVISOS_JSON_URL = "data/avisos_site.json";
const CONTENT_REFRESH_MS = 15000;

function normalizeBases(list) {
  const out = [];
  for (const raw of list || []) {
    const base = typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
    if (base === "") {
      if (!out.includes("")) out.push("");
      continue;
    }
    if (!out.includes(base)) out.push(base);
  }
  return out.length ? out : [""];
}

function resolveDataBases() {
  const manualList = window.CHARME_DATA_BASES;
  if (Array.isArray(manualList) && manualList.length) {
    return normalizeBases(manualList);
  }

  const manual = window.CHARME_LIVE_URL;
  if (typeof manual === "string" && manual.trim()) {
    return normalizeBases([manual, ""]);
  }

  const host = window.location.hostname || "";
  const isLocal = host === "127.0.0.1" || host === "localhost";
  const localLive = "http://127.0.0.1:8787";
  const remoteLive = "https://live-data.charmecosmeticos.com";
  return normalizeBases(isLocal ? [localLive, remoteLive, ""] : [remoteLive, ""]);
}

function buildDataUrls(relPath, absPath) {
  return DATA_BASES.map((base) => (base ? `${base}/${absPath}` : relPath));
}

async function fetchJsonWithFallback(urls) {
  const list = Array.isArray(urls) ? urls : [urls];
  let lastError = null;

  for (const url of list) {
    try {
      const controller = window.AbortController ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 3000) : null;
      const r = await fetch(url, { cache: "no-store", signal: controller ? controller.signal : undefined });
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("No data source");
}

const DATA_BASES = resolveDataBases();
const CONTENT_URLS = buildDataUrls(CONTENT_JSON_URL, CONTENT_JSON_URL);
const AVISOS_URLS = buildDataUrls(AVISOS_JSON_URL, AVISOS_JSON_URL);

const HOME_TEXT_MAP = {
  site_tagline: "site-tagline",
  nav_inicio: "nav-inicio",
  nav_lojas: "nav-lojas",
  nav_produtos: "nav-produtos",
  nav_promocoes: "nav-promocoes",
  nav_quem: "nav-quem",
  nav_contato: "nav-contato",
  footer_brand: "footer-brand",
  footer_copy: "footer-copy",
  footer_tiny: "footer-tiny",
  hero_label: "home-hero-label",
  hero_title: "home-hero-title",
  hero_text: "home-hero-text",
  hero_cta: "home-cta-lojas",
  hero_social_label: "home-social-label",
  lojas_title: "home-lojas-title",
  lojas_subtitle: "home-lojas-subtitle",
  lojas_tag_1: "lojas-tag-1",
  lojas_title_1: "lojas-title-1",
  lojas_tag_2: "lojas-tag-2",
  lojas_title_2: "lojas-title-2",
  lojas_button_label: "lojas-btn-1",
  produtos_title: "home-produtos-title",
  produtos_subtitle: "home-produtos-subtitle",
  vitrine_kicker: "vitrine-kicker",
  vitrine_title: "vitrine-title",
  vitrine_subtitle: "vitrine-subtitle",
  promos_kicker: "promos-kicker",
  promos_title: "promos-title",
  promos_subtitle: "promos-subtitle",
  promos_empty_badge: "promos-empty-badge",
  promos_empty_title: "promos-empty-title",
  promos_empty_text: "promos-empty-text",
  promos_empty_button: "promos-empty-button",
  contato_eyebrow: "contato-eyebrow",
  contato_title: "contato-title",
  contato_subtitle: "contato-subtitle",
  contato_list_1: "contato-list-1",
  contato_list_2: "contato-list-2",
  contato_list_3: "contato-list-3",
  contato_stat_1_number: "contato-stat-1-number",
  contato_stat_1_label: "contato-stat-1-label",
  contato_stat_2_number: "contato-stat-2-number",
  contato_stat_2_label: "contato-stat-2-label",
  contato_stat_3_number: "contato-stat-3-number",
  contato_stat_3_label: "contato-stat-3-label",
  contato_hours_title: "contato-hours-title",
  contato_hours_note: "contato-hours-note",
  contato_right_label: "contato-right-label",
  contato_btn_1: "contato-btn-1",
  contato_btn_2: "contato-btn-2",
  contato_social_label: "contato-social-label",
  contato_social_handle_1: "contato-social-1-label",
  contato_social_handle_2: "contato-social-2-label",
  contato_trust_text: "contato-trust-text",
};

for (let i = 1; i <= 6; i++) {
  HOME_TEXT_MAP[`prod_cat_${i}_name`] = `prod-cat-${i}-name`;
  HOME_TEXT_MAP[`prod_cat_${i}_desc`] = `prod-cat-${i}-desc`;
}

const SOBRE_TEXT_MAP = {
  hero_label: "sobre-hero-label",
  hero_title: "sobre-hero-title",
  hero_text: "sobre-hero-text",
  cta_promos: "sobre-cta-promos",
  cta_lojas: "sobre-cta-lojas",
  historia_title: "sobre-historia-title",
  historia_subtitle: "sobre-historia-subtitle",
  historia_p1: "sobre-historia-p1",
  historia_p2: "sobre-historia-p2",
  historia_p3: "sobre-historia-p3",
  why_title: "sobre-why-title",
  why_subtitle: "sobre-why-subtitle",
  why_1_label: "sobre-why-1-label",
  why_1_text: "sobre-why-1-text",
  why_1_item_1: "sobre-why-1-item-1",
  why_1_item_2: "sobre-why-1-item-2",
  why_1_item_3: "sobre-why-1-item-3",
  why_2_label: "sobre-why-2-label",
  why_2_text: "sobre-why-2-text",
  why_3_label: "sobre-why-3-label",
  why_3_item_1: "sobre-why-3-item-1",
  why_3_item_2: "sobre-why-3-item-2",
  why_3_item_3: "sobre-why-3-item-3",
  para_title: "sobre-para-title",
  para_subtitle: "sobre-para-subtitle",
  para_small_title: "sobre-para-small-title",
  para_text_1: "sobre-para-text-1",
  essencia_title: "sobre-essencia-title",
  essencia_subtitle: "sobre-essencia-subtitle",
  essencia_1_title: "sobre-essencia-1-title",
  essencia_1_text: "sobre-essencia-1-text",
  essencia_2_title: "sobre-essencia-2-title",
  essencia_2_text: "sobre-essencia-2-text",
  essencia_3_title: "sobre-essencia-3-title",
  essencia_3_text: "sobre-essencia-3-text",
  equipe_title: "sobre-equipe-title",
  equipe_subtitle: "sobre-equipe-subtitle",
  equipe_1_nome: "sobre-equipe-1-nome",
  equipe_1_papel: "sobre-equipe-1-papel",
  equipe_1_text: "sobre-equipe-1-text",
  equipe_2_nome: "sobre-equipe-2-nome",
  equipe_2_papel: "sobre-equipe-2-papel",
  equipe_2_text: "sobre-equipe-2-text",
  equipe_3_nome: "sobre-equipe-3-nome",
  equipe_3_papel: "sobre-equipe-3-papel",
  equipe_3_text: "sobre-equipe-3-text",
  equipe_4_nome: "sobre-equipe-4-nome",
  equipe_4_papel: "sobre-equipe-4-papel",
  equipe_4_text: "sobre-equipe-4-text",
  equipe_5_nome: "sobre-equipe-5-nome",
  equipe_5_papel: "sobre-equipe-5-papel",
  equipe_5_text: "sobre-equipe-5-text",
  equipe_6_nome: "sobre-equipe-6-nome",
  equipe_6_papel: "sobre-equipe-6-papel",
  equipe_6_text: "sobre-equipe-6-text",
};

for (let i = 1; i <= 5; i++) {
  SOBRE_TEXT_MAP[`timeline_${i}_year`] = `sobre-timeline-${i}-year`;
  SOBRE_TEXT_MAP[`timeline_${i}_title`] = `sobre-timeline-${i}-title`;
  SOBRE_TEXT_MAP[`timeline_${i}_text`] = `sobre-timeline-${i}-text`;
}

function applyText(id, value) {
  if (value === undefined || value === null || value === "") return;
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function applyMap(data, map) {
  if (!data) return;
  for (const key of Object.keys(map)) {
    applyText(map[key], data[key]);
  }
}

function resolveAssetUrl(path) {
  if (!path) return "";
  if (typeof path !== "string") return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = DATA_BASES.find((b) => b) || "";
  if (!base) return path;
  return `${base}/${path.replace(/^\/+/, "")}`;
}

function applyImage(id, value, altText) {
  if (!value) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.setAttribute("src", resolveAssetUrl(value));
  if (altText) el.setAttribute("alt", altText);
}

function applyHoursLine(idx, label, text) {
  applyText(`contato-hours-label-${idx}`, label);
  applyText(`contato-hours-text-${idx}`, text);
  const line = document.getElementById(`contato-hours-line-${idx}`);
  if (!line || (!label && !text)) return;
  if (label && text) {
    line.innerHTML = `<strong>${label}</strong> - ${text}`;
  } else {
    line.textContent = label || text || "";
  }
}

function applyHome(home) {
  applyMap(home, HOME_TEXT_MAP);
  if (home && home.lojas_button_label) {
    applyText("lojas-btn-2", home.lojas_button_label);
  }
  for (let i = 1; i <= 3; i++) {
    applyHoursLine(i, home[`contato_hours_label_${i}`], home[`contato_hours_text_${i}`]);
  }
}

function applySobre(sobre) {
  applyMap(sobre, SOBRE_TEXT_MAP);
  for (let i = 1; i <= 6; i++) {
    applyImage(`sobre-equipe-${i}-foto`, sobre[`equipe_${i}_foto`], sobre[`equipe_${i}_nome`]);
  }
}

function buildAvisoLabel(level) {
  if (level === "urgent") return "Urgente";
  if (level === "warning") return "Atencao";
  return "Info";
}

function isAvisoActive(item, now) {
  if (!item) return false;
  if (item.enabled === false) return false;
  const start = item.start_at ? new Date(item.start_at) : null;
  const end = item.end_at ? new Date(item.end_at) : null;
  if (start && !isNaN(start) && now < start) return false;
  if (end && !isNaN(end) && now > end) return false;
  return true;
}

function renderAvisos(items) {
  const container = document.getElementById("site-avisos");
  if (!container) return;
  const inner = container.querySelector(".avisos-bar__inner") || container;
  inner.innerHTML = "";

  const now = new Date();
  const active = (items || []).filter((item) => isAvisoActive(item, now));
  if (!active.length) {
    container.hidden = true;
    return;
  }

  active.forEach((item) => {
    const wrap = document.createElement("div");
    const level = (item.level || "info").toLowerCase();
    wrap.className = `avisos-item avisos-item--${level}`;

    const badge = document.createElement("span");
    badge.className = "avisos-item__badge";
    badge.textContent = buildAvisoLabel(level);

    const title = document.createElement("span");
    title.className = "avisos-item__title";
    title.textContent = item.title || "Aviso";

    const message = document.createElement("span");
    message.className = "avisos-item__message";
    message.textContent = item.message || "";

    wrap.appendChild(badge);
    wrap.appendChild(title);
    if (message.textContent) {
      wrap.appendChild(message);
    }
    inner.appendChild(wrap);
  });

  container.hidden = false;
}

async function loadContent() {
  try {
    const data = await fetchJsonWithFallback(CONTENT_URLS);
    if (data && typeof data === "object") {
      applyHome(data.home || {});
      applySobre(data.sobre || {});
    }
  } catch (err) {
    // ignore
  }
}

async function loadAvisos() {
  try {
    const data = await fetchJsonWithFallback(AVISOS_URLS);
    const items = data && typeof data === "object" ? data.items || [] : [];
    renderAvisos(items);
  } catch (err) {
    renderAvisos([]);
  }
}

function scheduleRefresh() {
  if (CONTENT_REFRESH_MS < 5000) return;
  setInterval(() => {
    loadContent();
    loadAvisos();
  }, CONTENT_REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", () => {
  loadContent();
  loadAvisos();
  scheduleRefresh();
});
})();
