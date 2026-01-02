// =======================================================
//  PROMOÇÕES CHARME – PREMIUM
//  - Carrega JSON, aplica filtros, paginação e timers
// =======================================================

const PROMOS_JSON_URL = "data/promocoes_site.json";
const IMG_PROMO_BASE_PATH = "img/produtos/";
const WHATS_NUMBER = "556535494404";

const DATA_BASES = resolveDataBases();
const PROMOS_JSON_URLS = buildDataUrls(PROMOS_JSON_URL, PROMOS_JSON_URL);

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

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector("#promocoes-grid");
  const count = document.querySelector("#promos-count");

  if (!grid || !count) {
    console.warn(
      "⚠ Área de promoções não encontrada no HTML. Script ignorado."
    );
    return;
  }

  // =====================================================
  //  ESTADO GLOBAL
  // =====================================================
  const state = {
    rawPromos: [],
    activePromos: [],
    filteredPromos: [],
    timers: [],
    filters: {
      search: "",
      category: "",
      sort: "urgency",
    },
    page: 1,
    pageSize: 4, // quantos cards por página
  };

  // =====================================================
  //  MAPA DE ELEMENTOS DO DOM
  // =====================================================
  const els = {
    grid,
    count,
    empty: document.querySelector("#promocoes-empty"),
    search: document.querySelector("#promo-search"),
    category: document.querySelector("#promo-category"),
    sort: document.querySelector("#promo-sort"),
    currentFilter: document.querySelector("#promos-current-filter"),
    pagination: document.querySelector(".promos-pagination"),
    pageInfo: document.querySelector("#promos-page-info"),
    prev: document.querySelector("#promos-prev"),
    next: document.querySelector("#promos-next"),
  };

  // =====================================================
  //  FUNÇÕES UTILITÁRIAS
  // =====================================================
  const toNumber = (v) => Number(String(v ?? "0").replace(",", "."));

  const todayMidnight = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const parseDate = (v) => (v ? new Date(v + "T12:00:00") : null);

  const money = (v) =>
    toNumber(v).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const daysBetween = (to) => {
    const ms = to.getTime() - todayMidnight();
    return Math.ceil(ms / 86400000);
  };

  const getTotalPages = () => {
    const total = state.filteredPromos.length;
    if (total === 0) return 1;
    return Math.ceil(total / state.pageSize);
  };

  const scrollToPromosTop = () => {
    const section = document.querySelector("#promocoes-section");
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const absoluteTop = rect.top + window.pageYOffset - 80;

   // window.scrollTo({
     // top: absoluteTop < 0 ? 0 : absoluteTop,
      //behavior: "smooth",
    //});
  };

  // =====================================================
  //  NORMALIZAÇÃO DOS DADOS
  // =====================================================
  const normalizePromo = (raw) => {
    const precoNormal = toNumber(raw.preco_normal);
    const precoPromo = toNumber(raw.preco_promo);
    const descontoValor = Math.max(precoNormal - precoPromo, 0);

    const descontoPercent =
      raw.desconto_percentual && raw.desconto_percentual !== ""
        ? toNumber(raw.desconto_percentual)
        : precoNormal > 0
        ? Math.round((descontoValor / precoNormal) * 1000) / 10
        : 0;

    const dataFim = parseDate(raw.data_fim);
    const duracaoEstoque = Boolean(raw.duracao_estoque);

    const estoqueTotal =
      toNumber(raw.estoque_loja1) + toNumber(raw.estoque_loja2);

    const hoje = new Date(todayMidnight());
    let ativa = true;
    let diasRestantes = null;

    if (!duracaoEstoque && dataFim) {
      if (dataFim < hoje) {
        ativa = false;
      } else {
        diasRestantes = daysBetween(dataFim);
      }
    }

    if (duracaoEstoque && estoqueTotal <= 0) {
      ativa = false;
    }

    return {
      ...raw,
      precoNormal,
      precoPromo,
      descontoValor,
      descontoPercent,
      dataFim,
      duracaoEstoque,
      estoqueTotal,
      ativa,
      diasRestantes,
    };
  };

  // =====================================================
  //  CARREGAMENTO DO JSON
  // =====================================================
  const loadPromos = async () => {
    try {
      const data = await fetchJsonWithFallback(PROMOS_JSON_URLS);
      if (!Array.isArray(data)) throw new Error("JSON inválido");

      state.rawPromos = data;
      state.activePromos = data.map(normalizePromo).filter((p) => p.ativa);

      buildCategoryOptions();
      applyFilters();
      startTimer();
    } catch (e) {
      console.error("Erro ao carregar promoções:", e);
      setError("Erro ao carregar promoções.");
    }
  };

  const setError = (msg) => {
    els.count.textContent = msg;
    els.grid.innerHTML = "";
    if (els.empty) els.empty.hidden = true;
    if (els.pagination) els.pagination.hidden = true;
  };

  // =====================================================
  //  CATEGORIAS DO SELECT
  // =====================================================
  const buildCategoryOptions = () => {
    if (!els.category) return;

    const cats = new Set();
    state.activePromos.forEach((p) => {
      if (p.categoria) cats.add(p.categoria);
    });

    els.category.innerHTML = `<option value="">Todas as categorias</option>`;

    [...cats].sort().forEach((c) => {
      const op = document.createElement("option");
      op.value = c;
      op.textContent = c;
      els.category.appendChild(op);
    });
  };

  // =====================================================
  //  FILTROS & ORDENAÇÃO
  // =====================================================
  const applyFilters = () => {
    let arr = [...state.activePromos];

    // Texto
    if (state.filters.search) {
      const t = state.filters.search.toLowerCase();
      arr = arr.filter((p) =>
        `${p.nome ?? ""} ${p.descricao_resumida ?? ""} ${p.categoria ?? ""} ${
          p.subcategoria ?? ""
        }`
          .toLowerCase()
          .includes(t)
      );
    }

    // Categoria
    if (state.filters.category) {
      arr = arr.filter((p) => p.categoria === state.filters.category);
    }

    // Ordenação
    const sort = state.filters.sort;
    if (sort === "discountPercent") {
      arr.sort((a, b) => b.descontoPercent - a.descontoPercent);
    } else if (sort === "discountValue") {
      arr.sort((a, b) => b.descontoValor - a.descontoValor);
    } else if (sort === "priceAsc") {
      arr.sort((a, b) => a.precoPromo - b.precoPromo);
    } else {
      // urgency (padrão)
      arr.sort((a, b) => {
        const ad = a.diasRestantes ?? 999;
        const bd = b.diasRestantes ?? 999;
        if (ad !== bd) return ad - bd;
        return b.descontoPercent - a.descontoPercent;
      });
    }

    state.filteredPromos = arr;
    state.page = 1;
    render();
  };

  // =====================================================
  //  LABEL DO FILTRO ATUAL
  // =====================================================
  const updateFilterLabel = () => {
    if (!els.currentFilter) return;

    let label = "Todas as categorias";

    if (state.filters.category && els.category) {
      const opt = Array.from(els.category.options).find(
        (o) => o.value === state.filters.category
      );
      if (opt) label = opt.textContent.trim();
      else label = state.filters.category;
    }

    els.currentFilter.textContent = label;
    els.currentFilter.hidden = false;
  };

  // =====================================================
  //  CONTROLES DE PAGINAÇÃO
  // =====================================================
  const updatePaginationControls = () => {
    if (!els.pagination || !els.pageInfo || !els.prev || !els.next) return;

    const total = state.filteredPromos.length;
    const totalPages = getTotalPages();

    // se couber em uma página, esconde paginação
    els.pagination.hidden = total <= state.pageSize;

    if (totalPages <= 1) {
      els.pageInfo.textContent = "";
    } else {
      els.pageInfo.textContent = `Página ${state.page} de ${totalPages}`;
    }

    els.prev.disabled = state.page <= 1;
    els.next.disabled = state.page >= totalPages;
  };

  // =====================================================
  //  RENDERIZAÇÃO
  // =====================================================
  const render = () => {
    els.grid.innerHTML = "";
    state.timers = [];

    const total = state.filteredPromos.length;

    if (total === 0) {
      els.grid.hidden = true;
      if (els.empty) els.empty.hidden = false;
      els.count.textContent = "Nenhuma promoção ativa";
      if (els.pagination) els.pagination.hidden = true;
      if (els.currentFilter) els.currentFilter.hidden = true;
      return;
    }

    els.grid.hidden = false;
    if (els.empty) els.empty.hidden = true;

    const totalPages = getTotalPages();
    if (state.page > totalPages) state.page = totalPages;

    const start = (state.page - 1) * state.pageSize;
    const end = start + state.pageSize;
    const pageItems = state.filteredPromos.slice(start, end);

    const qtd = pageItems.length;
    els.count.textContent = `${qtd} de ${total} promoção${
      total > 1 ? "es" : ""
    } ativas`;

    const fragment = document.createDocumentFragment();
    pageItems.forEach((p) => fragment.appendChild(makeCard(p)));
    els.grid.appendChild(fragment);

    updateFilterLabel();
    updatePaginationControls();
  };

  // =====================================================
  //  CRIAÇÃO DO CARD
  // =====================================================
  const makeCard = (p) => {
    const el = document.createElement("article");
    el.className = "promo-card fade-in-up";

    const img =
      p.imagem && String(p.imagem).trim() !== ""
        ? p.imagem
        : "placeholder-promo.jpg";

    const badge = getBadge(p);
    const prazo = getPrazo(p);

    el.innerHTML = `
      <div class="promo-card__ribbon">${badge}</div>

      <div class="promo-card__image-wrapper">
        <img
          src="${IMG_PROMO_BASE_PATH + img}"
          loading="lazy"
          alt="${p.nome}"
          class="promo-card__image"
          onerror="this.onerror=null;this.src='${IMG_PROMO_BASE_PATH}placeholder-promo.jpg';"
        />
        ${
          p.descontoPercent > 0
            ? `<div class="promo-card__discount-tag">${p.descontoPercent}% OFF</div>`
            : ""
        }
      </div>

      <div class="promo-card__content">
        <div class="promo-card__category">${
          p.categoria || "Sem categoria"
        }</div>
        <h3 class="promo-card__title">${p.nome}</h3>

        <p class="promo-card__subtitle">${
          p.descricao_resumida || p.subcategoria || ""
        }</p>

        <div class="promo-card__prices">
          <div class="promo-card__price-main">
            <span class="promo-card__label">Por</span>
            <span class="promo-card__price-current">${money(
              p.precoPromo
            )}</span>
          </div>

          <div class="promo-card__price-extra">
            ${
              p.precoNormal
                ? `<span class="promo-card__price-old">De ${money(
                    p.precoNormal
                  )}</span>`
                : ""
            }
            ${
              p.descontoValor
                ? `<span class="promo-card__price-save">Economize ${money(
                    p.descontoValor
                  )}</span>`
                : ""
            }
          </div>
        </div>

        <div class="promo-card__meta">
          <div class="promo-card__meta-item">
            <span class="promo-card__meta-label">Estoque</span>
            <span class="promo-card__meta-value">Total: ${p.estoqueTotal}</span>
          </div>

          <div class="promo-card__meta-item">
            <span class="promo-card__meta-label">Validade</span>
            <span class="promo-card__meta-value">
              ${prazo}
              ${
                p.dataFim && !p.duracaoEstoque
                  ? `<span class="promo-card__timer" data-expires="${p.dataFim.toISOString()}"></span>`
                  : ""
              }
            </span>
          </div>
        </div>

        <a class="btn btn--whats promo-card__cta" target="_blank" href="${whats(
          p
        )}">
          Aproveitar pelo WhatsApp
        </a>
      </div>
    `;

    const timer = el.querySelector(".promo-card__timer");
    if (timer) state.timers.push(timer);

    return el;
  };

  // =====================================================
  //  HELPERS DOS CARDS
  // =====================================================
  const getBadge = (p) => {
    if (p.estoqueTotal <= 3) return "🔥 Últimas unidades";
    if (p.diasRestantes === 1) return "⏳ Só hoje";
    if (p.diasRestantes > 1 && p.diasRestantes <= 3)
      return `⏳ ${p.diasRestantes} dias para acabar`;
    if (p.duracaoEstoque) return "📦 Até acabar o estoque";
    return "✨ Promoção ativa";
  };

  const getPrazo = (p) => {
    if (p.duracaoEstoque && !p.dataFim) return "Enquanto durar o estoque";
    if (!p.dataFim) return "Consulte na loja";

    if (p.diasRestantes === 0) return "Termina hoje";
    if (p.diasRestantes === 1) return "Falta 1 dia";
    return `Faltam ${p.diasRestantes} dias`;
  };

  const whats = (p) => {
    const msg = `Oi! Quero aproveitar a promoção ${p.nome} por ${money(
      p.precoPromo
    )}. Tem disponível?`;
    return `https://wa.me/${WHATS_NUMBER}?text=${encodeURIComponent(msg)}`;
  };

  // =====================================================
  //  TIMER GLOBAL
  // =====================================================
  const startTimer = () => {
    if (state.timers.length === 0) return;

    const tick = () => {
      const now = Date.now();

      state.timers.forEach((el) => {
        const iso = el.dataset.expires;
        if (!iso) return;

        const end = new Date(iso).getTime();
        const diff = end - now;

        if (diff <= 0) {
          el.textContent = " • termina hoje";
          return;
        }

        const h = Math.floor((diff / 3600000) % 24);
        const m = Math.floor((diff / 60000) % 60);

        el.textContent = ` • ${String(h).padStart(2, "0")}h${String(m).padStart(
          2,
          "0"
        )} restantes`;
      });
    };

    tick();
    setInterval(tick, 60000);
  };

  // =====================================================
  //  EVENTOS
  // =====================================================
  if (els.search) {
    els.search.addEventListener("input", (e) => {
      state.filters.search = e.target.value.toLowerCase();
      applyFilters();
    });
  }

  if (els.category) {
    els.category.addEventListener("change", (e) => {
      state.filters.category = e.target.value;
      applyFilters();
    });
  }

  if (els.sort) {
    els.sort.addEventListener("change", (e) => {
      state.filters.sort = e.target.value;
      applyFilters();
    });
  }

  if (els.prev) {
    els.prev.addEventListener("click", () => {
      if (state.page <= 1) return;
      state.page -= 1;
      render();
      scrollToPromosTop();
    });
  }

  if (els.next) {
    els.next.addEventListener("click", () => {
      const totalPages = getTotalPages();
      if (state.page >= totalPages) return;
      state.page += 1;
      render();
      scrollToPromosTop();
    });
  }

  // =====================================================
  //  START
  // =====================================================
  loadPromos();
});
