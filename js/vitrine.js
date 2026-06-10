/*!
  Charme Cosméticos - Vitrine (ao vivo)
  - Renderiza cards a partir do JSON local/publicado
  - Agora também pode virar carrossel (Swiper), como a Sephora
*/
(function () {
  "use strict";

  // ======== CONFIG ========
  const ENDPOINT = "/data/produtos.json"; // gerado automaticamente no servidor
  const MAX_ITEMS = 12;
  const PLACEHOLDER_IMG = "/img/placeholder_produto.png";
  const IMG_BASE_PATH = "img/produtos/";

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
  // Carrega Swiper local e aplica no grid da vitrine, com fallback (se falhar, fica grid mesmo).
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
      // evita duplicar
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

  let swiperInstance = null;

  function teardownSwiperStructure(grid) {
    if (!grid) return;

    const wrapper = grid.querySelector(":scope > .swiper-wrapper");
    if (wrapper) {
      const slides = Array.from(wrapper.children);
      for (const slide of slides) {
        slide.classList.remove("swiper-slide");
        grid.appendChild(slide);
      }
      wrapper.remove();
    }

    grid
      .querySelectorAll(
        ":scope > .swiper-button-prev, :scope > .swiper-button-next, :scope > .swiper-pagination",
      )
      .forEach((el) => el.remove());

    grid.classList.remove(
      "swiper",
      "swiper-initialized",
      "swiper-horizontal",
      "swiper-backface-hidden",
    );
    grid.removeAttribute("style");
  }

  function destroySwiperIfAny(grid) {
    if (swiperInstance) {
      try {
        swiperInstance.destroy(true, true);
      } catch (_) {}
      swiperInstance = null;
    }
    teardownSwiperStructure(grid);
  }

  function buildSwiperStructure(grid) {
    grid.classList.add("swiper");

    const wrapper = document.createElement("div");
    wrapper.className = "swiper-wrapper";

    const slides = Array.from(grid.children);
    for (const slide of slides) {
      slide.classList.add("swiper-slide");
      wrapper.appendChild(slide);
    }

    grid.appendChild(wrapper);

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

    grid.appendChild(prev);
    grid.appendChild(next);
    grid.appendChild(pagination);

    return { prev, next, pagination };
  }

  function initSwiper(grid) {
    if (!hasSwiper()) return false;
    if (!grid || grid.children.length < 2) return false;

    const { prev, next, pagination } = buildSwiperStructure(grid);

    try {
      swiperInstance = new window.Swiper(grid, {
        slidesPerView: 1,
        slidesPerGroup: 1,
        spaceBetween: 12,
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
          360: {
            slidesPerView: 2,
            slidesPerGroup: 2,
            spaceBetween: 14,
          },
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
      return true;
    } catch (_) {
      teardownSwiperStructure(grid);
      swiperInstance = null;
      return false;
    }
  }
  function maybeStartCarousel(gridEl) {
    ensureSwiperLoaded()
      .then(() => initSwiper(gridEl))
      .catch(() => {});
  }

  // ======== HELPERS ========
  function safeText(v) {
    return (v ?? "").toString().trim();
  }

  function escapeHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function moneyBRL(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function applyImageFallback(img) {
    if (!img) return;
    img.loading = "lazy";
    img.decoding = "async";

    const rawSrc = (img.getAttribute("src") || "").trim();
    if (!rawSrc) {
      img.src = PLACEHOLDER_IMG;
    }
    img.onerror = () => {
      if (img.dataset && img.dataset.fallbackApplied === "1") return;
      if (img.dataset) img.dataset.fallbackApplied = "1";
      img.src = PLACEHOLDER_IMG;
    };
  }

  function normalizeImageUrl(raw) {
    let url = safeText(raw);
    if (!url) return PLACEHOLDER_IMG;
    if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) {
      url = `${IMG_BASE_PATH}${url}`;
    }
    if (
      window.location &&
      window.location.protocol === "https:" &&
      url.startsWith("http://")
    ) {
      url = "https://" + url.slice(7);
    }
    return url;
  }

  // ======== RENDER ========
  let lastKey = "";

  function renderList(products) {
    const grid = document.getElementById("vitrine-grid");
    if (!grid) return;

    // Se já estava como carrossel, desmonta antes de re-renderizar
    destroySwiperIfAny(grid);

    // Normaliza lista
    const list = Array.isArray(products) ? products : [];
    const items = list.slice(0, MAX_ITEMS);

    // Chave simples pra não ficar re-renderizando igual um doido
    const key = items
      .map(
        (p) =>
          `${safeText(p?.id)}|${safeText(p?.preco)}|${safeText(p?.estoque)}|${safeText(p?.imagem)}`,
      )
      .join("::");

    if (key && key === lastKey) return;
    lastKey = key;

    grid.innerHTML = "";

    const fragment = document.createDocumentFragment();

    for (const p of items) {
      const nomeRaw = safeText(p?.nome) || "Produto";
      const categoriaRaw = safeText(p?.categoria) || "Novidade";
      const marcaRaw = safeText(p?.marca || p?.unidade);
      const precoRaw = moneyBRL(p?.preco);
      const nome = escapeHtml(nomeRaw);
      const categoria = escapeHtml(categoriaRaw);
      const marca = escapeHtml(marcaRaw);
      const preco = escapeHtml(precoRaw || "Consulte");
      const url = safeText(p?.url) || "#";
      const urlSafe = escapeHtml(url);
      const imgUrl = normalizeImageUrl(p?.imagem);
      const imgUrlSafe = escapeHtml(imgUrl);
      const productId = p?.codigo ?? p?.id ?? "";
      const productValue = Number(p?.preco);
      const estoqueTotal =
        Number(p?.estoque_loja1 || 0) + Number(p?.estoque_loja2 || 0);

      const card = document.createElement("article");
      card.className = "promo-card fade-in-up";
      if (productId !== "") card.dataset.productId = String(productId);
      if (Number.isFinite(productValue))
        card.dataset.productValue = String(productValue);

      card.innerHTML = `
        <div class="promo-card__image-wrapper">
          <img class="promo-card__image" alt="${nome}" src="${imgUrlSafe}">
          <div class="promo-card__ribbon">Atualizado agora</div>
        </div>

        <div class="promo-card__content">
          <div class="promo-card__category">${categoria}</div>
          <h3 class="promo-card__title" title="${nome}">${nome}</h3>
          ${marca ? `<p class="promo-card__subtitle">${marca}</p>` : ""}

          <div class="promo-card__prices">
            <div class="promo-card__price-main">
              <span class="promo-card__label">Por</span>
              <span class="promo-card__price-current">${preco}</span>
            </div>
            <div class="promo-card__price-extra"></div>
          </div>

          <div class="promo-card__meta promo-card__meta--compact">
            <div class="promo-card__meta-item">
              <span class="promo-card__meta-value">Estoque: ${estoqueTotal}</span>
            </div>
            <div class="promo-card__meta-item">
              <span class="promo-card__meta-value">Atualizado ao vivo</span>
            </div>
          </div>

          <a class="btn btn--outline promo-card__cta" href="${urlSafe}" target="_blank" rel="noopener">
            Ver produto
          </a>
        </div>
      `;

      const img = card.querySelector("img.promo-card__image");
      applyImageFallback(img);

      fragment.appendChild(card);
    }

    grid.appendChild(fragment);

    // Transforma em carrossel (se Swiper estiver disponível / carregar)
    maybeStartCarousel(grid);
  }

  // ======== DATA ========
  async function loadVitrine() {
    try {
      const r = await fetch(ENDPOINT, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      // aceita tanto array quanto objeto com .items
      const items = Array.isArray(data) ? data : data?.items;
      renderList(items || []);
    } catch (e) {
      // se falhar, não quebra a home
      // (fica a vitrine como estava)
      // console.debug("Vitrine falhou:", e);
    }
  }

  function scheduleRefresh() {
    // evita ficar fazendo spam no servidor
    setInterval(loadVitrine, 60 * 1000);
  }

  // ======== BOOT ========
  const boot = () => {
    // Carrega Swiper em paralelo (tenta local e cai pro CDN). Depois do load dá pra testar:
    // typeof window.Swiper === "function"
    ensureSwiperLoaded().catch(() => {});

    trackSectionView("vitrine", "view_vitrine");

    const grid = document.getElementById("vitrine-grid");
    if (grid && !grid.dataset.analyticsBound) {
      grid.dataset.analyticsBound = "1";
      grid.addEventListener("click", (event) => {
        const card = event.target && event.target.closest
          ? event.target.closest(".promo-card")
          : null;
        if (!card) return;
        const productId = card.dataset.productId;
        const value = Number(card.dataset.productValue);
        const payload = { section: "vitrine" };
        if (productId) payload.product_id = productId;
        if (Number.isFinite(value)) payload.value = value;
        trackEvent("select_item", payload);
      });
    }

    loadVitrine();
    scheduleRefresh();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

