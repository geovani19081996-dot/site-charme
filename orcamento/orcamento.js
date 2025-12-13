// Config
const WHATSAPP_NUMBER = "556535494404"; // WhatsApp da Charme
const PRODUCTS_URL = "../data/private/produtos.json";
const PROMOS_URL   = "../data/promocoes_site.json";
const PLACEHOLDER  = "../img/placeholder-promo.svg";

// State
let produtos = [];
let promoMap = new Map(); // codigo -> { precoPromo, empresas: {1:{},2:{}} }
let cart = new Map();     // codigo -> { qty, refProduto }

function moneyBR(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStore() {
  return document.getElementById("storeSelect").value; // "1" or "2"
}

function getStock(p, store) {
  return store === "1" ? (p.estoque_loja1 || 0) : (p.estoque_loja2 || 0);
}

function getBasePrice(p, store) {
  // Se tiver preco_lojaX usa; senÃ£o usa preco
  if (store === "1" && p.preco_loja1 != null) return p.preco_loja1;
  if (store === "2" && p.preco_loja2 != null) return p.preco_loja2;
  return p.preco || 0;
}

function getFinalPrice(p, store) {
  // Promo sobrescreve preÃ§o se existir pro cÃ³digo
  const pr = promoMap.get(p.codigo);
  if (!pr) return getBasePrice(p, store);
  return pr.precoPromo;
}

function hasPromo(codigo) {
  return promoMap.has(codigo);
}

function imgSrc(p) {
  return `../img/produtos/${p.imagem || (p.codigo + ".jpg")}`;
}

async function loadJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Falha ao carregar ${url} (${r.status})`);
  return await r.json();
}

async function boot() {
  const metaTag = document.getElementById("metaTag");
  metaTag.textContent = "Carregando produtosâ€¦";

  // Produtos (privado)
  produtos = await loadJson(PRODUCTS_URL);

  // PromoÃ§Ãµes (pÃºblico) â€“ sÃ³ pra preÃ§o promo
  try {
    const promos = await loadJson(PROMOS_URL);
    // promocoes_site.json tem itens repetidos por empresa
    // vamos mapear menor precoPromo por codigo (por seguranÃ§a)
    for (const it of promos) {
      const codigo = Number(it.codigo_produto || it.pro_codigo || it.codigo || it.PRO_CODIGO || it[9]);
      const precoPromo = Number(it.preco_promo ?? it.prom_valor ?? it.PROM_VALOR ?? it.valor_promo ?? 0);
      if (!codigo || !precoPromo) continue;

      const old = promoMap.get(codigo);
      if (!old || precoPromo < old.precoPromo) {
        promoMap.set(codigo, { precoPromo });
      }
    }
  } catch (e) {
    // Promo Ã© opcional; orÃ§amento continua
    console.warn("PromoÃ§Ãµes nÃ£o carregadas:", e);
  }

  metaTag.textContent = `Produtos: ${produtos.length} | Promos: ${promoMap.size}`;
  bindUI();
  applyLinkIfAny();
  render();
}

function bindUI() {
  document.getElementById("storeSelect").addEventListener("change", render);
  document.getElementById("search").addEventListener("input", render);
  document.getElementById("onlyPromos").addEventListener("change", render);
  document.getElementById("onlyStock").addEventListener("change", render);

  document.getElementById("btnClear").addEventListener("click", () => {
    cart.clear();
    renderCart();
  });

  document.getElementById("btnWhats").addEventListener("click", () => {
    const txt = buildQuoteText();
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(txt)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  });

  document.getElementById("btnCopy").addEventListener("click", async () => {
    const txt = buildQuoteText();
    await navigator.clipboard.writeText(txt);
    alert("Copiado ?");
  });

  document.getElementById("btnLink").addEventListener("click", async () => {
    const link = buildShareLink();
    await navigator.clipboard.writeText(link);
    alert("Link copiado ?");
  });
}

function render() {
  const store = getStore();
  const q = document.getElementById("search").value.trim().toLowerCase();
  const onlyPromos = document.getElementById("onlyPromos").checked;
  const onlyStock  = document.getElementById("onlyStock").checked;

  const grid = document.getElementById("productGrid");
  grid.innerHTML = "";

  const list = produtos.filter(p => {
    if (onlyPromos && !hasPromo(p.codigo)) return false;
    if (onlyStock && getStock(p, store) <= 0) return false;

    if (!q) return true;
    const s = `${p.codigo} ${p.nome}`.toLowerCase();
    return s.includes(q);
  });

  for (const p of list) {
    const stock = getStock(p, store);
    const price = getFinalPrice(p, store);

    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div class="pitem">
        <img class="pimg" src="${imgSrc(p)}" onerror="this.src='${PLACEHOLDER}'" />
        <div style="flex:1">
          <div style="font-weight:700">${p.nome}</div>
          <div class="muted">CÃ³digo: ${p.codigo} â€¢ Unidade: ${p.unidade || "UN"}</div>
          <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div>
              <div style="font-weight:800">${moneyBR(price)}</div>
              ${hasPromo(p.codigo) ? `<div class="muted">PromoÃ§Ã£o ativa</div>` : `<div class="muted">PreÃ§o normal</div>`}
            </div>
            <div style="text-align:right">
              <div class="muted">Estoque</div>
              <div style="font-weight:700">${stock}</div>
            </div>
          </div>

          <div class="actions" style="margin-top:10px">
            <button class="btn2 primary" data-add="${p.codigo}">Add/Adicionar</button>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(el);

    el.querySelector(`[data-add="${p.codigo}"]`).addEventListener("click", () => addToCart(p));
  }

  renderCart();
}

function addToCart(p) {
  const store = getStore();
  const stock = getStock(p, store);
  const cur = cart.get(p.codigo);

  const nextQty = (cur ? cur.qty : 0) + 1;
  if (nextQty > stock) {
    alert("Sem estoque suficiente nessa loja ??");
    return;
  }

  cart.set(p.codigo, { qty: nextQty, ref: p });
  renderCart();
}

function setQty(codigo, qty) {
  const store = getStore();
  const it = cart.get(codigo);
  if (!it) return;

  const stock = getStock(it.ref, store);
  const q = Math.max(0, Math.min(stock, qty));

  if (q === 0) cart.delete(codigo);
  else it.qty = q;

  renderCart();
}

function renderCart() {
  const store = getStore();
  const list = document.getElementById("cartList");
  const meta = document.getElementById("cartMeta");
  list.innerHTML = "";

  let total = 0;
  let items = 0;

  for (const [codigo, it] of cart.entries()) {
    const p = it.ref;
    const price = getFinalPrice(p, store);
    const line = price * it.qty;
    total += line;
    items += it.qty;

    const row = document.createElement("div");
    row.className = "card";
    row.style.marginBottom = "10px";
    row.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        <img class="pimg" src="${imgSrc(p)}" onerror="this.src='${PLACEHOLDER}'" />
        <div style="flex:1">
          <div style="font-weight:700">${p.nome}</div>
          <div class="muted">#${p.codigo} â€¢ ${moneyBR(price)} â€¢ estoque: ${getStock(p, store)}</div>

          <div class="qty" style="margin-top:8px">
            <button data-m="${codigo}">-</button>
            <input data-i="${codigo}" value="${it.qty}" />
            <button data-p="${codigo}">+</button>
          </div>
        </div>
        <div style="text-align:right;min-width:92px">
          <div class="muted">Subtotal</div>
          <div style="font-weight:800">${moneyBR(line)}</div>
        </div>
      </div>
    `;
    list.appendChild(row);

    row.querySelector(`[data-m="${codigo}"]`).addEventListener("click", () => setQty(codigo, it.qty - 1));
    row.querySelector(`[data-p="${codigo}"]`).addEventListener("click", () => setQty(codigo, it.qty + 1));
    row.querySelector(`[data-i="${codigo}"]`).addEventListener("change", (e) => {
      const v = Number(e.target.value || 0);
      setQty(codigo, v);
    });
  }

  meta.textContent = `Loja ${store} â€¢ Itens: ${items}`;
  document.getElementById("total").textContent = moneyBR(total);
}

