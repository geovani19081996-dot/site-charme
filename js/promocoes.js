// =======================================================
//  PROMOÇÕES CHARME – PREMIUM
//  - Carrega JSON, aplica filtros, paginação e timers
// =======================================================

(function () {
  const PROMOS_JSON_URL = "data/promocoes_site.json";
  const IMG_PROMO_BASE_PATH = "img/produtos/";
  const WHATS_NUMBER = "556535494404";
  const FETCH_TIMEOUT_MS = 8000;
  const PROMO_REFRESH_MS = 15000;

  // ======== Analytics (sem PII) ========
  function trackEvent(name, payload) {
    const analytics = window.CharmeAnalytics;
    if (analytics && typeof analytics.track === "function") {
      analytics.track(name, payload);
    }
  }

  function trackSectionView(sectionId, eventName) {
    const analytics = window.CharmeAnalytics;
    if (analytics && typeof analytics.trackSectionView === "function") {
      analytics.trackSectionView(sectionId, eventName);
    } else if (analytics && typeof analytics.track === "function") {
      analytics.track(eventName, { section: sectionId });
    }
  }

  // ======== CARROSSEL (Swiper) - loader (sem mexer no HTML) ========
  const SWIPER = {
    cssLocal: "css/vendor/swiper-bundle.min.css",
    jsLocal: "js/vendor/swiper-bundle.min.js",
    // Fallback opcional (CDN)
    cssCdn: "https://cdn.jsdelivr.net/npm/swiper@12.1.0/swiper-bundle.min.css",
    jsCdn: "https://cdn.jsdelivr.net/npm/swiper@12.1.0/swiper-bundle.min.js",
  };

  function hasSwiper() {
    return typeof window.Swiper === "function";
  }

  function loadCssOnce(href) {
    try {
      for (const ss of Array.from(document.styleSheets)) {
        if (ss && ss.href === href) return;
      }
    } catch (_) {}
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((s) => s.src === src);
      if (existing) {
        if (existing.dataset && existing.dataset.loaded === "1")
          return resolve();
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Falhou: " + src)),
          { once: true },
        );
        return;
      }

      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset.loaded = "0";
      s.onload = () => {
        s.dataset.loaded = "1";
        resolve();
      };
      s.onerror = () => reject(new Error("Falhou: " + src));
      document.head.appendChild(s);
    });
  }

  function ensureSwiperLoaded() {
    if (hasSwiper()) return Promise.resolve();
    if (window.__charmeSwiperPromise) return window.__charmeSwiperPromise;

    window.__charmeSwiperPromise = (async () => {
      try {
        loadCssOnce(SWIPER.cssLocal);
        await loadScriptOnce(SWIPER.jsLocal);
        return;
      } catch (e) {
        // se os locais não existirem (404), cai pro CDN
      }

      try {
        loadCssOnce(SWIPER.cssCdn);
      } catch (_) {}
      await loadScriptOnce(SWIPER.jsCdn);
    })();

    return window.__charmeSwiperPromise;
  }

  const DATA_BASES = resolveDataBases();
  const PROMOS_JSON_URLS = buildDataUrls(PROMOS_JSON_URL, PROMOS_JSON_URL);

  function normalizeBases(list) {
    const out = [];
    for (const raw of list || []) {
      const base =
        typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
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
    return normalizeBases(
      isLocal ? [localLive, remoteLive, ""] : [remoteLive, ""],
    );
  }

  function buildDataUrls(relPath, absPath) {
    return DATA_BASES.map((base) => (base ? `${base}/${absPath}` : relPath));
  }

  async function fetchJsonWithFallback(urls) {
    const list = Array.isArray(urls) ? urls : [urls];
    let lastError = null;

    for (const url of list) {
      try {
        const controller = window.AbortController
          ? new AbortController()
          : null;
        const timer = controller
          ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
          : null;
        const r = await fetch(url, {
          cache: "no-store",
          signal: controller ? controller.signal : undefined,
        });
        if (timer) clearTimeout(timer);

        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("No data source");
  }

  const IMG_FALLBACK = `${IMG_PROMO_BASE_PATH}placeholder-promo.jpg`;

  function buildImageCandidates(name) {
    const urls = [];
    if (name && name !== "placeholder-promo.jpg") {
      for (const base of DATA_BASES) {
        if (base) urls.push(`${base}/${IMG_PROMO_BASE_PATH}${name}`);
      }
      urls.push(`${IMG_PROMO_BASE_PATH}${name}`);
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

  const boot = () => {
    const grid = document.querySelector("#promocoes-grid");
    const count = document.querySelector("#promos-count");

    if (!grid || !count) {
      console.warn(
        "⚠ Área de promoções não encontrada no HTML. Script ignorado.",
      );
      return;
    }

    const section = document.querySelector("#promocoes");
    const sectionData = section && section.dataset ? section.dataset : {};
    const carouselFlag = String(sectionData.carousel || "").trim().toLowerCase();
    const useCarouselFromHtml = !["false", "0", "no", "nao", "não"].includes(carouselFlag);
    const parsedPageSize = Number.parseInt(sectionData.pageSize || "", 10);
    const pageSizeFromHtml = Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : 4;

    if (useCarouselFromHtml) ensureSwiperLoaded().catch(() => {});
    trackSectionView("promocoes", "view_promocoes");

    if (grid && !grid.dataset.analyticsBound) {
      grid.dataset.analyticsBound = "1";
      grid.addEventListener("click", (event) => {
        const target = event.target && event.target.closest
          ? event.target.closest(".promo-card")
          : null;
        if (!target) return;
        const productId = target.dataset.productId || target.dataset.codigo;
        const value = Number(target.dataset.productValue);
        const payload = { section: "promocoes" };
        if (productId) payload.product_id = productId;
        if (Number.isFinite(value)) payload.value = value;
        trackEvent("select_promo", payload);
      });
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
      pageSize: pageSizeFromHtml, // quantos cards por página
    };

    let timerStarted = false;
    let refreshHandle = null;
    let lastRenderKey = "";

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
    //  CARROSSEL (Swiper)
    // =====================================================
    const USE_CAROUSEL = useCarouselFromHtml;
    let swiperInstance = null;

    const teardownSwiperStructure = (gridEl) => {
      if (!gridEl) return;

      const wrapper = gridEl.querySelector(":scope > .swiper-wrapper");
      if (wrapper) {
        const slides = Array.from(wrapper.children);
        for (const slide of slides) {
          slide.classList.remove("swiper-slide");
          gridEl.appendChild(slide);
        }
        wrapper.remove();
      }

      gridEl
        .querySelectorAll(
          ":scope > .swiper-button-prev, :scope > .swiper-button-next, :scope > .swiper-pagination",
        )
        .forEach((el) => el.remove());

      gridEl.classList.remove(
        "swiper",
        "swiper-initialized",
        "swiper-horizontal",
        "swiper-backface-hidden",
      );
      gridEl.removeAttribute("style");
    };

    const destroySwiperIfAny = (gridEl) => {
      if (swiperInstance) {
        try {
          swiperInstance.destroy(true, true);
        } catch (_) {}
        swiperInstance = null;
      }
      teardownSwiperStructure(gridEl);
    };

    const buildSwiperStructure = (gridEl) => {
      gridEl.classList.add("swiper");

      const wrapper = document.createElement("div");
      wrapper.className = "swiper-wrapper";

      const slides = Array.from(gridEl.children);
      for (const slide of slides) {
        slide.classList.add("swiper-slide");
        wrapper.appendChild(slide);
      }

      gridEl.appendChild(wrapper);

      const prev = document.createElement("button");
      prev.className = "swiper-button-prev";
      prev.type = "button";
      prev.setAttribute("aria-label", "Anterior");

      const next = document.createElement("button");
      next.className = "swiper-button-next";
      next.type = "button";
      next.setAttribute("aria-label", "Próximo");

      const pagination = document.createElement("div");
      pagination.className = "swiper-pagination";

      gridEl.appendChild(prev);
      gridEl.appendChild(next);
      gridEl.appendChild(pagination);

      return { prev, next, pagination };
    };

    const initSwiper = (gridEl) => {
      if (!hasSwiper()) return false;
      if (!gridEl || gridEl.children.length < 2) return false;

      const { prev, next, pagination } = buildSwiperStructure(gridEl);

      try {
        swiperInstance = new window.Swiper(gridEl, {
          slidesPerView: 2,
          slidesPerGroup: 2,
          spaceBetween: 14,
          loop: true,
          watchOverflow: true,
          pagination: {
            el: pagination,
            clickable: true,
          },
          navigation: {
            nextEl: next,
            prevEl: prev,
          },
          breakpoints: {
            768: {
              slidesPerView: 3,
              slidesPerGroup: 3,
              spaceBetween: 16,
            },
            1024: {
              slidesPerView: 4,
              slidesPerGroup: 4,
              spaceBetween: 18,
            },
          },
        });

        if (els.pagination) els.pagination.hidden = true;
        return true;
      } catch (_) {
        teardownSwiperStructure(gridEl);
        swiperInstance = null;
        return false;
      }
    };

    const maybeStartCarousel = (gridEl) => {
      ensureSwiperLoaded()
        .then(() => initSwiper(gridEl))
        .catch(() => {
          // se falhar, segue grid
        });
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

    const escapeHtml = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const escapeAttr = (s) => escapeHtml(s).replace(/`/g, "&#96;");

    const formatDateBR = (d) => {
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    const daysBetween = (to) => {
      const ms = to.getTime() - todayMidnight();
      return Math.ceil(ms / 86400000);
    };

    const getTotalPages = () => {
      const total = state.filteredPromos.length;
      if (total === 0) return 1;
      return Math.ceil(total / state.pageSize);
    };

    const updateSingleGridMode = (gridEl) => {
      if (!gridEl) return;
      const totalCards = gridEl.querySelectorAll(".promo-card").length;
      if (totalCards === 1) gridEl.classList.add("promos-grid--single");
      else gridEl.classList.remove("promos-grid--single");
    };

    const scrollToPromosTop = () => {
      const section = document.querySelector("#promocoes");
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const absoluteTop = rect.top + window.pageYOffset - 80;

      // window.scrollTo({
      //   top: absoluteTop < 0 ? 0 : absoluteTop,
      //   behavior: "smooth",
      // });
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
        applyFilters({ resetPage: false, reason: "refresh" });
        if (!timerStarted) {
          startTimer();
          timerStarted = true;
        }
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

      const selected = state.filters.category;
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

      if (selected) {
        els.category.value = selected;
      }
    };

    // =====================================================
    //  FILTROS & ORDENAÇÃO
    // =====================================================
    const applyFilters = (opts = {}) => {
      const resetPage = opts.resetPage !== undefined ? opts.resetPage : true;
      const reason = opts.reason || "user";

      let arr = [...state.activePromos];

      // Texto
      if (state.filters.search) {
        const t = state.filters.search.toLowerCase();
        arr = arr.filter((p) =>
          `${p.nome ?? ""} ${p.descricao_resumida ?? ""} ${p.categoria ?? ""} ${p.subcategoria ?? ""}`
            .toLowerCase()
            .includes(t),
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

      if (resetPage) {
        state.page = 1;
      } else {
        const totalPages = Math.max(1, Math.ceil(arr.length / state.pageSize));
        if (state.page > totalPages) state.page = totalPages;
        if (state.page < 1) state.page = 1;
      }

      render({ reason });
    };

    // =====================================================
    //  LABEL DO FILTRO ATUAL
    // =====================================================
    const updateFilterLabel = () => {
      if (!els.currentFilter) return;

      let label = "Todas as categorias";

      if (state.filters.category && els.category) {
        const opt = Array.from(els.category.options).find(
          (o) => o.value === state.filters.category,
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
      if (USE_CAROUSEL) {
        if (els.pagination) els.pagination.hidden = true;
        if (els.pageInfo) els.pageInfo.textContent = "";
        return;
      }

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
    const render = (opts = {}) => {
      const reason = opts.reason || "user";
      const total = state.filteredPromos.length;

      if (total === 0) {
        destroySwiperIfAny(els.grid);
        lastRenderKey = `EMPTY|${state.filters.search}|${state.filters.category}|${state.filters.sort}`;
        els.grid.innerHTML = "";
        state.timers = [];
        els.grid.hidden = true;
        updateSingleGridMode(els.grid);
        if (els.empty) els.empty.hidden = false;
        els.count.textContent = "Nenhuma promoção ativa";
        if (els.pagination) els.pagination.hidden = true;
        if (els.currentFilter) els.currentFilter.hidden = true;
        return;
      }

      const useCarousel = USE_CAROUSEL;

      els.grid.hidden = false;
      if (els.empty) els.empty.hidden = true;

      const totalPages = getTotalPages();
      if (useCarousel) {
        state.page = 1;
      } else if (state.page > totalPages) {
        state.page = totalPages;
      }

      const start = (state.page - 1) * state.pageSize;
      const end = start + state.pageSize;
      const pageItems = useCarousel
        ? state.filteredPromos
        : state.filteredPromos.slice(start, end);

      const keyText = (s) =>
        String(s || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40);

      const pageKey =
        `${state.page}|${total}|` +
        pageItems
          .map((p) => {
            const nome = keyText(p.nome);
            const desc = keyText(p.descricao_resumida);
            const cat = keyText(p.categoria);
            const img = keyText(p.imagem);
            return `${p.codigo}:${p.precoPromo}:${p.precoNormal}:${p.estoqueTotal}:${p.diasRestantes ?? ""}:${p.descontoPercent ?? ""}:${img}:${nome}:${desc}:${cat}`;
          })
          .join(",");

      if (reason === "refresh" && pageKey === lastRenderKey) {
        const qtd = pageItems.length;
        els.count.textContent = `${qtd} de ${total} promoção${total > 1 ? "es" : ""} ativas`;
        updateSingleGridMode(els.grid);
        updateFilterLabel();
        updatePaginationControls();
        return;
      }

      lastRenderKey = pageKey;

      destroySwiperIfAny(els.grid);
      els.grid.innerHTML = "";
      state.timers = [];

      const qtd = pageItems.length;
      els.count.textContent = `${qtd} de ${total} promoção${total > 1 ? "es" : ""} ativas`;

      const fragment = document.createDocumentFragment();
      pageItems.forEach((p) => fragment.appendChild(makeCard(p)));
      els.grid.appendChild(fragment);

      updateSingleGridMode(els.grid);
      updateFilterLabel();
      updatePaginationControls();
      if (useCarousel) maybeStartCarousel(els.grid);
    };

    // =====================================================
    //  CRIAÇÃO DO CARD
    // =====================================================
    const makeCard = (p) => {
      const el = document.createElement("article");
      el.className = "promo-card fade-in-up";
      el.dataset.codigo = String(p.codigo ?? "");
      if (p.codigo != null) el.dataset.productId = String(p.codigo);
      if (Number.isFinite(Number(p.preco_promo)))
        el.dataset.productValue = String(Number(p.preco_promo));
      if (p.categoria) el.dataset.categoria = String(p.categoria);

      const imgName =
        p.imagem && String(p.imagem).trim() !== ""
          ? String(p.imagem).trim()
          : "placeholder-promo.jpg";

      const badge = getBadge(p);
      const prazo = getPrazo(p);

      const nome = escapeHtml(p.nome || "Promoção");
      const categoria = escapeHtml(p.categoria || "Promoção");
      const desc = escapeHtml(p.descricao_resumida || p.subcategoria || "");
      const alt = escapeAttr(p.nome || "Promoção");

      // Meta compacta (tile): sem "Total:" e sem texto longo.
      const metaEstoque = `Estoque: ${p.estoqueTotal ?? 0}`;
      const metaValidade = `Validade: ${prazo}`;

      el.innerHTML = `
      <div class="promo-card__image-wrapper">
        <img
          src="${IMG_PROMO_BASE_PATH}placeholder-promo.jpg"
          loading="lazy"
          alt="${alt}"
          class="promo-card__image"
        />
        ${
          p.descontoPercent > 0
            ? `<div class="promo-card__discount-tag">${escapeHtml(p.descontoPercent)}% OFF</div>`
            : ""
        }
        <div class="promo-card__ribbon">${escapeHtml(badge)}</div>
      </div>

      <div class="promo-card__content">
        <div class="promo-card__category">${categoria}</div>

        <h3 class="promo-card__title" title="${alt}">${nome}</h3>

        ${desc ? `<p class="promo-card__subtitle">${desc}</p>` : ""}

        <div class="promo-card__prices">
          <div class="promo-card__price-main">
            <span class="promo-card__label">Por</span>
            <span class="promo-card__price-current">${money(p.precoPromo)}</span>
          </div>

          <div class="promo-card__price-extra">
            ${
              p.precoNormal
                ? `<span class="promo-card__price-old">De ${money(p.precoNormal)}</span>`
                : ""
            }
            ${
              p.descontoValor
                ? `<span class="promo-card__price-save">-${money(p.descontoValor)}</span>`
                : ""
            }
          </div>
        </div>

        <div class="promo-card__meta promo-card__meta--compact">
          <div class="promo-card__meta-item">
            <span class="promo-card__meta-value">${escapeHtml(metaEstoque)}</span>
          </div>

          <div class="promo-card__meta-item">
            <span class="promo-card__meta-value">
              ${escapeHtml(metaValidade)}
              ${
                p.dataFim && !p.duracaoEstoque
                  ? `<span class="promo-card__timer" data-expires="${p.dataFim.toISOString()}"></span>`
                  : ""
              }
            </span>
          </div>
        </div>

        <a class="btn btn--whats promo-card__cta" target="_blank" rel="noopener" href="${whats(p)}">
          Chamar no WhatsApp
        </a>
      </div>
    `;

      const imgEl = el.querySelector(".promo-card__image");
      if (imgEl) applyImageFallback(imgEl, imgName);

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
      // Nunca mostrar "null dias" (isso mata qualquer vibe premium)
      if (p.duracaoEstoque && !p.dataFim) return "Enquanto durar o estoque";
      if (!p.dataFim) return "Consulte na loja";

      // Se houver dataFim mas não temos diasRestantes por algum motivo, mostra a data.
      if (p.diasRestantes === null || p.diasRestantes === undefined) {
        return `Até ${formatDateBR(p.dataFim)}`;
      }

      if (p.diasRestantes <= 0) return "Termina hoje";
      if (p.diasRestantes === 1) return "Falta 1 dia";
      return `Faltam ${p.diasRestantes} dias`;
    };

    const whats = (p) => {
      const msg = `Oi! Quero aproveitar a promoção ${p.nome} por ${money(
        p.precoPromo,
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

          el.textContent = ` • ${String(h).padStart(2, "0")}h${String(
            m,
          ).padStart(2, "0")} restantes`;
        });
      };

      tick();
      setInterval(tick, 60000);
    };

    const scheduleRefresh = () => {
      if (PROMO_REFRESH_MS < 5000) return;
      if (refreshHandle) return;
      refreshHandle = setInterval(loadPromos, PROMO_REFRESH_MS);
    };

    // =====================================================
    //  EVENTOS
    // =====================================================
    if (els.search) {
      els.search.addEventListener("input", (e) => {
        state.filters.search = e.target.value.toLowerCase();
        applyFilters({ resetPage: true, reason: "user" });
      });
    }

    if (els.category) {
      els.category.addEventListener("change", (e) => {
        state.filters.category = e.target.value;
        applyFilters({ resetPage: true, reason: "user" });
      });
    }

    if (els.sort) {
      els.sort.addEventListener("change", (e) => {
        state.filters.sort = e.target.value;
        applyFilters({ resetPage: true, reason: "user" });
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
    scheduleRefresh();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
