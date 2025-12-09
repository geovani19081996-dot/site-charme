"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const promoContainer = document.getElementById("promocoes");
  const statusEl = document.getElementById("promo-status");
  const searchInput = document.getElementById("promo-search");
  const categoriaSelect = document.getElementById("promo-categoria");

  let promocoes = [];
  let promocoesFiltradas = [];

  const formatCurrency = (valor) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(Number(valor || 0));

  // Converte "2022-06-02" -> Date (ou null se zoado)
  const parseDate = (str) => {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  // --- 1. Carregar promoções do JSON ---
  async function carregarPromocoes() {
    try {
      statusEl.textContent = "Carregando promoções...";
      statusEl.classList.remove("promo-status--erro");

      // cache-buster para não ficar preso no Cloudflare/cache do navegador
      const resp = await fetch("/data/promocoes_site.json?v=" + Date.now());

      if (!resp.ok) {
        throw new Error("Não foi possível carregar o arquivo de promoções.");
      }

      const data = await resp.json();

      if (!Array.isArray(data) || data.length === 0) {
        exibirMensagemSemPromos();
        return;
      }

      // aqui você pode filtrar promoções expiradas, se quiser
      const hoje = new Date();
      promocoes = data.filter((p) => {
        const dataFim = parseDate(p.data_fim);
        if (!dataFim) return true; // se não tiver data fim, deixa passar
        // mostra somente promoções que ainda não "acabaram" (data_fim >= hoje - 1 dia)
        return dataFim >= new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      });

      if (promocoes.length === 0) {
        exibirMensagemSemPromos();
        return;
      }

      popularCategorias();
      aplicarFiltros();

      statusEl.textContent = "";
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Erro ao carregar promoções. Tente novamente em instantes.";
      statusEl.classList.add("promo-status--erro");
      promoContainer.innerHTML = "";
    }
  }

  function exibirMensagemSemPromos() {
    promoContainer.innerHTML = `
      <div class="promo-empty">
        <h3>😢 Ainda não temos promoções ativas.</h3>
        <p>
          Mas calma, a Charme vive atualizando as ofertas.
          <strong>Volte amanhã</strong> ou acompanhe nosso Instagram
          para pegar as próximas oportunidades. 💕
        </p>
      </div>
    `;
    statusEl.textContent = "";
  }

  // --- 2. Popular o filtro de categorias com base no JSON ---
  function popularCategorias() {
    const categoriasUnicas = new Set();

    promocoes.forEach((p) => {
      if (p.categoria) {
        categoriasUnicas.add(String(p.categoria).trim());
      }
    });

    categoriaSelect.innerHTML = `<option value="">Todas as categorias</option>`;

    Array.from(categoriasUnicas)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        categoriaSelect.appendChild(opt);
      });
  }

  // --- 3. Filtros (busca + categoria) ---
  function aplicarFiltros() {
    const termo = searchInput.value.trim().toLowerCase();
    const categoria = categoriaSelect.value;

    promocoesFiltradas = promocoes.filter((p) => {
      const nome = String(p.nome || "").toLowerCase();
      const promoNome = String(p.promo_nome || "").toLowerCase();
      const subcat = String(p.subcategoria || "").toLowerCase();
      const cat = String(p.categoria || "");

      const matchBusca =
        !termo ||
        nome.includes(termo) ||
        promoNome.includes(termo) ||
        subcat.includes(termo);

      const matchCategoria = !categoria || cat === categoria;

      return matchBusca && matchCategoria;
    });

    renderizarPromocoes();
  }

  // --- 4. Renderizar os cards de promoção ---
  function renderizarPromocoes() {
    if (!promocoesFiltradas.length) {
      promoContainer.innerHTML = `
        <div class="promo-empty">
          <h3>Nenhuma promoção encontrada com esses filtros.</h3>
          <p>Tenta limpar a busca ou trocar a categoria. 😉</p>
        </div>
      `;
      return;
    }

    const hoje = new Date();

    const html = promocoesFiltradas
      .map((p) => {
        const totalEstoque =
          Number(p.estoque_loja1 || 0) + Number(p.estoque_loja2 || 0);

        const dataFim = parseDate(p.data_fim);
        const diasRestantes =
          typeof p.dias_restantes === "number" ? p.dias_restantes : null;

        // --- BADGES / RÓTULOS DE VENDAS ---
        const badges = [];

        const desconto = Number(p.desconto_percentual || 0);
        if (desconto > 0) {
          badges.push(`${desconto.toFixed(0)}% OFF`);
        }

        if (p.duracao_estoque) {
          badges.push("Até acabar o estoque");
        }

        if (diasRestantes === 0) {
          badges.push("Acaba hoje");
        } else if (typeof diasRestantes === "number" && diasRestantes > 0) {
          badges.push(`Termina em ${diasRestantes} dia(s)`);
        } else if (dataFim && dataFim > hoje) {
          const diffMs = dataFim - hoje;
          const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          if (diffDias <= 3) {
            badges.push(`Somente por mais ${diffDias} dia(s)`);
          }
        }

        if (totalEstoque > 0 && totalEstoque <= 3) {
          badges.push("Últimas unidades");
        }

        if (p.somente_a_vista) {
          badges.push("Preço à vista");
        }

        const imgNome = p.imagem || `${p.codigo}.jpg`;
        const imgSrc = `img/produtos/${imgNome}`;

        const whatsMsg = encodeURIComponent(
          `Oi, vi a promoção *${p.promo_nome}* do produto *${p.nome}* no site da Charme e quero saber se ainda tem disponível.`
        );

        const estoqueTexto =
          totalEstoque > 0
            ? `Loja 1: ${Number(p.estoque_loja1 || 0)} | Loja 2: ${Number(
                p.estoque_loja2 || 0
              )}`
            : "Produto em reposição – fala com a gente no Whats 😉";

        const dataFimTexto = dataFim
          ? dataFim.toLocaleDateString("pt-BR")
          : null;

        return `
          <article class="card-produto promo-card">
            <div class="promo-card__top">
              <div class="promo-card__badges">
                ${badges
                  .map(
                    (b) => `<span class="promo-badge">
                      ${b}
                    </span>`
                  )
                  .join("")}
              </div>
              <div class="promo-card__imagem-wrapper">
                <img
                  src="${imgSrc}"
                  alt="${p.nome || ""}"
                  loading="lazy"
                  onerror="this.onerror=null;this.src='img/produtos/placeholder.jpg';"
                />
              </div>
            </div>

            <div class="promo-card__body">
              <div class="promo-card__campanha">${p.promo_nome || ""}</div>
              <h3 class="promo-card__titulo">${p.nome || ""}</h3>
              ${
                p.descricao_resumida
                  ? `<p class="promo-card__descricao">${p.descricao_resumida}</p>`
                  : ""
              }

              <div class="promo-card__precos">
                <div class="promo-card__preco-promo">
                  ${formatCurrency(p.preco_promo)}
                </div>
                <div class="promo-card__preco-normal">
                  <span>de</span>
                  <del>${formatCurrency(p.preco_normal)}</del>
                </div>
              </div>

              ${
                dataFimTexto
                  ? `<div class="promo-card__validade">Válido até <strong>${dataFimTexto}</strong></div>`
                  : ""
              }

              <div class="promo-card__estoque">
                ${estoqueTexto}
              </div>

              <div class="promo-card__cta">
                <a
                  class="btn btn--whats"
                  href="https://wa.me/556535494404?text=${whatsMsg}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Aproveitar pelo WhatsApp
                </a>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    promoContainer.innerHTML = html;
  }

  // --- 5. Listeners dos filtros ---
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      aplicarFiltros();
    });
  }

  if (categoriaSelect) {
    categoriaSelect.addEventListener("change", () => {
      aplicarFiltros();
    });
  }

  // Start!
  carregarPromocoes();
});
