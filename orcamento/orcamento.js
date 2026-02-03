/* Charme Cosméticos — Orçamento (cliente-first)
   - Busca + filtros + escanear (quando suportado)
   - Carrinho persistido (localStorage/armazenamento local)
   - Link compartilhável do carrinho
   - Carrinho como "drawer" no mobile
*/

const PRODUCTS_URL = "../data/produtos.json";
const PROMOS_URL   = "../data/promocoes_site.json";
const WHATSAPP_NUMBER = "556535494404"; // DDI + DDD + número (configure aqui)
const ANALYTICS_KEY = "charme_session_id";
const TELEMETRY_ENDPOINT =
  typeof window !== "undefined" ? window.CHARME_TELEMETRY_ENDPOINT : null;

const STORAGE_KEY = "charme_orcamento_state_v2";
const URL_PARAM_CART = "c"; // ?c=...

// ===== Estado =====
let produtos = [];
let promos = [];
let promoByCodigo = new Map(); // codigo -> promo
let phoneMask = null;
let state = {
  loja: 1,
  onlyPromos: false,
  onlyStock: true,
  search: "",
  cart: {},              // codigo -> {qtd:number, obs:string}
  clienteNome: "",
  clienteFone: "",
  clienteObs: "",
};

// ===== Analytics (sem PII) =====
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

function buildEvent(eventName, payload) {
  const evt = {
    event_name: eventName,
    timestamp: new Date().toISOString(),
    page: window.location && window.location.pathname ? window.location.pathname : "/",
    session_id: getSessionId(),
  };

  if (payload && payload.section) evt.section = payload.section;
  if (payload && payload.product_id != null)
    evt.product_id = String(payload.product_id);
  if (payload && Number.isFinite(payload.value)) evt.value = Number(payload.value);
  return evt;
}

function trackEvent(eventName, payload) {
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
      if (typeof evt.value === "number") gtagPayload.metric_value = evt.value;
    }

    window.gtag("event", eventName, gtagPayload);
  } else if (window.console && console.debug) {
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

function initWebVitals() {
  if (!window.webVitals) return;
  const send = (metric) => {
    if (!metric || !metric.name) return;
    trackEvent("web_vitals", {
      section: metric.name,
      value: Math.round(metric.value * 100) / 100,
    });
  };
  window.webVitals.onLCP(send);
  window.webVitals.onCLS(send);
  window.webVitals.onINP(send);
}

// ===== Util =====
function brl(v){
  try{
    return (Number(v) || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  } catch {
    return "R$ " + (Number(v)||0).toFixed(2);
  }
}
function int(v){ return parseInt(v,10) || 0; }

function safeJsonParse(s){
  try{ return JSON.parse(s); } catch { return null; }
}

function persistState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    const j = raw ? safeJsonParse(raw) : null;
    if(j && typeof j === "object"){
      state = {
        ...state,
        ...j,
        cart: (j.cart && typeof j.cart === "object") ? j.cart : {},
      };
    }
  } catch {}
}

function phoneDigits(s){
  return (s||"").replace(/\D+/g,"");
}

function fmtPhoneDigits(s){
  return phoneDigits(s).slice(0,11);
}

function cartCount(){
  return Object.values(state.cart).reduce((acc,it)=>acc + int(it.qtd),0);
}

function cartTotal(){
  let total = 0;
  for(const [codigo, it] of Object.entries(state.cart)){
    const p = produtos.find(x => x.codigo === int(codigo));
    if(!p) continue;
    total += (Number(getPreco(p)) * int(it.qtd));
  }
  return total;
}

function getPreco(p){
  return state.loja === 2 ? (p.preco_loja2 ?? p.preco_loja1 ?? 0) : (p.preco_loja1 ?? p.preco_loja2 ?? 0);
}

function getEstoque(p){
  return state.loja === 2 ? (p.estoque_loja2 ?? 0) : (p.estoque_loja1 ?? 0);
}

