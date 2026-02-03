/*!
  Charme Cosméticos - Vitrine (ao vivo)
  - Renderiza cards a partir do JSON do live-data
  - Agora também pode virar carrossel (Swiper), como a Sephora
*/
(function () {
  "use strict";

  // ======== CONFIG ========
  const ENDPOINT = "/data/produtos.json"; // vindo do live-data
  const MAX_ITEMS = 12;

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
    if (!hasSwiper()) return;
    if (!grid || grid.children.length < 2) return;

    const { prev, next, pagination } = buildSwiperStructure(grid);

    try {
      swiperInstance = new window.Swiper(grid, {
        slidesPerView: 2,
        slidesPerGroup: 2,
        spaceBetween: 16,
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
            spaceBetween: 18,
          },
          1024: {
            slidesPerView: 4,
            slidesPerGroup: 4,
            spaceBetween: 20,
          },
        },
      });
    } catch (_) {
      teardownSwiperStructure(grid);
      swiperInstance = null;
    }
  }

  function maybeStartCarousel(gridEl) {
    ensureSwiperLoaded()
      .then(() => initSwiper(gridEl))
      .catch(() => {
        // se falhar, paciência: continua como grid
      });
  }

  // ======== HELPERS ========
  function safeText(v) {
    return (v ?? "").toString().trim();
  }

  function moneyBRL(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function applyImageFallback(img) {
    if (!img) return;
    img.onerror = () => {
      img.onerror = null;
      img.src = "/img/placeholder_produto.png";
    };
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
      const nome = safeText(p?.nome);
      const marca = safeText(p?.marca);
      const preco = moneyBRL(p?.preco);
      const url = safeText(p?.url) || "#";
      const imgUrl = safeText(p?.imagem) || "/img/placeholder_produto.png";

      const card = document.createElement("article");
      card.className = "vitrine-card";

      card.innerHTML = `
        <a class="vitrine-link" href="${url}" target="_blank" rel="noopener">
          <div class="vitrine-imgwrap">
            <img class="vitrine-img" alt="${nome}" src="${imgUrl}">
          </div>
          <div class="vitrine-info">
            <div class="vitrine-marca">${marca}</div>
            <div class="vitrine-nome">${nome}</div>
            <div class="vitrine-preco">${preco}</div>
          </div>
        </a>
      `;

      const img = card.querySelector("img.vitrine-img");
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

    loadVitrine();
    scheduleRefresh();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
