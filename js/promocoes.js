// js/promocoes.js
// Vitrine de promoções Charme – com filtros, contador e gatilhos

const PROMOS_JSON_URL = "data/promocoes_site.json"; // mesmo arquivo que você já gerou
const IMG_PROMO_BASE_PATH = "img/produtos/"; // onde vão ficar as imagens das promos
const WHATS_NUMBER = "556535494404"; // número padrão da Charme

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector("#promocoes-grid");
  if (!grid) return; // se a seção não existir, não faz nada

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

  const els = {
    grid,
    count: document.querySelector("#promos-count"),
    empty: document.querySelector("#promocoes-empty"),
    search: document.querySelector("#promo-search"),
    category: document.querySelector("#promo-category"),
    sort: document.querySelector("#promo-sort"),
  };

  // Util: parse de número vindo em string
  const toNumber = (value) => {
    if (typeof value === "number") return value;
    if (!value) return 0;
    return Number(String(value).replace(",", "."));
  };

  // Util: parse de data (YYYY-MM-DD)
  const parseDate = (value) => {
    if (!value) return null;
    // força meio-dia pra evitar problema de timezone
    return new Date(value + "T12:00:00");
  };

  const formatMoney = (value) =>
    toNumber(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });

  const todayAtMidnight = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getDaysDiff = (to) => {
    const ms = to.getTime() - todayAtMidnight().getTime();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  };

  // Normaliza um item cru do JSON
  const normalizePromo = (raw) => {
    const precoNormal = toNumber(raw.preco_normal);
    const precoPromo = toNumber(raw.preco_promo);

    const descontoValor = Math.max(precoNormal - precoPromo, 0);
    const descontoPercent =
      raw.desconto_percentual != null && raw.desconto_percentual !== ""
        ? toNumber(raw.desconto_percentual)
        : precoNormal > 0
        ? Math.round((descontoValor / precoNormal) * 1000) / 10
        : 0;

    const dataFim = parseDate(raw.data_fim);
    const duracaoEstoque = !!raw.duracao_estoque;
    const somenteAVista = !!raw.somente_a_vista;

    const estoqueLoja1 = toNumber(raw.estoque_loja1);
    const estoqueLoja2 = toNumber(raw.estoque_loja2);
    const estoqueTotal = estoqueLoja1 + estoqueLoja2;

    // Promo ativa?
    const hoje = todayAtMidnight();
    let ativa = true;
    let diasRestantes = null;

    if (!duracaoEstoque && dataFim) {
      if (dataFim < hoje) {
        ativa = false;
      } else {
        diasRestantes = getDaysDiff(dataFim);
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
      somenteAVista,
      estoqueLoja1,
      estoqueLoja2,
      estoqueTotal,
      ativa,
      diasRestantes,
    };
  };

  const fetchPromos = async () => {
    try {
      const res = await fetch(PROMOS_JSON_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("Erro ao carregar JSON de promoções");
      const data = await res.json();

      state.rawPromos = Array.isArray(data) ? data : [];
      state.activePromos = state.rawPromos
        .map(normalizePromo)
        .filter((p) => p.ativa);

      buildCategoryOptions();
      applyFilters();
      startCountdownTimer();
    } catch (err) {
      console.error(err);
      setErrorState("Erro ao carregar promoções.");
    }
  };

  const setErrorState = (message) => {
    if (els.count) els.count.textContent = message;
    if (els.grid) els.grid.innerHTML = "";
  };

  // Preenche o select de categorias
  const buildCategoryOptions = () => {
    if (!els.category) return;

    const categorias = new Set();
    state.activePromos.forEach((p) => {
      if (p.categoria) categorias.add(p.categoria);
    });

    els.category.innerHTML = `<option value="">Todas as categorias</option>`;

    Array.from(categorias)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        els.category.appendChild(opt);
      });
  };

  // Aplica search/filtro/sort
  const applyFilters = () => {
    let list = [...state.activePromos];

    // search
    if (state.filters.search) {
      const term = state.filters.search.toLowerCase();
      list = list.filter((p) => {
        const texto =
          (p.nome || "") +
          " " +
          (p.descricao_resumida || "") +
          " " +
          (p.categoria || "") +
          " " +
          (p.subcategoria || "");
        return texto.toLowerCase().includes(term);
      });
    }

    // categoria
    if (state.filters.category) {
      list = list.filter((p) => p.categoria === state.filters.category);
    }

    // sort
    switch (state.filters.sort) {
      case "discountPercent":
        list.sort((a, b) => b.descontoPercent - a.descontoPercent);
        break;
      case "discountValue":
        list.sort((a, b) => b.descontoValor - a.descontoValor);
        break;
      case "priceAsc":
        list.sort((a, b) => a.precoPromo - b.precoPromo);
        break;
      case "urgency":
      default:
        list.sort((a, b) => {
          const aDias = a.diasRestantes ?? 999;
          const bDias = b.diasRestantes ?? 999;
          if (aDias !== bDias) return aDias - bDias;
          return b.descontoPercent - a.descontoPercent;
        });
        break;
    }

    state.filteredPromos = list;
    renderPromos();
  };

  const renderPromos = () => {
    els.grid.innerHTML = "";
    state.timers = [];

    if (state.filteredPromos.length === 0) {
      els.grid.setAttribute("hidden", "true");
      els.empty.removeAttribute("hidden");
      if (els.count) els.count.textContent = "Nenhuma promoção ativa";
      return;
    }

    els.grid.removeAttribute("hidden");
    els.empty.setAttribute("hidden", "true");

    if (els.count) {
      const qtd = state.filteredPromos.length;
      els.count.textContent = `${qtd} promoção${qtd === 1 ? "" : "es"} ativa${
        qtd === 1 ? "" : "s"
      }`;
    }

    const fragment = document.createDocumentFragment();

    state.filteredPromos.forEach((promo) => {
      const card = createPromoCard(promo);
      fragment.appendChild(card);
    });

    els.grid.appendChild(fragment);
  };

  const createPromoCard = (promo) => {
    const card = document.createElement("article");
    card.className = "promo-card fade-in-up";

    const badgeText = getBadgeText(promo);
    const tagText =
      promo.descontoPercent > 0
        ? `${promo.descontoPercent.toFixed(1).replace(".0", "")}% OFF`
        : "";

    const estoqueMsg =
      promo.estoqueTotal > 0
        ? `Loja 1: ${promo.estoqueLoja1} | Loja 2: ${promo.estoqueLoja2}`
        : "Últimas unidades – consulte disponibilidade";

    const prazoMsg = getPrazoMessage(promo);

    const whatsUrl = buildWhatsUrl(promo);

    const imgFile =
      promo.imagem && String(promo.imagem).trim() !== ""
        ? promo.imagem
        : "placeholder-promo.jpg";
    const imgSrc = IMG_PROMO_BASE_PATH + imgFile;

    card.innerHTML = `
      <div class="promo-card__ribbon">${badgeText}</div>

      <div class="promo-card__image-wrapper">
        <img src="${imgSrc}" alt="${
      promo.nome || ""
    }" class="promo-card__image" loading="lazy" />
        ${
          tagText
            ? `<div class="promo-card__discount-tag">
                ${tagText}
              </div>`
            : ""
        }
      </div>

      <div class="promo-card__content">
        <div class="promo-card__category">${
          promo.categoria || "Sem categoria"
        }</div>
        <h3 class="promo-card__title">${promo.nome || ""}</h3>

        <p class="promo-card__subtitle">
          ${promo.descricao_resumida || promo.subcategoria || ""}
        </p>

        <div class="promo-card__prices">
          <div class="promo-card__price-main">
            <span class="promo-card__label">Por</span>
            <span class="promo-card__price-current">${formatMoney(
              promo.precoPromo
            )}</span>
          </div>

          <div class="promo-card__price-extra">
            ${
              promo.precoNormal > 0
                ? `<span class="promo-card__price-old">De ${formatMoney(
                    promo.precoNormal
                  )}</span>`
                : ""
            }
            ${
              promo.descontoValor > 0
                ? `<span class="promo-card__price-save">Economize ${formatMoney(
                    promo.descontoValor
                  )}</span>`
                : ""
            }
          </div>
        </div>

        <div class="promo-card__meta">
          <div class="promo-card__meta-item">
            <span class="promo-card__meta-label">Estoque</span>
            <span class="promo-card__meta-value">${estoqueMsg}</span>
          </div>

          <div class="promo-card__meta-item">
            <span class="promo-card__meta-label">Validade</span>
            <span class="promo-card__meta-value">
              ${prazoMsg}
              ${
                promo.dataFim && !promo.duracaoEstoque
                  ? `<span class="promo-card__timer" data-expires="${promo.dataFim.toISOString()}"></span>`
                  : ""
              }
            </span>
          </div>
        </div>

        <div class="promo-card__badges">
          ${
            promo.somenteAVista
              ? `<span class="promo-chip">Somente à vista</span>`
              : `<span class="promo-chip">Aceita cartão</span>`
          }
          ${
            promo.estoqueTotal <= 5
              ? `<span class="promo-chip promo-chip--alerta">Estoque baixíssimo</span>`
              : `<span class="promo-chip promo-chip--ok">Estoque disponível</span>`
          }
        </div>

        <a
          href="${whatsUrl}"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn--whats promo-card__cta"
        >
          Aproveitar pelo WhatsApp
        </a>
      </div>
    `;

    // registra timer/contador
    const timerEl = card.querySelector(".promo-card__timer");
    if (timerEl) {
      state.timers.push(timerEl);
    }

    return card;
  };

  const getBadgeText = (promo) => {
    if (promo.estoqueTotal <= 3) return "🔥 Últimas unidades";
    if (promo.diasRestantes === 1) return "⏳ Só hoje";
    if (promo.diasRestantes > 1 && promo.diasRestantes <= 3)
      return `⏳ Termina em ${promo.diasRestantes} dias`;
    if (promo.duracaoEstoque) return "📦 Até acabar o estoque";
    return "✨ Promoção ativa";
  };

  const getPrazoMessage = (promo) => {
    if (promo.duracaoEstoque && !promo.dataFim) {
      return "Enquanto durar o estoque";
    }

    if (promo.dataFim && promo.diasRestantes != null) {
      if (promo.diasRestantes <= 0) return "Termina hoje";
      if (promo.diasRestantes === 1) return "Falta 1 dia";
      return `Faltam ${promo.diasRestantes} dias`;
    }

    return "Consulte na loja";
  };

  const buildWhatsUrl = (promo) => {
    const msg = `Oi, vim pelo site da Charme Cosméticos e quero aproveitar a promoção ${
      promo.nome || ""
    } por ${formatMoney(
      promo.precoPromo
    )}. Pode me informar a disponibilidade nas lojas?`;

    return `https://wa.me/${WHATS_NUMBER}?text=${encodeURIComponent(msg)}`;
  };

  // Atualiza contadores/timers a cada segundo
  const startCountdownTimer = () => {
    if (state.timers.length === 0) return;

    const updateTimers = () => {
      const now = new Date();

      state.timers.forEach((el) => {
        const iso = el.getAttribute("data-expires");
        if (!iso) return;

        const expires = new Date(iso);
        // considera até o fim do dia
        expires.setHours(23, 59, 59, 999);

        const diff = expires.getTime() - now.getTime();
        if (diff <= 0) {
          el.textContent = " • termina hoje";
          return;
        }

        const totalSec = Math.floor(diff / 1000);
        const hours = Math.floor((totalSec / 3600) % 24);
        const minutes = Math.floor((totalSec / 60) % 60);

        el.textContent = ` • ${String(hours).padStart(2, "0")}h${String(
          minutes
        ).padStart(2, "0")} restantes`;
      });
    };

    updateTimers();
    setInterval(updateTimers, 60 * 1000); // atualiza a cada 1 min (não precisa ser a cada segundo)
  };

  // Listeners/filtros
  if (els.search) {
    els.search.addEventListener("input", (e) => {
      state.filters.search = e.target.value.trim();
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

  // Carrega tudo
  fetchPromos();
});