function isPromo(p){
  return promoByCodigo.has(p.codigo);
}

// ===== Share link =====
function encodeStateToUrl(){
  const payload = {
    loja: state.loja,
    cart: state.cart,
    clienteNome: state.clienteNome,
    clienteFone: state.clienteFone,
    clienteObs: state.clienteObs,
  };
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const url = new URL(window.location.href);
  url.searchParams.set(URL_PARAM_CART, b64);
  return url.toString();
}

function decodeStateFromUrl(){
  const url = new URL(window.location.href);
  const b64 = url.searchParams.get(URL_PARAM_CART);
  if(!b64) return null;
  try{
    const norm = b64.replace(/-/g,"+").replace(/_/g,"/");
    const pad = norm + "===".slice((norm.length + 3) % 4);
    const json = decodeURIComponent(escape(atob(pad)));
    const payload = safeJsonParse(json);
    if(payload && typeof payload === "object"){
      return payload;
    }
  } catch {}
  return null;
}

function clearUrlCart(){
  const url = new URL(window.location.href);
  url.searchParams.delete(URL_PARAM_CART);
  window.history.replaceState({}, "", url.toString());
}

// ===== UI helpers =====
function $(id){ return document.getElementById(id); }

function setStatus(msg, kind){
  const el = $("status");
  if(!el) return;
  el.textContent = msg || "";
  el.dataset.kind = kind || "";
}

function setCartDrawerOpen(open){
  document.documentElement.classList.toggle("cart-open", !!open);
  const overlay = $("cartOverlay");
  if(overlay) overlay.style.display = open ? "block" : "none";
}

// ===== Render =====
function renderProducts(){
  const list = $("prodList");
  if(!list) return;

  let items = produtos.slice();

  const q = (state.search || "").trim().toLowerCase();
  if(q){
    items = items.filter(p =>
      String(p.codigo).includes(q) ||
      (p.nome||"").toLowerCase().includes(q) ||
      (p.marca||"").toLowerCase().includes(q) ||
      (p.categoria||"").toLowerCase().includes(q) ||
      (p.subcategoria||"").toLowerCase().includes(q)
    );
  }

  if(state.onlyPromos){
    items = items.filter(p => isPromo(p));
  }

  if(state.onlyStock){
    items = items.filter(p => getEstoque(p) > 0);
  }

  items.sort((a,b)=>{
    const ap = isPromo(a) ? 1 : 0;
    const bp = isPromo(b) ? 1 : 0;
    if(ap !== bp) return bp - ap;
    const ae = getEstoque(a);
    const be = getEstoque(b);
    if((ae===0) !== (be===0)) return ae===0 ? 1 : -1;
    return String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR");
  });

  const frag = document.createDocumentFragment();

  for(const p of items){
    const card = document.createElement("div");
    card.className = "p-card";

    const imgWrap = document.createElement("div");
    imgWrap.className = "p-img";

    const img = document.createElement("img");
    img.src = `../img/produtos/${p.imagem || (p.codigo + ".jpg")}`;
    img.alt = p.nome || `Produto ${p.codigo}`;
    img.loading = "lazy";
    img.onerror = () => { img.src = "../img/sem-foto.png"; };

    imgWrap.appendChild(img);

    const info = document.createElement("div");
    info.className = "p-info";

    const title = document.createElement("div");
    title.className = "p-title";
    title.innerHTML = `<span class="p-cod">COD ${p.codigo}</span><span class="p-name">${escapeHtml(p.nome||"")}</span>`;

    const meta = document.createElement("div");
    meta.className = "p-meta";
    meta.textContent = [p.categoria, p.subcategoria, p.marca].filter(Boolean).join(" • ");

    const price = document.createElement("div");
    price.className = "p-price";
    price.innerHTML = `<span>${brl(getPreco(p))}</span>`;

    const stock = document.createElement("div");
    stock.className = "p-stock";
    const est = getEstoque(p);
    stock.innerHTML = `Estoque: <b>${est}</b>`;

    const actions = document.createElement("div");
    actions.className = "p-actions";

    const btn1 = document.createElement("button");
    btn1.className = "btn btn-add";
    btn1.textContent = "+1";
    btn1.onclick = () => addToCart(p.codigo, 1);

    const btn5 = document.createElement("button");
    btn5.className = "btn btn-add";
    btn5.textContent = "+5";
    btn5.onclick = () => addToCart(p.codigo, 5);

    const btn10 = document.createElement("button");
    btn10.className = "btn btn-add";
    btn10.textContent = "+10";
    btn10.onclick = () => addToCart(p.codigo, 10);

    const btnAdd = document.createElement("button");
    btnAdd.className = "btn btn-primary";
    btnAdd.textContent = "Adicionar";
    btnAdd.onclick = () => addToCart(p.codigo, 1);

    actions.append(btn1, btn5, btn10, btnAdd);

    const promoTag = document.createElement("div");
    promoTag.className = "p-tag";
    promoTag.textContent = isPromo(p) ? "Promoção" : (p.preco_baixou ? "Preço baixou" : "");

    info.append(title, meta, price, stock, actions);
    card.append(imgWrap, info);

    if(promoTag.textContent){
      card.appendChild(promoTag);
    }

    frag.appendChild(card);
  }

  list.innerHTML = "";
  list.appendChild(frag);

  setStatus(`Produtos: ${items.length} | Promos: ${promos.length}`, "ok");
}

