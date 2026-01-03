// =======================================================
// CHARME | VITRINE AO VIVO (produtos.json)
// =======================================================

(function () {
const PROD_JSON_URL = "data/private/produtos.json";
const IMG_PROD_BASE_PATH = "img/produtos/";
const WHATS_NUMBER = "556535494404";
const FETCH_TIMEOUT_MS = 8000;
const VITRINE_REFRESH_MS = 15000;
const MAX_ITEMS = 8;
const LOW_STOCK_LIMIT = 2;
const LOW_STOCK_MAX_BADGES = 3;
const NOVO_DIAS = 7;
const SNAPSHOT_KEY = "charme_vitrine_snapshot_v1";
let lastRenderKey = "";

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

function normalizeImageName(value) {
  return String(value || "").trim();
}

function isValidImageName(value) {
  const name = normalizeImageName(value);
  if (!name) return false;
  const lower = name.toLowerCase();
  if (lower.includes("placeholder")) return false;
  if (lower === IMG_FALLBACK.toLowerCase()) return false;
  return true;
}

function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).trim();
  if (!s) return null;
  let iso = s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    iso = `${s}T00:00:00`;
  } else if (/^\d{4}-\d{2}-\d{2} /.test(s)) {
    iso = s.replace(" ", "T");
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isNovo(dt, nowMs) {
  if (!dt) return false;
  const diff = nowMs - dt.getTime();
  return diff >= 0 && diff <= NOVO_DIAS * 86400000;
}

function loadSnapshot() {
  try {
    if (!window.localStorage) return {};
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch (err) {
    return {};
  }
}

function saveSnapshot(snapshot) {
  try {
    if (!window.localStorage) return;
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (err) {
    // ignore
  }
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

function normalizeItem(raw, snapshot, nowMs) {
  const estoque1 = toNumber(raw.estoque_loja1);
  const estoque2 = toNumber(raw.estoque_loja2);
  const total = estoque1 + estoque2;
  const codAtual = Number(raw.cod_atualizacao || 0);
  const price = pickPrice(raw);
  const codigo = raw.codigo;
  const imageName = normalizeImageName(raw.imagem);
  const imageOk = isValidImageName(imageName);
  const precoBaixouRaw = raw.preco_baixou;
  const precoBaixou =
    precoBaixouRaw === true ||
    precoBaixouRaw === 1 ||
    precoBaixouRaw === "1" ||
    String(precoBaixouRaw || "").toLowerCase() === "true";
  const precoBaixouData = String(raw.preco_baixou_data || "").trim();

  const dtRaw = raw.dt_cadastro || raw.DT_CADASTRO || "";
  const dtCadastro = parseDateOnly(dtRaw);
  const novo = isNovo(dtCadastro, nowMs);

  const prev = snapshot[codigo] || {};
  const prevStock = typeof prev.stock === "number" ? prev.stock : null;
  let reposicaoAtiva = Boolean(prev.reposicao_ativa);
  if (prevStock !== null && prevStock <= 0 && total > 0) {
    reposicaoAtiva = true;
  }
  if (total <= 0) {
    reposicaoAtiva = false;
  }
  const reposicao = reposicaoAtiva && total >= 1;

  snapshot[codigo] = {
    stock: total,
    reposicao_ativa: reposicao ? true : false,
  };

  return {
    codigo,
    nome: raw.nome || "",
    imagem: imageName,
    preco: price,
    estoque_total: total,
    estoque_loja1: estoque1,
    estoque_loja2: estoque2,
    cod_atualizacao: codAtual,
    dt_cadastro: dtCadastro ? dtCadastro.toISOString().slice(0, 10) : "",
    low_stock: total > 0 && total <= LOW_STOCK_LIMIT && price > 0 && imageOk,
    novo,
    reposicao,
    preco_baixou: precoBaixou,
    preco_baixou_data: precoBaixouData,
    image_ok: imageOk,
  };
}

function buildList(items) {
  const snapshot = loadSnapshot();
  const nowMs = Date.now();
  const normalized = (items || [])
    .map((raw) => normalizeItem(raw, snapshot, nowMs))
    .filter((p) => p.nome && p.codigo)
    .filter((p) => p.estoque_total > 0)
    .filter((p) => p.preco > 0 && p.image_ok);

  const priority = normalized.filter(
    (p) => p.novo || p.reposicao || p.preco_baixou
  );
  const lowStock = normalized.filter(
    (p) => p.low_stock && !(p.novo || p.reposicao || p.preco_baixou)
  );
  const rest = normalized.filter(
    (p) => !(p.novo || p.reposicao || p.preco_baixou) && !p.low_stock
  );

  priority.sort((a, b) => {
    if (a.cod_atualizacao !== b.cod_atualizacao) return b.cod_atualizacao - a.cod_atualizacao;
    return a.nome.localeCompare(b.nome);
  });

  lowStock.sort((a, b) => {
    if (a.estoque_total !== b.estoque_total) return a.estoque_total - b.estoque_total;
    return a.nome.localeCompare(b.nome);
  });

  rest.sort((a, b) => {
    const byName = a.nome.localeCompare(b.nome);
    if (byName !== 0) return byName;
    return b.cod_atualizacao - a.cod_atualizacao;
  });

  const result = priority.slice(0, MAX_ITEMS);
  if (result.length < MAX_ITEMS) {
    result.push(
      ...lowStock.slice(0, Math.min(LOW_STOCK_MAX_BADGES, MAX_ITEMS - result.length))
    );
  }
  if (result.length < MAX_ITEMS) {
    result.push(...rest.slice(0, MAX_ITEMS - result.length));
  }

  saveSnapshot(snapshot);
  return result;
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

  const listKey = list
    .map(
      (p) =>
        `${p.codigo}:${p.nome}:${p.preco}:${p.estoque_total}:${p.imagem}:${p.novo}:${p.reposicao}:${p.preco_baixou}:${p.low_stock}`
    )
    .join("|");
  if (listKey === lastRenderKey) return;
  lastRenderKey = listKey;

  grid.innerHTML = "";

  if (!list.length) {
    empty.hidden = false;
    if (count) count.textContent = "Sem produtos disponiveis.";
    return;
  }

  empty.hidden = true;
  if (count) count.textContent = `${list.length} novidades para você.`;

  const fragment = document.createDocumentFragment();
  let lowShown = 0;
  list.forEach((p) => {
    const card = document.createElement("article");
    card.className = "vitrine-card";

    let badge = "";
    if (p.novo) {
      badge = `<span class="vitrine-card__badge">Chegou agora</span>`;
    } else if (p.reposicao) {
      badge = `<span class="vitrine-card__badge vitrine-card__badge--restock">Reposição</span>`;
    } else if (p.preco_baixou) {
      badge = `<span class="vitrine-card__badge">Preço baixou</span>`;
    } else if (p.low_stock && lowShown < LOW_STOCK_MAX_BADGES) {
      badge = `<span class="vitrine-card__badge">Últimas unidades</span>`;
      lowShown += 1;
    }
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
  if (VITRINE_REFRESH_MS < 5000) return;
  setInterval(() => loadVitrine(), VITRINE_REFRESH_MS);
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
})();

