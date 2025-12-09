// js/produtos.js

// telefoneWhatsApp/telefone_whatsapp da loja (formato internacional)
const WHATSAPP_NUMBER = "556535494404"; // 65 3549-4404

// elementos da tela
const grid = document.getElementById("produtos-grid");
const searchInput = document.getElementById("produto-search");
const categoriaSelect = document.getElementById("categoria-filter");

let todosProdutos = [];

// formata preço em BRL
function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

// monta link de WhatsApp
function montarLinkWhats(produto) {
  const texto = `Olá, vi o produto "${produto.nome}" no site da Charme Cosméticos. Código: ${produto.codigo}. Tem disponível?`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(texto)}`;
}

// cria card de produto
function criarCard(produto) {
  const card = document.createElement("div");
  // mantém a classe antiga e já adiciona a nova, pra casar com o CSS
  card.className = "produto-card product-card";

  // se não tiver imagem no JSON, já cai pra placeholder.jpg
  const imageFile =
    produto.imagem && produto.imagem.trim() !== ""
      ? produto.imagem.trim()
      : "placeholder.jpg";

  card.innerHTML = `
    <div class="product-header">
      <img
        src="img/fio-mechas-gold.png"
        alt="Charme Cosméticos"
        class="card-top-image"
      >
    </div>

    <div class="product-image">
      <img
        src="img/produtos/${imageFile}"
        alt="${produto.nome}"
        onerror="this.onerror=null;this.src='img/produtos/placeholder.jpg';"
      >
    </div>

    <div class="product-body">
      <h3 class="product-title">${produto.nome}</h3>

      <p class="produto-categoria product-category">
        ${produto.categoria || ""}
      </p>

      <div class="produto-preco product-price">
        ${formatarPreco(produto.preco)}
      </div>

      <p class="produto-estoque product-stock">
        Loja 1: ${produto.estoque_loja1} | Loja 2: ${produto.estoque_loja2}
      </p>

      <a
        href="${montarLinkWhats(produto)}"
        target="_blank"
        class="produto-botao whatsapp-button"
      >
        Comprar via WhatsApp
      </a>
    </div>
  `;

  return card;
}

// renderiza lista de produtos no grid
function renderizarProdutos(lista) {
  grid.innerHTML = "";

  if (!lista.length) {
    const vazio = document.createElement("p");
    vazio.textContent = "Nenhum produto encontrado com esse filtro.";
    grid.appendChild(vazio);
    return;
  }

  lista.forEach((produto) => {
    if (produto.ativo !== false) {
      const card = criarCard(produto);
      grid.appendChild(card);
    }
  });
}

// aplica filtros de busca + categoria
function aplicarFiltros() {
  const termo = (searchInput.value || "").toLowerCase();
  const categoria = categoriaSelect.value;

  const filtrados = todosProdutos.filter((produto) => {
    const nomeOk = produto.nome.toLowerCase().includes(termo);
    const categoriaOk =
      categoria === "" ||
      (produto.categoria || "").toLowerCase() === categoria.toLowerCase();

    return nomeOk && categoriaOk;
  });

  renderizarProdutos(filtrados);
}

// carrega JSON de produtos
async function carregarProdutos() {
  try {
    const resposta = await fetch("data/produtos.json");
    if (!resposta.ok) {
      throw new Error("Erro ao carregar produtos.json");
    }
    const dados = await resposta.json();
    todosProdutos = dados || [];

    // preencher opções de categoria automaticamente
    const categoriasUnicas = [
      ...new Set(todosProdutos.map((p) => p.categoria).filter(Boolean))
    ];
    categoriasUnicas.sort();
    categoriasUnicas.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      categoriaSelect.appendChild(opt);
    });

    renderizarProdutos(todosProdutos);
  } catch (erro) {
    console.error(erro);
    grid.innerHTML =
      "<p>Erro ao carregar os produtos. Tente novamente mais tarde.</p>";
  }
}

// listeners
if (searchInput && categoriaSelect && grid) {
  searchInput.addEventListener("input", aplicarFiltros);
  categoriaSelect.addEventListener("change", aplicarFiltros);

  // inicia carregamento
  carregarProdutos();
}