function renderCart(){
  const list = $("cartList");
  const totalEl = $("total");
  const metaEl = $("cartMeta");
  const fab = $("cartFab");

  if(totalEl) totalEl.textContent = brl(cartTotal());

  if(metaEl){
    metaEl.textContent = `Itens: ${cartCount()} • Loja ${state.loja}`;
  }

  if(fab){
    fab.textContent = `Carrinho • ${cartCount()} item(ns) • ${brl(cartTotal())}`;
    fab.style.display = (window.matchMedia("(max-width: 980px)").matches && cartCount() > 0) ? "flex" : "none";
  }

  if(!list) return;

  const entries = Object.entries(state.cart)
    .map(([k,v]) => ({codigo:int(k), ...v}))
    .filter(it => it.qtd > 0);

  entries.sort((a,b)=>{
    const pa = produtos.find(x=>x.codigo===a.codigo);
    const pb = produtos.find(x=>x.codigo===b.codigo);
    return String(pa?.nome||"").localeCompare(String(pb?.nome||""),"pt-BR");
  });

  const frag = document.createDocumentFragment();

  for(const it of entries){
    const p = produtos.find(x => x.codigo === it.codigo);
    if(!p) continue;

    const row = document.createElement("div");
    row.className = "c-row";

    const left = document.createElement("div");
    left.className = "c-left";
    left.innerHTML = `
      <div class="c-name"><b>COD ${p.codigo}</b> ${escapeHtml(p.nome||"")}</div>
      <div class="c-sub">${brl(getPreco(p))} • Estoque: ${getEstoque(p)}</div>
    `;

    const right = document.createElement("div");
    right.className = "c-right";

    const minus = document.createElement("button");
    minus.className = "btn btn-mini";
    minus.textContent = "−";
    minus.onclick = () => addToCart(p.codigo, -1);

    const qty = document.createElement("div");
    qty.className = "c-qty";
    qty.textContent = String(it.qtd);

    const plus = document.createElement("button");
    plus.className = "btn btn-mini";
    plus.textContent = "+";
    plus.onclick = () => addToCart(p.codigo, 1);

    const rm = document.createElement("button");
    rm.className = "btn btn-mini btn-danger";
    rm.textContent = "x";
    rm.onclick = () => removeFromCart(p.codigo);

    right.append(minus, qty, plus, rm);

    const note = document.createElement("input");
    note.className = "c-note";
    note.type = "text";
    note.placeholder = "Obs do item (cor/tamanho)";
    note.value = it.obs || "";
    note.oninput = () => {
      state.cart[p.codigo].obs = note.value.slice(0,80);
      persistState();
    };

    row.append(left, right, note);
    frag.appendChild(row);
  }

  list.innerHTML = "";
  if(entries.length === 0){
    const empty = document.createElement("div");
    empty.className = "c-empty";
    empty.textContent = "Carrinho vazio. Use a busca e toque em “Adicionar”.";
    list.appendChild(empty);
  } else {
    list.appendChild(frag);
  }
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ===== Ações =====
function addToCart(codigo, delta){
  codigo = int(codigo);
  if(!state.cart[codigo]) state.cart[codigo] = {qtd:0, obs:""};
  const p = produtos.find(x => x.codigo === codigo);
  const est = p ? getEstoque(p) : 999999;

  let qtd = int(state.cart[codigo].qtd) + int(delta);
  if(qtd < 0) qtd = 0;

  if(state.onlyStock && p && qtd > est) qtd = est;

  state.cart[codigo].qtd = qtd;

  if (p && delta > 0) {
    trackEvent("add_to_cart", {
      section: "orcamento",
      product_id: codigo,
      value: Number(getPreco(p)),
    });
  }
  if (p && delta < 0) {
    trackEvent("remove_from_cart", {
      section: "orcamento",
      product_id: codigo,
      value: Number(getPreco(p)),
    });
  }

  persistState();
  renderCart();

  if(window.matchMedia("(max-width: 980px)").matches && delta > 0){
    setCartDrawerOpen(true);
  }
}

function removeFromCart(codigo){
  codigo = int(codigo);
  const p = produtos.find(x => x.codigo === codigo);
  delete state.cart[codigo];
  if (p) {
    trackEvent("remove_from_cart", {
      section: "orcamento",
      product_id: codigo,
      value: Number(getPreco(p)),
    });
  }
  persistState();
  renderCart();
}

function clearCart(){
  state.cart = {};
  persistState();
  renderCart();
}

// ===== WhatsApp =====
function buildWhatsText(){
  const lines = [];
  lines.push("Olá! Quero um orçamento:");
  lines.push(`Loja: ${state.loja}`);
  if(state.clienteNome) lines.push(`Cliente: ${state.clienteNome}`);
  if(state.clienteFone) lines.push(`Telefone: ${state.clienteFone}`);
  lines.push("");

  const entries = Object.entries(state.cart)
    .map(([k,v]) => ({codigo:int(k), ...v}))
    .filter(it => it.qtd > 0);

  for(const it of entries){
    const p = produtos.find(x => x.codigo === it.codigo);
    if(!p) continue;
    const unit = Number(getPreco(p));
    const subtotal = unit * int(it.qtd);
    const obs = (it.obs || "").trim();
    lines.push(`• COD ${p.codigo} — ${p.nome}`);
    lines.push(`  Qtd: ${it.qtd} | Unit: ${brl(unit)} | Sub: ${brl(subtotal)}`);
    if(obs) lines.push(`  Obs: ${obs}`);
  }

  lines.push("");
  if(state.clienteObs) lines.push(`Obs geral: ${state.clienteObs}`);
  lines.push(`Total: ${brl(cartTotal())}`);

  return lines.join("\n");
}

function openWhats(){
  if(cartCount() === 0){
    alert("Seu carrinho está vazio.");
    return;
  }
  const msg = buildWhatsText();
  const phone = phoneDigits(WHATSAPP_NUMBER);
  if(!phone){
    alert("Número do vendedor não configurado.");
    return;
  }
  trackEvent("click_whatsapp", { section: "orcamento" });
  trackEvent("generate_lead", { section: "orcamento", value: cartTotal() });
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank", "noopener");
}

// ===== Scanner (câmera) =====
async function scanFromImageFile(file){
  if(!file) return null;
  if(!("BarcodeDetector" in window)) return null;

  try{
    const bitmap = await createImageBitmap(file);
    const detector = new BarcodeDetector({
      formats: ["ean_13","ean_8","code_128","code_39","upc_a","upc_e","qr_code"]
    });
    const codes = await detector.detect(bitmap);
    if(codes && codes.length){
      return codes[0].rawValue || "";
    }
  } catch {}

  try{
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    await new Promise((res,rej)=>{
      img.onload = () => res();
      img.onerror = () => rej(new Error("img load fail"));
    });
    const detector = new BarcodeDetector({
      formats: ["ean_13","ean_8","code_128","code_39","upc_a","upc_e","qr_code"]
    });
    const codes = await detector.detect(img);
    URL.revokeObjectURL(img.src);
    if(codes && codes.length){
      return codes[0].rawValue || "";
    }
  } catch {}

  return null;
}

function hookScanner(){
  const btn = $("btnScan");
  const input = $("scanInput");
  if(!btn || !input) return;

  btn.addEventListener("click", () => {
    if(!("BarcodeDetector" in window)){
      alert("Seu navegador não suporta leitura de código ainda. Use a busca pelo COD.");
      return;
    }
    input.click();
  });

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.value = "";
    const raw = await scanFromImageFile(file);

    if(!raw){
      alert("Não consegui ler o código. Tente aproximar e manter foco.");
      return;
    }

    const n = int(raw);
    if(n > 0 && produtos.some(p => p.codigo === n)){
      addToCart(n, 1);
      setStatus(`Código lido: ${n} (adicionado +1)`, "ok");
      return;
    }

    const s = $("searchInput");
    if(s){
      s.value = raw;
      state.search = raw;
      persistState();
      renderProducts();
    }
    setStatus(`Código lido: ${raw}`, "info");
  });
}

