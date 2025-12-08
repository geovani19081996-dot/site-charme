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
  card.className = "produto-card";

  const img = document.createElement("img");
  img.src = produto.imagem || "img/logo-charme-icon.png";
  img.alt = produto.nome;

  const nome = document.createElement("h3");
  nome.textContent = produto.nome;

  const categoria = document.createElement("p");
  categoria.className = "produto-categoria";
  categoria.textContent = produto.categoria;

  const preco = document.createElement("p");
  preco.className = "produto-preco";
  preco.textContent = formatarPreco(produto.preco);

  const estoque = document.createElement("p");
  estoque.className = "produto-estoque";
  estoque.textContent = `Loja 1: ${produto.estoque_loja1} | Loja 2: ${produto.estoque_loja2}`;

  const botao = document.createElement("a");
  botao.href = montarLinkWhats(produto);
  botao.target = "_blank";
  botao.className = "produto-botao";
  botao.textContent = "Comprar via WhatsApp";

  card.appendChild(img);
  card.appendChild(nome);
  card.appendChild(categoria);
  card.appendChild(preco);
  card.appendChild(estoque);
  card.appendChild(botao);

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
      categoria === "" || produto.categoria.toLowerCase() === categoria.toLowerCase();

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
    grid.innerHTML = "<p>Erro ao carregar os produtos. Tente novamente mais tarde.</p>";
  }
}

// listeners
if (searchInput && categoriaSelect && grid) {
  searchInput.addEventListener("input", aplicarFiltros);
  categoriaSelect.addEventListener("change", aplicarFiltros);

  // inicia carregamento
  carregarProdutos();
}
