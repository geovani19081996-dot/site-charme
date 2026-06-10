// Charme Cosméticos — site core
// Mantém apenas funções básicas do site:
// - menu mobile
// - rastreio simples de cliques
// - web vitals, quando disponível
// - eventos básicos por página

(function () {
  "use strict";

  // ===== Analytics simples, sem PII =====
  const ANALYTICS_KEY = "charme_session_id";
  const TELEMETRY_ENDPOINT =
    typeof window !== "undefined" ? window.CHARME_TELEMETRY_ENDPOINT : null;

  function getSessionId() {
    try {
      let sid = localStorage.getItem(ANALYTICS_KEY);

      if (!sid) {
        sid =
          "s_" +
          Math.random().toString(36).slice(2, 10) +
          Date.now().toString(36);

        localStorage.setItem(ANALYTICS_KEY, sid);
      }

      return sid;
    } catch {
      return "s_" + Math.random().toString(36).slice(2, 10);
    }
  }

  function getCurrentPath() {
    if (!window.location || !window.location.pathname) return "/";
    return window.location.pathname;
  }

  function normalizePath(path) {
    if (!path || path === "/index.html") return "/";
    return path.replace(/\/+$/, "") || "/";
  }

  function buildEvent(eventName, payload) {
    const evt = {
      event_name: eventName,
      timestamp: new Date().toISOString(),
      page: normalizePath(getCurrentPath()),
      session_id: getSessionId(),
    };

    if (payload && payload.section) evt.section = payload.section;

    if (payload && payload.product_id != null) {
      evt.product_id = String(payload.product_id);
    }

    if (payload && Number.isFinite(payload.value)) {
      evt.value = Number(payload.value);
    }

    return evt;
  }

  function track(eventName, payload) {
    const evt = buildEvent(eventName, payload);

    if (typeof window.gtag === "function") {
      const gtagPayload = {
        session_id: evt.session_id,
        page: evt.page,
      };

      if (evt.section) gtagPayload.section = evt.section;
      if (evt.product_id) gtagPayload.product_id = evt.product_id;
      if (typeof evt.value === "number") gtagPayload.value = evt.value;

      if (eventName === "web_vitals") {
        if (evt.section) gtagPayload.metric_name = evt.section;
        if (typeof evt.value === "number") {
          gtagPayload.metric_value = evt.value;
        }
      }

      window.gtag("event", eventName, gtagPayload);
      return;
    }

    if (window.console && typeof console.debug === "function") {
      console.debug("[analytics]", evt);
    }

    if (TELEMETRY_ENDPOINT) {
      fetch(TELEMETRY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evt),
        keepalive: true,
      }).catch(() => {});
    }
  }

  function trackSectionView(sectionId, eventName) {
    const el = document.getElementById(sectionId);
    if (!el) return;
    if (el.dataset && el.dataset.tracked === "1") return;

    const fire = () => {
      if (el.dataset) el.dataset.tracked = "1";
      track(eventName, { section: sectionId });
    };

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              fire();
              observer.disconnect();
            }
          });
        },
        {
          root: null,
          threshold: 0.2,
          rootMargin: "0px 0px -20% 0px",
        },
      );

      observer.observe(el);
      return;
    }

    fire();
  }

  function initWebVitals() {
    if (!window.webVitals) return;

    const send = (metric) => {
      if (!metric || !metric.name) return;

      track("web_vitals", {
        section: metric.name,
        value: Math.round(metric.value * 100) / 100,
      });
    };

    if (typeof window.webVitals.onLCP === "function") {
      window.webVitals.onLCP(send);
    }

    if (typeof window.webVitals.onCLS === "function") {
      window.webVitals.onCLS(send);
    }

    if (typeof window.webVitals.onINP === "function") {
      window.webVitals.onINP(send);
    }
  }

  function initClickTracking() {
    document.addEventListener("click", (event) => {
      const target = event.target;

      const link =
        target && typeof target.closest === "function"
          ? target.closest("a")
          : null;

      if (!link) return;

      const href = link.getAttribute("href") || "";

      if (href.includes("wa.me") || href.includes("api.whatsapp.com")) {
        track("click_whatsapp", { section: "link" });
      }

      if (href.includes("instagram.com")) {
        track("click_instagram", { section: "link" });
      }

      if (href.includes("facebook.com")) {
        track("click_facebook", { section: "link" });
      }

      if (href.includes("google.com/maps") || href.includes("share.google")) {
        track("click_maps", { section: "link" });
      }
    });
  }

  function initMobileDrawer() {
    const drawer = document.getElementById("mobile-drawer");
    if (!drawer) return;

    const openers = document.querySelectorAll("[data-mobile-drawer-open]");

    openers.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (typeof drawer.show === "function") {
          drawer.show();
        } else {
          drawer.setAttribute("open", "true");
        }
      });
    });

    drawer.addEventListener("click", (event) => {
      const target = event.target;

      const link =
        target && typeof target.closest === "function"
          ? target.closest("[data-drawer-close]")
          : null;

      if (!link) return;

      if (typeof drawer.hide === "function") {
        drawer.hide();
      } else {
        drawer.removeAttribute("open");
      }
    });
  }
function initPageTracking() {
    const path = normalizePath(getCurrentPath());

    if (path === "/") {
      track("view_home", { section: "home" });
      trackSectionView("inicio", "view_inicio");
      trackSectionView("lojas", "view_lojas");
      trackSectionView("produtos", "view_produtos");
      trackSectionView("vitrine", "view_vitrine");
      trackSectionView("contato", "view_contato");
      return;
    }

    if (path === "/sobre" || path.endsWith("/sobre.html")) {
      track("view_sobre", { section: "sobre" });
      return;
    }

    if (path === "/promocoes" || path.endsWith("/promocoes.html")) {
      track("view_promocoes", { section: "promocoes" });
    }
  }

  window.CharmeAnalytics = window.CharmeAnalytics || {};
  window.CharmeAnalytics.getSessionId = getSessionId;
  window.CharmeAnalytics.track = track;
  window.CharmeAnalytics.trackSectionView = trackSectionView;

  document.addEventListener("DOMContentLoaded", () => {
initWebVitals();
    initClickTracking();
    initMobileDrawer();
    initPageTracking();
  });
})();