function buildQuoteText() {
  const store = getStore();
  const nome = (document.getElementById("clienteNome").value || "").trim();
  const fone = (document.getElementById("clienteFone").value || "").trim();
  const obs  = (document.getElementById("obs").value || "").trim();

  const now = new Date();
  const stamp = now.toLocaleString("pt-BR");

  let total = 0;
  let lines = [];
  for (const [codigo, it] of cart.entries()) {
    const p = it.ref;
    const price = getFinalPrice(p, store);
    const sub = price * it.qty;
    total += sub;
    lines.push(`- ${it.qty}x [${p.codigo}] ${p.nome} = ${moneyBR(sub)} (${moneyBR(price)})`);
  }

  const header = [
    `*OrÃ§amento Charme*`,
    `Loja: ${store}`,
    nome ? `Cliente: ${nome}` : null,
    fone ? `Telefone: ${fone}` : null,
    `Criado em: ${stamp}`,
    `------------------------`,
  ].filter(Boolean).join("\n");

  const body = lines.length ? lines.join("\n") : "(carrinho vazio)";
  const footer = [
    `------------------------`,
    `Total: *${moneyBR(total)}*`,
    obs ? `Obs: ${obs}` : null,
  ].filter(Boolean).join("\n");

  return `${header}\n${body}\n${footer}`;
}

function buildShareLink() {
  // Encode carrinho no link (pra vendedora mandar pro cliente se quiser)
  const store = getStore();
  const items = Array.from(cart.entries()).map(([codigo, it]) => ({ c: codigo, q: it.qty }));
  const payload = { s: store, i: items };

  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = new URL(window.location.href);
  url.searchParams.set("q", b64);
  return url.toString();
}

function applyLinkIfAny() {
  const url = new URL(window.location.href);
  const q = url.searchParams.get("q");
  if (!q) return;

  try {
    const json = decodeURIComponent(escape(atob(q)));
    const payload = JSON.parse(json);
    if (payload.s) document.getElementById("storeSelect").value = String(payload.s);

    cart.clear();
    for (const it of (payload.i || [])) {
      const p = produtos.find(x => x.codigo === Number(it.c));
      if (p) cart.set(p.codigo, { qty: Number(it.q || 1), ref: p });
    }
  } catch (e) {
    console.warn("Link invÃ¡lido:", e);
  }
}

boot().catch(err => {
  console.error(err);
  alert("Erro carregando orÃ§amento. Veja o console.");
});