// ===== Load =====
async function fetchJson(url){
  const r = await fetch(url, {cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return await r.json();
}

async function boot(){
  initWebVitals();
  loadState();

  const payload = decodeStateFromUrl();
  if(payload){
    state.loja = int(payload.loja) || state.loja;
    state.cart = (payload.cart && typeof payload.cart === "object") ? payload.cart : {};
    state.clienteNome = payload.clienteNome || "";
    state.clienteFone = payload.clienteFone || "";
    state.clienteObs = payload.clienteObs || "";
    persistState();
    clearUrlCart();
  }

  const storeSelect = $("storeSelect");
  const searchInput = $("searchInput");
  const onlyPromos = $("onlyPromos");
  const onlyStock = $("onlyStock");

  if(storeSelect){
    storeSelect.value = String(state.loja);
    storeSelect.addEventListener("change", () => {
      state.loja = int(storeSelect.value) || 1;
      persistState();
      renderProducts();
      renderCart();
    });
  }

  if(searchInput){
    searchInput.value = state.search || "";
    searchInput.addEventListener("input", () => {
      state.search = searchInput.value || "";
      persistState();
      renderProducts();
    });
  }

  if(onlyPromos){
    onlyPromos.checked = !!state.onlyPromos;
    onlyPromos.addEventListener("change", () => {
      state.onlyPromos = !!onlyPromos.checked;
      persistState();
      renderProducts();
    });
  }

  if(onlyStock){
    onlyStock.checked = !!state.onlyStock;
    onlyStock.addEventListener("change", () => {
      state.onlyStock = !!onlyStock.checked;
      persistState();
      renderProducts();
      renderCart();
    });
  }

  const fab = $("cartFab");
  const close = $("cartClose");
  const overlay = $("cartOverlay");
  if(fab) fab.addEventListener("click", () => setCartDrawerOpen(true));
  if(close) close.addEventListener("click", () => setCartDrawerOpen(false));
  if(overlay) overlay.addEventListener("click", () => setCartDrawerOpen(false));

  const clienteNome = $("clienteNome");
  const clienteFone = $("clienteFone");
  const clienteObs  = $("clienteObs");
  const clienteForm = $("clienteForm");

  if(clienteNome){
    clienteNome.value = state.clienteNome || "";
    clienteNome.addEventListener("input", () => {
      state.clienteNome = clienteNome.value.slice(0,60);
      persistState();
    });
  }
  if(clienteFone){
    clienteFone.value = state.clienteFone || "";
    if(window.IMask){
      phoneMask = window.IMask(clienteFone, { mask: "(00) 00000-0000" });
      if(state.clienteFone) phoneMask.value = state.clienteFone;
      phoneMask.on("accept", () => {
        state.clienteFone = phoneMask.value;
        persistState();
      });
    } else {
      clienteFone.addEventListener("input", () => {
        state.clienteFone = fmtPhoneDigits(clienteFone.value);
        clienteFone.value = state.clienteFone;
        persistState();
      });
    }
  }
  if(clienteObs){
    clienteObs.value = state.clienteObs || "";
    clienteObs.addEventListener("input", () => {
      state.clienteObs = clienteObs.value.slice(0,200);
      persistState();
    });
  }

  const btnWhats = $("btnWhats");
  const btnCopyText = $("btnCopyText");
  const btnCopyLink = $("btnCopyLink");
  const btnClear = $("btnClear");

  if(clienteForm){
    const digitsFromField = () => {
      if(phoneMask) return phoneDigits(phoneMask.value);
      return phoneDigits(clienteFone ? clienteFone.value : "");
    };

    if(window.JustValidate){
      const validator = new window.JustValidate(clienteForm, {
        errorFieldCssClass: "is-invalid",
        errorLabelStyle: { color: "#b42318" },
        focusInvalidField: true,
      });

      validator
        .addField("#clienteNome", [
          { rule: "required", errorMessage: "Informe o nome." },
          { rule: "minLength", value: 2, errorMessage: "Nome muito curto." },
        ])
        .addField("#clienteFone", [
          {
            validator: () => digitsFromField().length >= 10,
            errorMessage: "Telefone inválido.",
          },
        ])
        .onSuccess((event) => {
          event.preventDefault();
          trackEvent("begin_checkout", {
            section: "orcamento",
            value: cartTotal(),
          });
          openWhats();
        });
    } else {
      clienteForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const nome = (clienteNome ? clienteNome.value : "").trim();
        const digits = digitsFromField();
        if(nome.length < 2){
          alert("Informe o nome.");
          return;
        }
        if(digits.length < 10){
          alert("Informe um telefone válido.");
          return;
        }
        trackEvent("begin_checkout", {
          section: "orcamento",
          value: cartTotal(),
        });
        openWhats();
      });
    }
  } else if(btnWhats) {
    btnWhats.addEventListener("click", openWhats);
  }

  if(btnCopyText){
    btnCopyText.addEventListener("click", async () => {
      const txt = buildWhatsText();
      try{
        await navigator.clipboard.writeText(txt);
        alert("Texto copiado.");
      } catch {
        alert("Não consegui copiar automaticamente. Selecione e copie manualmente.");
      }
    });
  }

  if(btnCopyLink){
    btnCopyLink.addEventListener("click", async () => {
      const url = encodeStateToUrl();
      try{
        await navigator.clipboard.writeText(url);
        alert("Link copiado.");
      } catch {
        prompt("Copie o link:", url);
      }
    });
  }

  if(btnClear) btnClear.addEventListener("click", clearCart);

  try{
    setStatus("Carregando produtos...", "info");
    [produtos, promos] = await Promise.all([
      fetchJson(PRODUCTS_URL),
      fetchJson(PROMOS_URL),
    ]);

    promoByCodigo = new Map();
    for(const pr of promos){
      if(pr && pr.codigo != null) promoByCodigo.set(int(pr.codigo), pr);
    }

    renderProducts();
    renderCart();
    hookScanner();
  } catch (e){
    console.error(e);
    setStatus("Erro carregando produtos. Veja o console.", "err");
    alert("Erro carregando orçamento. Veja o console.");
  }
}

document.addEventListener("DOMContentLoaded", boot);
