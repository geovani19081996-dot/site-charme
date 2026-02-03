/*!
  Charme Cosméticos - Vitrine (ao vivo)
  - Renderiza cards a partir do JSON do live-data
  - Agora também pode virar carrossel (Slick), como a Sephora
*/
(function () {
  "use strict";

  // ======== CONFIG ========
  const ENDPOINT = "/data/produtos.json"; // vindo do live-data
  const MAX_ITEMS = 12;

  // ======== CARROSSEL (Slick) - loader (sem mexer no HTML) ========
  // O site da Sephora usa Slick: ele clona slides e usa translateX pra "pular" os clones.
  // Aqui a gente carrega Slick e aplica no grid da vitrine, com fallback (se falhar, fica grid mesmo).
  const SLICK = {
    // Preferência: arquivos locais (mais "à prova de susto" que depender de CDN)
    jqLocal: "js/vendor/jquery-3.7.1.min.js",
    slickJsLocal: "js/vendor/slick.min.js",
    cssLocal: ["css/vendor/slick.css", "css/vendor/slick-theme.css"],

    // Fallback: CDN (caso os locais não existam)
    jqCdn: "https://code.jquery.com/jquery-3.7.1.min.js",
    slickJsCdn:
      "https://cdn.jsdelivr.net/npm/slick-carousel@1.8.1/slick/slick.min.js",
    cssCdn: [
      "https://cdn.jsdelivr.net/npm/slick-carousel@1.8.1/slick/slick.css",
      "https://cdn.jsdelivr.net/npm/slick-carousel@1.8.1/slick/slick-theme.css",
    ],
  };

  function hasSlick() {
    return !!(
      window.jQuery &&
      window.jQuery.fn &&
      typeof window.jQuery.fn.slick === "function"
    );
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

  function ensureSlickLoaded() {
    if (hasSlick()) return Promise.resolve();
    if (window.__charmeSlickPromise) return window.__charmeSlickPromise;

    window.__charmeSlickPromise = (async () => {
      try {
        SLICK.cssLocal.forEach(loadCssOnce);
        await loadScriptOnce(SLICK.jqLocal);
        await loadScriptOnce(SLICK.slickJsLocal);
        return;
      } catch (e) {
        // se os locais não existirem (404), cai pro CDN
      }

      try {
        SLICK.cssCdn.forEach(loadCssOnce);
      } catch (_) {}
      await loadScriptOnce(SLICK.jqCdn);
      await loadScriptOnce(SLICK.slickJsCdn);
    })();

    return window.__charmeSlickPromise;
  }

  function destroySlickIfAny(el) {
    if (!hasSlick()) return;
    const $ = window.jQuery;
    const $el = $(el);
    if ($el.hasClass("slick-initialized")) {
      try {
        $el.slick("unslick");
      } catch (_) {}
    }
  }

  function initSlick(el) {
    if (!hasSlick()) return;
    const $ = window.jQuery;
    const $el = $(el);

    destroySlickIfAny(el);

    // pouco item? fica grid mesmo
    if ($el.children().length < 2) return;

    $el.slick({
      infinite: true,
      centerMode: false,
      variableWidth: false,

      // estilo Sephora: "páginas" (4 por vez no desktop)
      slidesToShow: 4,
      slidesToScroll: 4,

      dots: true,
      arrows: true,
      adaptiveHeight: false,
      swipeToSlide: true,
      speed: 250,

      prevArrow:
        '<button type="button" class="slick-prev" aria-label="Anterior">‹</button>',
      nextArrow:
        '<button type="button" class="slick-next" aria-label="Próximo">›</button>',

      // responsivo: tablet e mobile
      responsive: [
        { breakpoint: 1024, settings: { slidesToShow: 3, slidesToScroll: 3 } },
        { breakpoint: 768, settings: { slidesToShow: 2, slidesToScroll: 2 } },
      ],
    });
  }

  function maybeStartCarousel(gridEl) {
    ensureSlickLoaded()
      .then(() => initSlick(gridEl))
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
    destroySlickIfAny(grid);

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

    // Transforma em carrossel (se Slick estiver disponível / carregar)
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
    // Carrega Slick em paralelo (tenta local e cai pro CDN). Depois do load dá pra testar no console:
    // !!(window.jQuery && jQuery.fn && jQuery.fn.slick)
    ensureSlickLoaded().catch(() => {});

    loadVitrine();
    scheduleRefresh();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
