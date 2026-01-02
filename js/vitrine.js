// =======================================================
// CHARME | VITRINE AO VIVO (produtos.json)
// =======================================================

const PROD_JSON_URL = "data/private/produtos.json";
const IMG_PROD_BASE_PATH = "img/produtos/";
const WHATS_NUMBER = "556535494404";
const FETCH_TIMEOUT_MS = 8000;
const REFRESH_MS = 15000;
const MAX_ITEMS = 12;
const LOW_STOCK_LIMIT = 5;

const DATA_BASES = resolveDataBases();
const PROD_URLS = buildDataUrls(PROD_JSON_URL, PROD_JSON_URL);

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
      const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
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

const IMG_FALLBACK = "img/placeholder-promo.svg";

function buildImageCandidates(name) {
  const urls = [];
  if (name) {
    for (const base of DATA_BASES) {
      if (base) urls.push(`${base}/${IMG_PROD_BASE_PATH}${name}`);
    }
    urls.push(`${IMG_PROD_BASE_PATH}${name}`);
  }
  urls.push(IMG_FALLBACK);
  return urls;
}

function applyImageFallback(imgEl, name) {
  const urls = buildImageCandidates(name);
  let idx = 0;
  const loadNext = () => {
    if (idx >= urls.length) {
      imgEl.onerror = null;
      return;
    }
    imgEl.src = urls[idx++];
  };
  imgEl.onerror = loadNext;
  loadNext();
}

function toNumber(v) {
  return Number(String(v ?? "0").replace(",", "."));
}

function pickPrice(item) {
  const p1 = toNumber(item.preco_loja1);
  const p2 = toNumber(item.preco_loja2);
  if (p1 > 0) return p1;
  if (p2 > 0) return p2;
  return 0;
}

function formatMoney(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeItem(raw) {
  const estoque1 = toNumber(raw.estoque_loja1);
  const estoque2 = toNumber(raw.estoque_loja2);
  const total = estoque1 + estoque2;
  const codAtual = Number(raw.cod_atualizacao || 0);
  const price = pickPrice(raw);

  return {
    codigo: raw.codigo,
    nome: raw.nome || "",
    imagem: raw.imagem || "",
    preco: price,
    estoque_total: total,
    estoque_loja1: estoque1,
    estoque_loja2: estoque2,
    cod_atualizacao: codAtual,
    low_stock: total > 0 && total <= LOW_STOCK_LIMIT,
  };
}

function buildList(items) {
  const normalized = (items || [])
    .map(normalizeItem)
    .filter((p) => p.nome && p.codigo);

  normalized.sort((a, b) => {
    if (a.cod_atualizacao !== b.cod_atualizacao) return b.cod_atualizacao - a.cod_atualizacao;
    if (a.low_stock !== b.low_stock) return a.low_stock ? -1 : 1;
    if (a.estoque_total !== b.estoque_total) return a.estoque_total - b.estoque_total;
    return a.nome.localeCompare(b.nome);
  });

  return normalized.slice(0, MAX_ITEMS);
}

function buildWhatsLink(item) {
  const preco = item.preco > 0 ? formatMoney(item.preco) : "preco a combinar";
  const msg = `Oi! Quero o produto ${item.nome} (cod ${item.codigo}). Valor: ${preco}. Tem disponivel?`;
  return `https://wa.me/${WHATS_NUMBER}?text=${encodeURIComponent(msg)}`;
}

function renderList(list) {
  const grid = document.getElementById("vitrine-grid");
  const empty = document.getElementById("vitrine-empty");
  const count = document.getElementById("vitrine-count");
  if (!grid || !empty) return;

  grid.innerHTML = "";

  if (!list.length) {
    empty.hidden = false;
    if (count) count.textContent = "Sem produtos disponiveis.";
    return;
  }

  empty.hidden = true;
  if (count) count.textContent = `${list.length} produtos atualizados ao vivo`;

  const fragment = document.createDocumentFragment();
  list.forEach((p) => {
    const card = document.createElement("article");
    card.className = "vitrine-card";

    const badge = p.low_stock ? `<span class="vitrine-card__badge">Ultimas unidades</span>` : "";
    const price = p.preco > 0 ? formatMoney(p.preco) : "Consulte";
    const estoqueText = p.estoque_total > 0 ? `Estoque total: ${p.estoque_total}` : "Sem estoque";

    card.innerHTML = `
      ${badge}
      <img class="vitrine-card__image" src="img/placeholder-promo.svg" alt="${p.nome}" loading="lazy" />
      <div class="vitrine-card__content">
        <div class="vitrine-card__meta">COD ${p.codigo}</div>
        <h3 class="vitrine-card__title">${p.nome}</h3>
        <div class="vitrine-card__price">${price}</div>
        <div class="vitrine-card__stock">${estoqueText}</div>
        <a class="btn btn--whats vitrine-card__cta" target="_blank" href="${buildWhatsLink(p)}">Consultar no WhatsApp</a>
      </div>
    `;

    const imgEl = card.querySelector(".vitrine-card__image");
    if (imgEl) applyImageFallback(imgEl, p.imagem);

    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
}

async function loadVitrine() {
  try {
    const data = await fetchJsonWithFallback(PROD_URLS);
    if (!Array.isArray(data)) throw new Error("JSON invalido");
    const list = buildList(data);
    renderList(list);
  } catch (err) {
    renderList([]);
  }
}

function scheduleRefresh() {
  if (REFRESH_MS < 5000) return;
  setInterval(() => loadVitrine(), REFRESH_MS);
}

const boot = () => {
  loadVitrine();
  scheduleRefresh();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

