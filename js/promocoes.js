// ===============================
//  PROMOÇÕES CHARME – PREMIUM
//  Código 100% blindado e revisado
// ===============================

const PROMOS_JSON_URL = "data/promocoes_site.json";
const IMG_PROMO_BASE_PATH = "img/produtos/";
const WHATS_NUMBER = "556535494404";

// Só inicia quando REALMENTE existir a área de promoções
document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector("#promocoes-grid");
  const count = document.querySelector("#promos-count");

  if (!grid || !count) {
    console.warn("⚠ Área de promoções não encontrada no HTML. Script ignorado.");
    return;
  }

  // ========================
  // ESTADO GLOBAL
  // ========================
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
  };

  // ========================
  // ELEMENTOS
  // ========================
  const els = {
    grid,
    count,
    empty: document.querySelector("#promocoes-empty"),
    search: document.querySelector("#promo-search"),
    category: document.querySelector("#promo-category"),
    sort: document.querySelector("#promo-sort"),
  };

  // ---------------------------
  // FUNÇÕES UTILITÁRIAS
  // ---------------------------
  const toNumber = (v) => Number(String(v || "0").replace(",", "."));
  const todayMidnight = () => new Date().setHours(0, 0, 0, 0);

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

  // ---------------------------
  // NORMALIZAÇÃO DOS DADOS
  // ---------------------------
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
      if (dataFim < hoje) ativa = false;
      else diasRestantes = daysBetween(dataFim);
    }

    if (duracaoEstoque && estoqueTotal <= 0) ativa = false;

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

  // ---------------------------
  // CARREGAR JSON
  // ---------------------------
  const loadPromos = async () => {
    try {
      const r = await fetch(PROMOS_JSON_URL, { cache: "no-store" });
      if (!r.ok) throw new Error("Não carregou JSON");

      const data = await r.json();

      if (!Array.isArray(data)) {
        throw new Error("JSON inválido");
      }

      state.rawPromos = data;
      state.activePromos = data.map(normalizePromo).filter((p) => p.ativa);

      buildCategoryOptions();
      applyFilters();
      startTimer();
    } catch (e) {
      console.error("Erro:", e);
      setError("Erro ao carregar promoções.");
    }
  };

  const setError = (msg) => {
    if (els.count) els.count.textContent = msg;
    if (els.grid) els.grid.innerHTML = "";
  };

  // ---------------------------
  // CATEGORIAS DO SELECT
  // ---------------------------
  const buildCategoryOptions = () => {
    if (!els.category) return;

    const cats = new Set();
    state.activePromos.forEach((p) => p.categoria && cats.add(p.categoria));

    els.category.innerHTML = `<option value="">Todas as categorias</option>`;

    [...cats].sort().forEach((c) => {
      const op = document.createElement("option");
      op.value = c;
      op.textContent = c;
      els.category.appendChild(op);
    });
  };

  // ---------------------------
  // FILTROS & ORDENAÇÃO
  // ---------------------------
  const applyFilters = () => {
    let arr = [...state.activePromos];

    // search
    if (state.filters.search) {
      const t = state.filters.search.toLowerCase();
      arr = arr.filter((p) =>
        `${p.nome} ${p.descricao_resumida} ${p.categoria} ${p.subcategoria}`
          .toLowerCase()
          .includes(t)
      );
    }

    // categoria
    if (state.filters.category) {
      arr = arr.filter((p) => p.categoria === state.filters.category);
    }

    // sort
    const sort = state.filters.sort;
    if (sort === "discountPercent") arr.sort((a, b) => b.descontoPercent - a.descontoPercent);
    else if (sort === "discountValue") arr.sort((a, b) => b.descontoValor - a.descontoValor);
    else if (sort === "priceAsc") arr.sort((a, b) => a.precoPromo - b.precoPromo);
    else {
      arr.sort((a, b) => {
        const ad = a.diasRestantes ?? 999;
        const bd = b.diasRestantes ?? 999;
        if (ad !== bd) return ad - bd;
        return b.descontoPercent - a.descontoPercent;
      });
    }

    state.filteredPromos = arr;
    render();
  };

  // ---------------------------
  // RENDERIZAÇÃO DOS CARDS
  // ---------------------------
  const render = () => {
    els.grid.innerHTML = "";
    state.timers = [];

    if (state.filteredPromos.length === 0) {
      els.grid.hidden = true;
      els.empty.hidden = false;
      els.count.textContent = "Nenhuma promoção ativa";
      return;
    }

    els.grid.hidden = false;
    els.empty.hidden = true;

    const qtd = state.filteredPromos.length;
    els.count.textContent = `${qtd} promoção${qtd > 1 ? "es" : ""} ativa${qtd > 1 ? "s" : ""}`;

    const fragment = document.createDocumentFragment();

    state.filteredPromos.forEach((p) => {
      fragment.appendChild(makeCard(p));
    });

    els.grid.appendChild(fragment);
  };

  // ---------------------------
  // CRIAÇÃO DOS CARDS
  // ---------------------------
  const makeCard = (p) => {
    const el = document.createElement("article");
    el.className = "promo-card fade-in-up";

    const img = p.imagem && p.imagem.trim() !== "" ? p.imagem : "placeholder-promo.jpg";

    const badge = getBadge(p);
    const prazo = getPrazo(p);

    el.innerHTML = `
      <div class="promo-card__ribbon">${badge}</div>

      <div class="promo-card__image-wrapper">
        <img src="${IMG_PROMO_BASE_PATH + img}" loading="lazy" class="promo-card__image" />
        ${p.descontoPercent > 0 ? `<div class="promo-card__discount-tag">${p.descontoPercent}% OFF</div>` : ""}
      </div>

      <div class="promo-card__content">
        <div class="promo-card__category">${p.categoria || "Sem categoria"}</div>
        <h3 class="promo-card__title">${p.nome}</h3>

        <p class="promo-card__subtitle">${p.descricao_resumida || p.subcategoria || ""}</p>

        <div class="promo-card__prices">
          <div class="promo-card__price-main">
            <span class="promo-card__label">Por</span>
            <span class="promo-card__price-current">${money(p.precoPromo)}</span>
          </div>

          <div class="promo-card__price-extra">
            ${p.precoNormal ? `<span class="promo-card__price-old">De ${money(p.precoNormal)}</span>` : ""}
            ${p.descontoValor ? `<span class="promo-card__price-save">Economize ${money(p.descontoValor)}</span>` : ""}
          </div>
        </div>

        <div class="promo-card__meta">
          <div class="promo-card__meta-item">
            <span class="promo-card__meta-label">Estoque</span>
            <span class="promo-card__meta-value">Total: ${p.estoqueTotal}</span>
          </div>

          <div class="promo-card__meta-item">
            <span class="promo-card__meta-label">Validade</span>
            <span class="promo-card__meta-value">${prazo}
              ${
                p.dataFim && !p.duracaoEstoque
                  ? `<span class="promo-card__timer" data-expires="${p.dataFim.toISOString()}"></span>`
                  : ""
              }
            </span>
          </div>
        </div>

        <a class="btn btn--whats promo-card__cta" target="_blank" href="${whats(p)}">
          Aproveitar pelo WhatsApp
        </a>
      </div>
    `;

    const timer = el.querySelector(".promo-card__timer");
    if (timer) state.timers.push(timer);

    return el;
  };

  // ---------------------------
  // MÉTODOS AUXILIARES DOS CARDS
  // ---------------------------
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

  // ---------------------------
  // TIMER GLOBAL PARA TODOS OS CARDS
  // ---------------------------
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

  // ---------------------------
  // EVENTOS DOS FILTROS
  // ---------------------------
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

  // ---------------------------
  // INICIAR
  // ---------------------------
  loadPromos();
});
