const $ = (s) => document.querySelector(s),
  E = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  money = (n) =>
    Number(n || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
let user = null,
  state = {
    leads: [],
    projects: [],
    proposals: [],
    sales: [],
    tasks: [],
    activities: [],
  },
  integrations = {},
  results = [],
  pageToken = "",
  selectedTemplate = "Essencial";
const navs = [
  ["PRINCIPAL"],
  ["overview", "Visão geral", "grid"],
  ["radar", "Radar de negócios", "radar"],
  ["analysis", "Análise de empresas", "chart"],
  ["CRM & CRIAÇÃO"],
  ["generator", "Gerador de sites", "spark", "NOVO"],
  ["projects", "Sites e projetos", "window"],
  ["templates", "Templates", "grid"],
  ["proposals", "Propostas", "file"],
  ["whatsapp", "WhatsApp", "chat"],
  ["crm", "CRM", "columns"],
  ["clients", "Clientes", "users"],
  ["contracts", "Contratos", "file"],
  ["GESTÃO"],
  ["sales", "Vendas", "bag"],
  ["finance", "Financeiro", "chart"],
  ["automations", "Automações", "bolt"],
  ["ai", "Assistente IA", "spark", "IA"],
  ["settings", "Configurações", "settings"],
];
function icon(t) {
  let paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    radar:
      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12L19 5M12 3v2M3 12h2"/>',
    chart: '<path d="M4 3v17h17M8 15l4-5 4 3 5-7"/>',
    window:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M7 6h1"/>',
    file: '<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6"/>',
    chat: '<path d="M21 11a9 9 0 01-9 9H3l2-4a9 9 0 1116-5z"/>',
    columns:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
    users:
      '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0112 0v3M16 5a3 3 0 010 6M18 15a4 4 0 013 4v2"/>',
    bag: '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 7V5a4 4 0 018 0v2"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 10-13h-7z"/>',
    settings: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    spark:
      '<path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[t] || paths.grid}</svg>`;
}
$("#nav").innerHTML = navs
  .map((n) =>
    n.length === 1
      ? `<div class="nav-label">${n[0]}</div>`
      : `<a class="nav-link" href="#${n[0]}" data-page="${n[0]}">${icon(n[2])}<span>${n[1]}</span>${n[3] ? `<em>${n[3]}</em>` : ""}</a>`,
  )
  .join("");
async function api(url, method = "GET", data) {
  const r = await fetch("/api" + url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const d = await r.json().catch(() => ({ error: "Registro não encontrado" }));
  if (!r.ok) {
    if (r.status === 401) auth();
    throw Error(d.error || "Falha na operação");
  }
  return d;
}
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").style.display = "block";
  clearTimeout(window.tt);
  window.tt = setTimeout(() => ($("#toast").style.display = "none"), 6000);
}
function modal(title, body) {
  $("#modal").hidden = false;
  $("#modal").innerHTML =
    `<section class="modal" role="dialog" aria-modal="true" aria-label="${E(title)}"><div class="modal-top"><h2>${E(title)}</h2><button onclick="closeModal()" aria-label="Fechar">×</button></div>${body}</section>`;
  $("#modal input")?.focus();
}
function closeModal() {
  $("#modal").hidden = true;
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    location.hash = "crm";
  }
});
$("#modal").onclick = (e) => {
  if (e.target === $("#modal")) closeModal();
};
async function run(fn) {
  try {
    return await fn();
  } catch (e) {
    toast(e.message);
  }
}
async function refresh() {
  if (user) {
    state = await api("/state");
    integrations = await api("/integrations");
  }
  render();
}
function auth(register = false) {
  modal(
    register ? "Crie seu workspace" : "Bem-vindo ao DROJNICK OS",
    `<p>Entre para salvar leads, gerar sites e acompanhar suas vendas.</p><form id="authform">${register ? '<label>Seu nome</label><input name="name" required autocomplete="name">' : ""}<label>E-mail</label><input name="email" type="email" required autocomplete="email"><label>Senha · mínimo de 10 caracteres</label><input name="password" type="password" minlength="10" maxlength="128" required autocomplete="${register ? "new-password" : "current-password"}"><button class="primary full">${register ? "Criar conta" : "Entrar no workspace"}</button></form><p><a href="#" id="switchauth">${register ? "Já tenho uma conta" : "Criar minha conta"}</a></p>`,
  );
  $("#switchauth").onclick = (e) => {
    e.preventDefault();
    auth(!register);
  };
  $("#authform").onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      user = await api(
        "/auth/" + (register ? "register" : "login"),
        "POST",
        Object.fromEntries(new FormData(e.target)),
      );
      closeModal();
      await refresh();
      toast("Seu workspace está pronto.");
    });
  };
}
$("#account").onclick = () =>
  user
    ? modal(
        "Sua conta",
        `<p>${E(user.name)} · ${E(user.email)}</p><button onclick="logout()">Sair da conta</button>`,
      )
    : auth();
async function logout() {
  await api("/logout", "POST");
  location.reload();
}
$("#collapse").onclick = () =>
  document.body.classList.toggle(
    innerWidth <= 800 ? "menu-open" : "sidebar-collapsed",
  );
$("#notifications").onclick = () => {
  modal(
    "Atividades recentes",
    state.activities
      .slice(0, 20)
      .map(
        (a) =>
          `<p>${E(a.text)}<br><small>${new Date(a.created).toLocaleString("pt-BR")}</small></p>`,
      )
      .join("") || "<p>Nenhuma atividade registrada.</p>",
  );
};
function title(name, sub, actions = "") {
  return `<div class="page-title"><div><div class="eyebrow">SEU WORKSPACE, SUAS POSSIBILIDADES</div><h1>${name}</h1><p>${sub}</p></div><div class="actions">${actions}</div></div>`;
}
function empty(name, sub, action = "") {
  return `<div class="empty"><span class="empty-icon">◇</span><b>${name}</b>${sub}${action}</div>`;
}
function metric(label, value, sub, ico) {
  return `<div class="metric"><div class="metric-top">${label}<span class="metric-icon">${ico}</span></div><strong>${value}</strong><small>${sub}</small></div>`;
}
function panel(name, sub, body, link = "") {
  return `<section class="panel"><div class="panel-head"><div><h2>${name}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${link}</div>${body}</section>`;
}
function need() {
  if (!user) {
    auth();
    return false;
  }
  return true;
}
function overview() {
  let paid = state.sales.filter((s) => s.paid),
    total = paid.reduce((n, s) => n + s.amount, 0),
    conversion = state.leads.length
      ? Math.round((state.sales.length / state.leads.length) * 100)
      : 0;
  return (
    title(
      `Seu próximo negócio começa aqui<span style="color:#b38bdd">.</span>`,
      "Encontre oportunidades. Crie experiências. Transforme conexões em vendas.",
      `<span class="date">◷ ${new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}</span><button class="primary" onclick="location.hash='radar'">＋ Nova prospecção</button>`,
    ) +
    `<section class="hero"><div><span class="badge">✧ SEU NEGÓCIO, EM OUTRO NÍVEL</span><h2>Da oportunidade ao próximo cliente.</h2><p>Descubra negócios locais, crie sites personalizados e envie propostas.<br>Tudo o que você precisa para vender mais, em um só lugar.</p><button class="primary" style="margin-top:13px;font-size:11px" onclick="location.hash='radar'">Explorar radar de negócios <span style="margin-left:15px">↗</span></button></div><div class="hero-art"><div class="orbit"></div><div class="orbit-line"></div><span class="float-icon">⌖</span><span class="float-icon">▣</span><span class="float-icon">↗</span></div></section><div class="metrics">${metric("Leads no radar", state.leads.length, "<span>◈</span> Oportunidades salvas", "⌖")}${metric("Sites gerados", state.projects.length, `${state.projects.filter((p) => p.published).length} demonstrações disponíveis`, "▣")}${metric("Propostas criadas", state.proposals.length, "Prontas para sua próxima venda", "▤")}${metric("Receita recebida", money(total), "Somente recebimentos registrados", "↗")}</div><div class="grid-main">${panel("Visão de vendas", "Acompanhe a evolução do seu negócio", salesChart(), '<div class="tabs"><button class="active" onclick="chartPeriod(this,30)">30 dias</button><button onclick="chartPeriod(this,90)">90 dias</button><button onclick="chartPeriod(this,365)">1 ano</button></div>')}${panel(
      "Seu funil de conversão",
      "Cada etapa, uma nova oportunidade.",
      `<div class="funnel">${[
        ["Leads encontrados", state.leads.length],
        ["Sites gerados", state.projects.length],
        ["Propostas criadas", state.proposals.length],
        [
          "Em negociação",
          state.leads.filter((l) => l.status === "Negociando").length,
        ],
        ["Vendas fechadas", state.sales.length],
      ]
        .map(
          ([n, v]) =>
            `<div class="funnel-row"><span>${n}</span><div class="bar"><i style="width:${state.leads.length ? Math.min(100, (v / state.leads.length) * 100) : 0}%"></i></div><b>${v}</b></div>`,
        )
        .join(
          "",
        )}<div class="funnel-bottom">Taxa de conversão <strong>${conversion}% ↗</strong></div></div>`,
    )}</div><div class="grid-main">${panel("Oportunidades recentes", "Seu próximo cliente pode estar aqui.", state.leads.length ? leadTable(state.leads.slice(0, 3)) : empty("Seu radar está pronto para começar", "Encontre negócios que precisam de uma presença digital."), '<a href="#radar">Ver radar ↗</a>')}${panel("Próximas tarefas", `${state.tasks.filter((t) => !t.done).length} atividades pendentes`, taskList(), '<a href="#automations">Ver todas ↗</a>')}</div><h2>Seu próximo passo</h2><div class="quick-grid">${[
      ["radar", "⌖", "Encontrar empresas", "Explore novas oportunidades"],
      ["generator", "✧", "Criar um site", "Transforme uma ideia em projeto"],
      ["proposals", "▤", "Preparar proposta", "Dê o próximo passo na venda"],
    ]
      .map(
        ([r, i, n, d]) =>
          `<a class="quick-card" href="#${r}"><span class="quick-icon">${i}</span><div><h3>${n}</h3><p>${d}</p></div><span>↗</span></a>`,
      )
      .join(
        "",
      )}</div><div class="integration-note">ⓘ <span>${integrations.places ? "Google Places configurado. Consultas podem gerar custos no fornecedor." : "Conecte suas ferramentas para ir além. Configure o Google Places e seu provedor de IA."}</span><a href="#settings">Configurar integrações →</a></div>`
  );
}
function salesChart(days = 30) {
  const sales = state.sales.filter(
      (s) => s.paid && Date.now() - new Date(s.created) < days * 86400000,
    ),
    total = sales.reduce((a, s) => a + s.amount, 0);
  const buckets = Array.from({ length: 7 }, () => 0);
  sales.forEach((s) => {
    const age = (Date.now() - new Date(s.created)) / 86400000;
    const i = Math.min(6, Math.max(0, 6 - Math.floor(age / (days / 7))));
    buckets[i] += s.amount;
  });
  const peak = Math.max(1, ...buckets);
  const bars = `<div class="sales-bars">${buckets.map((v, i) => `<div class="sales-bar" style="height:${Math.max(2, (v / peak) * 100)}%" tabindex="0" title="Período ${i + 1}: ${money(v)}" aria-label="Período ${i + 1}: ${money(v)}"><span>${money(v)}</span></div>`).join("")}</div>`;
  return `<div class="chart" id="sales-chart"><div class="chart-grid">${[4, 3, 2, 1, 0].map((n) => `<div class="chart-line"><span>${money(total ? (n * peak) / 4 : n * 250)}</span></div>`).join("")}</div>${total ? bars : '<div class="chart-empty"><b>Uma nova história de vendas começa aqui</b><span>Seus recebimentos aparecerão neste painel.</span></div>'}<div class="chart-months"><span>Início do período</span><span>Últimos ${days} dias</span><span>Hoje</span></div></div>`;
}
function chartPeriod(el, d) {
  el.parentNode
    .querySelectorAll("button")
    .forEach((b) => b.classList.remove("active"));
  el.classList.add("active");
  $("#sales-chart").outerHTML = salesChart(d);
}
function taskList() {
  return state.tasks.length
    ? state.tasks
        .slice(0, 5)
        .map(
          (t) =>
            `<label class="list-item"><input type="checkbox" ${t.done ? "checked" : ""} onchange="toggleTask('${t.id}',this.checked)">${E(t.title)}</label>`,
        )
        .join("")
    : empty(
        "Tudo em dia por aqui",
        "Organize seus próximos passos e follow-ups.",
        '<button onclick="newTask()">＋ Criar tarefa</button>',
      );
}
function newTask() {
  if (!need()) return;
  modal(
    "Nova tarefa",
    '<form id="taskform"><label>O que precisa ser feito?</label><input name="title" required maxlength="300"><button class="primary">Salvar tarefa</button></form>',
  );
  $("#taskform").onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      await api("/tasks", "POST", Object.fromEntries(new FormData(e.target)));
      closeModal();
      await refresh();
    });
  };
}
function toggleTask(id, done) {
  run(async () => {
    await api("/tasks/" + id, "PATCH", { done });
    await refresh();
  });
}
function leadTable(leads) {
  return `<div class="table-wrap"><table><thead><tr><th>Estabelecimento</th><th>Presença digital</th><th>Etapa</th><th></th></tr></thead><tbody>${leads.map((l) => `<tr><td><b>${E(l.name)}</b><small>${E(l.category)} · ${E(l.source)}</small></td><td>${l.website ? "Website identificado" : "Website não informado"}${l.demo ? "<small>DADOS DEMONSTRATIVOS</small>" : ""}</td><td><span class="pill">${E(l.status)}</span></td><td><button onclick="leadDetail('${l.id}')">Abrir ↗</button></td></tr>`).join("")}</tbody></table></div>`;
}
function radar() {
  return (
    title(
      "Radar de negócios",
      "Encontre empresas reais. Identifique oportunidades verificáveis.",
      '<button onclick="manualLead()">＋ Cadastro manual</button>',
    ) +
    `<div class="notice">${integrations.places ? "Chave do Google Places configurada. A disponibilidade será verificada na pesquisa." : 'Google Places não configurado. <button type="button" onclick="configurePlaces()">Configurar chave</button> ou use o modo demonstração.'}</div><section class="panel"><form id="searchform" class="toolbar"><div><label>Categoria</label><select name="category"><option>Restaurante</option><option>Barbearia</option><option>Clínica</option><option>Pet shop</option><option>Academia</option><option>Oficina mecânica</option><option>Hotel</option><option>Loja de roupas</option></select></div><div><label>Cidade e região</label><input name="city" placeholder="Ex.: Rio de Janeiro, Copacabana" required value="Rio de Janeiro"></div><div><label>Fonte de pesquisa</label><select name="mode"><option value="real">Google Places · dados reais</option><option value="demo" ${!integrations.places ? "selected" : ""}>Demonstração identificada</option></select></div><button class="primary">⌕ Buscar negócios</button></form></section><div id="results" style="margin-top:22px">${resultCards()}</div>`
  );
}
function resultCards() {
  return results.length
    ? `<div class="cards">${results.map((l, i) => `<article class="project-card"><div class="project-body"><span class="pill">${l.demo ? "DEMONSTRAÇÃO" : "Google Places"}</span><h3 style="margin-top:18px">${E(l.name)}</h3><p>${E(l.address)}</p><p>${l.rating ? "★ " + l.rating + " · " + l.reviews + " avaliações" : "Avaliações não disponíveis"}</p><p>${l.website ? "Website identificado" : "Website não identificado na fonte"}</p><small>Consulta: ${new Date(l.queriedAt).toLocaleString("pt-BR")}</small><div class="actions"><button class="primary" onclick="saveResult(${i})">＋ Salvar lead</button>${l.maps ? `<a href="${safeLink(l.maps)}" target="_blank" rel="noopener">Mapa ↗</a>` : ""}</div></div></article>`).join("")}</div>${pageToken ? '<button style="margin-top:20px" onclick="searchMore()">Carregar mais</button>' : ""}`
    : empty(
        "Um mundo de oportunidades lá fora",
        "Escolha um segmento e uma cidade para iniciar sua pesquisa.",
      );
}
function safeLink(s) {
  try {
    const u = new URL(s);
    return ["https:", "http:"].includes(u.protocol) ? E(u.href) : "#";
  } catch {
    return "#";
  }
}
let searchArgs;
async function doSearch(args) {
  if (!need()) return;
  $("#results").innerHTML = empty(
    "Consultando a fonte...",
    "Aguarde alguns instantes.",
  );
  await run(async () => {
    const d = await api("/search", "POST", args);
    results = args.pageToken
      ? [
          ...results,
          ...d.businesses.filter(
            (b) => !results.some((x) => x.providerId === b.providerId),
          ),
        ]
      : d.businesses;
    pageToken = d.nextPageToken || "";
    $("#results").innerHTML = resultCards();
  });
  if ($("#results").textContent.includes("Consultando"))
    $("#results").innerHTML = empty(
      "Não foi possível concluir a pesquisa",
      "Verifique a configuração e tente novamente.",
    );
}
function searchMore() {
  doSearch({ ...searchArgs, pageToken });
}
function saveResult(i) {
  run(async () => {
    await api("/leads", "POST", results[i]);
    await refresh();
    toast("Lead salvo no CRM.");
  });
}
function manualLead() {
  if (!need()) return;
  modal(
    "Cadastrar estabelecimento",
    `<p>Use dados fornecidos pelo estabelecimento ou uma fonte pública identificável.</p><form id="leadform"><label>Nome</label><input name="name" required><div class="form-grid"><div><label>Categoria</label><input name="category" value="Restaurante"></div><div><label>Telefone com DDD</label><input name="phone"></div></div><label>Endereço</label><input name="address"><label>Website</label><input name="website"><label>Fonte dos dados</label><input name="source" value="Cadastro manual" required><button class="primary">Salvar lead</button></form>`,
  );
  $("#leadform").onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      await api("/leads", "POST", Object.fromEntries(new FormData(e.target)));
      closeModal();
      await refresh();
      toast("Lead salvo.");
    });
  };
}
function leadDetail(id) {
  const l = state.leads.find((x) => x.id === id);
  modal(
    l.name,
    `<p>${E(l.address)}<br>Fonte: ${E(l.source)}${l.demo ? " · DADOS DEMONSTRATIVOS" : ""}</p><label>Etapa do funil</label><select id="leadstatus">${stages.map((s) => `<option ${s === l.status ? "selected" : ""}>${s}</option>`).join("")}</select><label>Telefone público com DDD</label><input id="leadphone" value="${E(l.phone)}"><label>Anotações</label><textarea id="leadnotes">${E(l.notes || "")}</textarea><div class="actions" style="margin-top:15px"><button onclick="updateLead('${id}')">Salvar alterações</button><button onclick="analyze('${id}')">Analisar empresa</button><button class="primary" onclick="generate('${id}')">✧ Gerar site</button></div>${l.analysis ? `<hr style="border-color:#34273f;margin-top:25px"><h3>Business Intelligence · ${l.analysis.score}/100</h3><p>${E(l.analysis.potential)}. Avaliação preliminar, sem inferir capacidade de pagamento.</p><small>${E(l.analysis.criteria)}</small><h4>Fatos da fonte</h4>${l.analysis.facts.map((x) => `<p>• ${E(x)}</p>`).join("")}<h4>Inferências</h4>${l.analysis.inferences.map((x) => `<p>• ${E(x)}</p>`).join("")}<h4>Dados indisponíveis</h4>${l.analysis.missing.map((x) => `<p>• ${E(x)}</p>`).join("")}` : ""}`,
  );
}
const stages = [
  "Novo",
  "Analisado",
  "Site em criação",
  "Demonstração pronta",
  "Proposta preparada",
  "Contatado",
  "Respondeu",
  "Negociando",
  "Aguardando pagamento",
  "Fechado",
  "Perdido",
];
function updateLead(id) {
  run(async () => {
    await api("/leads/" + id, "PATCH", {
      status: $("#leadstatus").value,
      notes: $("#leadnotes").value,
      phone: $("#leadphone").value,
    });
    closeModal();
    await refresh();
    toast("Lead atualizado.");
  });
}
function analyze(id) {
  run(async () => {
    await api("/leads/" + id + "/analyze", "POST");
    await refresh();
    leadDetail(id);
  });
}
function generate(id) {
  run(async () => {
    const p = await api("/projects", "POST", {
      leadId: id,
      template: selectedTemplate,
    });
    closeModal();
    await refresh();
    location.hash = "edit/" + p.id;
    toast(
      "Demonstração criada com template. Revise os campos antes de compartilhar.",
    );
  });
}
function projects(generator = false) {
  return (
    title(
      generator ? "DROJNICK Website Generator" : "Sites e projetos",
      generator
        ? "Transforme informações verificáveis em uma demonstração navegável."
        : "Crie, edite e publique a próxima presença digital.",
      '<button class="primary" onclick="chooseLead()">✧ Gerar novo site</button>',
    ) +
    (generator
      ? '<div class="notice">Geração por blocos e templates. Produtos, preços e informações ausentes devem ser fornecidos e revisados por você.</div>'
      : "") +
    (state.projects.length
      ? `<div class="cards">${state.projects.map((p) => `<article class="project-card"><div class="project-preview"><small>${E(p.template)} · ${p.official ? "SITE DEFINITIVO" : "DEMONSTRAÇÃO"}</small><strong>${E(p.title)}</strong></div><div class="project-body"><span class="pill">${p.published ? "Publicado" : "Despublicado"}</span><p>${p.products.length} produtos · ${p.versions.length} versões salvas</p><div class="actions"><button class="primary" onclick="location.hash='edit/${p.id}'">Editar site</button><button onclick="window.open('/preview/${p.id}','_blank','noopener')">Visualizar ↗</button><button onclick="newProposal('${p.id}')">Proposta</button></div></div></article>`).join("")}</div>`
      : panel(
          "Seus projetos",
          "",
          empty(
            "Seu primeiro site começa com um lead",
            "Cadastre ou encontre um estabelecimento no radar.",
            '<button onclick="chooseLead()">✧ Começar projeto</button>',
          ),
        ))
  );
}
function chooseLead() {
  if (!need()) return;
  modal(
    "Escolha um estabelecimento",
    state.leads.length
      ? state.leads
          .map(
            (l) =>
              `<div class="list-item"><span>${E(l.name)}</span><button style="margin-left:auto" onclick="generate('${l.id}')">Gerar site</button></div>`,
          )
          .join("")
      : "<p>Salve um lead no radar para começar.</p><button onclick=\"closeModal();location.hash='radar'\">Abrir radar</button>",
  );
}
function editor(id) {
  const p = state.projects.find((p) => p.id === id);
  if (!p) return empty("Projeto não encontrado", "");
  return (
    title(
      "Seu site, do seu jeito",
      "Edite o conteúdo estruturado e salve uma nova versão.",
      `<button onclick="window.open('/preview/${p.id}','_blank','noopener')">Abrir demonstração ↗</button>`,
    ) +
    `<div class="editor"><form class="panel editor-form" id="editorform"><h3>Conteúdo do site</h3><label>Nome / título</label><input name="title" value="${E(p.title)}" required><label>Apresentação</label><textarea name="description">${E(p.description)}</textarea><label>Endereço</label><input name="address" value="${E(p.address)}"><label>Telefone com DDD</label><input name="phone" value="${E(p.phone)}"><label>Cor principal</label><input name="color" type="color" value="${E(p.color)}"><label>Cardápio · um produto por linha: Nome | preço</label><textarea name="products" placeholder="Insira somente produtos e preços fornecidos">${E(p.products.map((x) => x.name + " | " + x.price.toFixed(2)).join("\n"))}</textarea><label>Publicação</label><select name="published"><option value="true" ${p.published ? "selected" : ""}>Publicado</option><option value="false" ${!p.published ? "selected" : ""}>Despublicado</option></select><label>Tipo</label><select name="official"><option value="false" ${!p.official ? "selected" : ""}>Demonstração comercial</option><option value="true" ${p.official ? "selected" : ""}>Definitivo · conteúdo aprovado</option></select><button class="primary full">Salvar versão</button><p>${p.versions.length} versão(ões) anterior(es)</p>${p.versions.length ? `<button type="button" onclick="restoreProject('${id}')">Restaurar versão anterior</button>` : ""}</form><div><div class="actions" style="margin-bottom:12px"><button onclick="$('#siteframe').style.maxWidth='100%'">Desktop</button><button onclick="$('#siteframe').style.maxWidth='375px'">Celular</button></div><iframe title="Prévia do site" id="siteframe" src="/preview/${p.id}"></iframe></div></div>`
  );
}
function restoreProject(id) {
  const p = state.projects.find((x) => x.id === id);
  run(async () => {
    await api("/projects/" + id, "PUT", p.versions.at(-1));
    await refresh();
    toast("Versão anterior restaurada.");
  });
}
function newProposal(id) {
  if (!need()) return;
  if (!id) {
    modal(
      "Escolha o projeto",
      state.projects
        .map(
          (p) =>
            `<div class="list-item">${E(p.title)}<button onclick="newProposal('${p.id}')">Escolher</button></div>`,
        )
        .join("") || "<p>Gere um site antes de preparar a proposta.</p>",
    );
    return;
  }
  modal(
    "Preparar proposta comercial",
    `<p>Site responsivo com contato, localização e cardápio fornecido pelo cliente. Prazo inicial: 7 dias úteis; 2 revisões.</p><form id="proposalform"><label>Investimento proposto (R$)</label><input type="number" min="1" step="0.01" name="amount" value="500" required><p>Referência interna editável. Domínio e hospedagem não inclusos.</p><button class="primary">Gerar proposta e PDF</button></form>`,
  );
  $("#proposalform").onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      await api("/proposals", "POST", {
        projectId: id,
        amount: new FormData(e.target).get("amount"),
      });
      closeModal();
      await refresh();
      location.hash = "proposals";
      toast("Proposta e PDF disponíveis.");
    });
  };
}
function proposals(whatsapp = false) {
  return (
    title(
      whatsapp ? "Conversas que abrem portas" : "Propostas comerciais",
      whatsapp
        ? "Revise a mensagem e mantenha o envio sob seu controle."
        : "Apresente sua solução com clareza e transforme interesse em negócio.",
      '<button class="primary" onclick="newProposal()">＋ Nova proposta</button>',
    ) +
    (state.proposals.length
      ? `<div class="cards">${state.proposals.map((p) => `<article class="project-card"><div class="project-body"><span class="pill">Proposta preparada</span><h3 style="margin-top:18px">${E(p.name)}</h3><h2 style="font-size:26px">${money(p.amount)}</h2><p>${E(p.scope)}</p><div class="actions"><button onclick="window.open('/proposal/${p.id}','_blank','noopener')">Ver proposta ↗</button><button onclick="window.open('/proposal/${p.id}/pdf','_blank','noopener')">PDF ↓</button><button class="primary" onclick="contact('${p.id}')">Enviar proposta + demonstração</button><button onclick="recordSale('${p.id}')">Registrar venda</button></div></div></article>`).join("")}</div>`
      : panel(
          "Suas propostas",
          "",
          empty(
            "Uma boa proposta começa com uma solução",
            "Gere um site para preparar sua primeira proposta.",
          ),
        ))
  );
}
function contact(id) {
  run(async () => {
    const d = await api("/proposals/" + id + "/contact", "POST");
    modal(
      "Revise antes de abrir o WhatsApp",
      `<label>Mensagem preparada</label><textarea id="message" style="height:230px">${E(d.message)}</textarea><p>Abrir o WhatsApp não confirma envio, recebimento ou leitura.</p><div class="actions"><button class="primary" id="openwa">Abrir WhatsApp ↗</button><button onclick="confirmContact('${id}')">Confirmo que enviei manualmente</button></div>`,
    );
    $("#openwa").onclick = () =>
      window.open(
        d.url.split("?")[0] +
          "?text=" +
          encodeURIComponent($("#message").value),
        "_blank",
        "noopener",
      );
  });
}
function confirmContact(id) {
  run(async () => {
    await api("/proposals/" + id + "/confirm-contact", "POST");
    closeModal();
    await refresh();
    toast("Envio declarado por você e registrado no CRM.");
  });
}
function recordSale(id) {
  modal(
    "Registrar venda manualmente",
    `<p>Registre o recebimento somente se você o verificou. Esta operação não consulta um provedor de pagamentos.</p><button onclick="saveSale('${id}',false)">Venda fechada · pagamento pendente</button><button class="primary" style="margin-top:15px" onclick="saveSale('${id}',true)">Confirmo o recebimento manualmente</button>`,
  );
}
function saveSale(id, paid) {
  run(async () => {
    await api("/sales", "POST", { proposalId: id, paid });
    closeModal();
    await refresh();
    toast("Venda registrada e tarefa de entrega criada.");
  });
}
function crm(analysis = false) {
  return (
    title(
      analysis ? "Análise de empresas" : "Seu relacionamento, em movimento",
      analysis
        ? "Fatos, inferências e lacunas claramente separados."
        : "Acompanhe cada oportunidade do primeiro contato ao fechamento.",
      '<button onclick="manualLead()">＋ Novo lead</button>',
    ) +
    `<div class="toolbar" style="padding:0 0 20px"><input id="leadsearch" placeholder="⌕ Buscar estabelecimento..." aria-label="Buscar estabelecimento"></div><div id="leadlisting">${analysis ? leadTable(state.leads) : kanban(state.leads)}</div>`
  );
}
function kanban(leads) {
  return `<div class="kanban">${stages
    .map(
      (s) =>
        `<section class="column" data-stage="${s}" ondragover="event.preventDefault()" ondrop="dropLead(event,this.dataset.stage)"><h3>${s} <small> ${leads.filter((l) => l.status === s).length}</small></h3>${leads
          .filter((l) => l.status === s)
          .map(
            (l) =>
              `<article class="lead-card" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${l.id}')" onclick="leadDetail('${l.id}')"><strong>${E(l.name)}</strong><p>${E(l.category)} · ${l.analysis ? "Oportunidade " + l.analysis.score + "/100" : "Análise pendente"}</p><span class="pill">${l.demo ? "Demonstração" : E(l.source)}</span></article>`,
          )
          .join("")}</section>`,
    )
    .join("")}</div>`;
}
function dropLead(e, status) {
  e.preventDefault();
  const id = e.dataTransfer.getData("text/plain");
  if (!state.leads.some((l) => l.id === id)) return;
  run(async () => {
    await api("/leads/" + id, "PATCH", { status });
    await refresh();
  });
}
function finance() {
  let received = state.sales
      .filter((s) => s.paid)
      .reduce((a, s) => a + s.amount, 0),
    pending = state.sales
      .filter((s) => !s.paid)
      .reduce((a, s) => a + s.amount, 0);
  return (
    title(
      "Uma visão clara do seu negócio",
      "Vendas e recebimentos registrados, sem estimativas inventadas.",
    ) +
    `<div class="metrics">${metric("Recebido", money(received), "Confirmações manuais registradas", "↗")}${metric("A receber", money(pending), "Vendas com pagamento pendente", "◷")}${metric("Vendas fechadas", state.sales.length, "Registros persistentes", "▤")}${metric("Ticket médio", money(state.sales.length ? (received + pending) / state.sales.length : 0), "Valor médio por venda", "◇")}</div>` +
    panel(
      "Histórico de vendas",
      "",
      state.sales.length
        ? `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Valor</th><th>Confirmação</th></tr></thead><tbody>${state.sales.map((s) => `<tr><td>${E(s.name)}</td><td>${money(s.amount)}</td><td>${E(s.confirmation)}</td></tr>`).join("")}</tbody></table></div>`
        : empty(
            "Seu primeiro fechamento está por vir",
            "Registre uma venda a partir de uma proposta.",
          ),
    )
  );
}
function templates() {
  return (
    title(
      "Um bom ponto de partida",
      "Estruturas originais com dados editáveis. Todos os modelos usam o mesmo editor de blocos.",
    ) +
    `<div class="cards">${["Essencial", "Bistrô", "Studio"].map((t, i) => `<article class="project-card"><div class="project-preview" style="background:${["#27203d", "#302921", "#1f3030"][i]}"><small>TEMPLATE ${i + 1}</small><strong>${t}</strong><p>Apresentação · catálogo · contato</p></div><div class="project-body"><p>Responsivo · conteúdo estruturado · WhatsApp</p><button onclick="selectedTemplate='${t}';chooseLead()">Usar estrutura</button></div></article>`).join("")}</div>`
  );
}
function settings() {
  return (
    title(
      "Conexões e configurações",
      "As chaves permanecem exclusivamente no servidor.",
    ) +
    `<div class="cards">${[
      [
        "Google Places",
        integrations.places,
        "GOOGLE_PLACES_API_KEY",
        integrations.placesSource === "account"
          ? "Chave desta conta configurada. A chave não é exibida novamente; a conexão é verificada ao pesquisar."
          : integrations.placesSource === "server"
            ? "Chave fornecida pelo servidor. A conexão é verificada ao pesquisar."
            : "Ative Places API (New) e faturamento no Google Cloud; depois adicione sua chave aqui.",
      ],
      [
        "Inteligência artificial",
        integrations.ai,
        "OPENAI_API_KEY · OPENAI_MODEL",
        "Assistente com provedor OpenAI. Geração de sites por templates funciona sem IA.",
      ],
      [
        "Endereço público",
        !!integrations.publicBase,
        "PUBLIC_BASE_URL",
        integrations.publicBase ||
          "Use a URL HTTPS da sua hospedagem para gerar links compartilháveis.",
      ],
      [
        "Mercado Pago",
        false,
        "Não implementado nesta entrega",
        "Recebimentos podem ser registrados manualmente com auditoria.",
      ],
    ]
      .map(
        ([n, on, v, d]) =>
          `<article class="project-card"><div class="project-body"><h3>${n}</h3><span class="pill">${on ? "Configurado" : "Configuração pendente / indisponível"}</span><p>${E(d)}</p><small>${E(v)}</small>${n === "Google Places" ? `<div class="actions" style="margin-top:16px"><button onclick="configurePlaces()">${integrations.places ? "Alterar chave" : "Configurar chave"}</button>${integrations.placesSource === "account" ? '<button onclick="removePlaces()">Remover chave da conta</button>' : ""}</div>` : ""}</div></article>`,
      )
      .join(
        "",
      )}</div><div class="notice" style="margin-top:20px">A chave do Google Places pode ser configurada nesta conta. Outras variáveis devem ser configuradas no painel seguro da hospedagem. Não envie credenciais pelo chat. Contas são isoladas; colaboração e acesso limitado de clientes ainda não implementados.</div>`
  );
}
function configurePlaces() {
  if (!need()) return;
  modal(
    "Configurar Google Places",
    `<p>No Google Cloud, ative o faturamento e a Places API (New), crie uma chave e restrinja seu uso a essa API. A chave é armazenada criptografada no servidor desta instalação e não será exibida novamente.</p><p><a href="https://developers.google.com/maps/documentation/places/web-service/cloud-setup?hl=pt-br" target="_blank" rel="noopener">Como configurar no Google Cloud ↗</a></p><p>Use uma conexão HTTPS confiável para enviar a chave. Salvar não valida a chave nem confirma faturamento; a primeira pesquisa verificará a integração.</p><form id="placesform"><label for="placeskey">Chave da API Google Places</label><input id="placeskey" name="key" type="password" autocomplete="off" spellcheck="false" required maxlength="512"><button class="primary">Salvar chave para minha conta</button></form>${integrations.placesSource === "account" ? "<p>Para remover a chave, acesse Configurações.</p>" : ""}`,
  );
  $("#placesform").onsubmit = (e) => {
    e.preventDefault();
    const key = $("#placeskey").value;
    run(async () => {
      await api("/integrations/google-places", "PUT", { key });
      closeModal();
      results = [];
      pageToken = "";
      await refresh();
      if (location.hash === "#radar") $("select[name=mode]").value = "real";
      toast("Chave salva. Faça uma pesquisa para verificar a integração.");
    });
  };
}
function removePlaces() {
  modal(
    "Remover chave do Google Places",
    `<p>A chave da sua conta será removida desta instalação. Caso exista uma chave configurada no servidor, ela continuará disponível para esta conta.</p><button id="remove-places-confirm">Remover chave</button>`,
  );
  $("#remove-places-confirm").onclick = () =>
    run(async () => {
      await api("/integrations/google-places", "DELETE");
      closeModal();
      results = [];
      pageToken = "";
      await refresh();
      toast("Chave da conta removida.");
    });
}
function automations() {
  return (
    title(
      "Organize os próximos passos",
      "Tarefas persistentes e histórico das ações do workspace.",
      '<button class="primary" onclick="newTask()">＋ Criar tarefa</button>',
    ) +
    `<div class="notice">Automações disponíveis: gerar demonstração, preparar proposta e criar tarefa de entrega ao registrar venda. Fila em lote e follow-up automático ainda não implementados.</div><div class="grid-main">${panel("Suas tarefas", "", taskList())}${panel(
      "Histórico de execução",
      "",
      state.activities
        .slice(0, 12)
        .map((a) => `<div class="list-item">${E(a.text)}</div>`)
        .join("") ||
        empty("Nenhuma ação registrada", "Suas operações aparecerão aqui."),
    )}</div>`
  );
}
function render() {
  const route = location.hash.slice(1) || "overview",
    page = route.split("/")[0];
  document.body.classList.remove("menu-open");
  document
    .querySelectorAll(".nav-link")
    .forEach((a) => a.classList.toggle("active", a.dataset.page === page));
  $("#crumb").textContent =
    navs.find((n) => n[0] === page)?.[1] || "Editor de site";
  $("#account").textContent = user ? user.name[0].toUpperCase() : "D";
  let html;
  switch (page) {
    case "radar":
      html = radar();
      break;
    case "analysis":
      html = crm(true);
      break;
    case "generator":
    case "projects":
      html = projects(page === "generator");
      break;
    case "edit":
      html = editor(route.split("/")[1]);
      break;
    case "proposals":
    case "whatsapp":
      html = proposals(page === "whatsapp");
      break;
    case "crm":
      html = crm();
      break;
    case "finance":
    case "sales":
      html = finance();
      break;
    case "templates":
      html = templates();
      break;
    case "settings":
      html = settings();
      break;
    case "automations":
      html = automations();
      break;
    case "clients":
      html =
        title("Clientes", "Estabelecimentos com vendas registradas.") +
        panel(
          "Seus clientes",
          "",
          leadTable(state.leads.filter((l) => l.status === "Fechado")),
        );
      break;
    case "contracts":
      html =
        title("Contratos", "Formalize o escopo e as condições do projeto.") +
        '<div class="notice">Módulo de contratos e assinatura eletrônica ainda não implementado. As condições iniciais estão nas propostas; o contrato comercial requer revisão jurídica.</div>';
      break;
    case "ai":
      html =
        title(
          "DROJNICK AI Assistant",
          "Uma segunda perspectiva para suas próximas oportunidades.",
        ) +
        `<section class="panel chat"><h3>Como posso ajudar seu negócio?</h3><p>${integrations.ai ? "Provedor OpenAI configurado." : "Provedor de IA não configurado. Configure OPENAI_API_KEY no servidor."}</p><form id="aiform"><label>Sua mensagem</label><textarea name="prompt" required placeholder="Ajude a revisar minha proposta comercial..."></textarea><button class="primary">Enviar para IA</button></form><pre id="airesponse"></pre></section>`;
      break;
    default:
      html = overview();
  }
  $("#content").innerHTML = html;
  if ($("#searchform"))
    $("#searchform").onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      searchArgs = {
        category: d.category,
        city: d.city,
        demo: d.mode === "demo",
      };
      doSearch(searchArgs);
    };
  if ($("#leadsearch"))
    $("#leadsearch").oninput = (e) => {
      const ls = state.leads.filter((l) =>
        l.name.toLowerCase().includes(e.target.value.toLowerCase()),
      );
      $("#leadlisting").innerHTML =
        page === "analysis" ? leadTable(ls) : kanban(ls);
    };
  if ($("#editorform"))
    $("#editorform").onsubmit = (e) => {
      e.preventDefault();
      run(async () => {
        const d = Object.fromEntries(new FormData(e.target));
        d.published = d.published === "true";
        d.official = d.official === "true";
        d.products = d.products.trim()
          ? d.products.split("\n").map((line) => {
              const [name, price] = line.split("|");
              if (
                !name?.trim() ||
                !price?.trim() ||
                !Number.isFinite(Number(price.trim().replace(",", ".")))
              )
                throw Error("Use o formato Nome | preço em cada linha.");
              return {
                name: name.trim(),
                price: Number(price.trim().replace(",", ".")),
              };
            })
          : [];
        await api("/projects/" + route.split("/")[1], "PUT", d);
        await refresh();
        toast("Versão salva. Conteúdo persistido e prévia atualizada.");
      });
    };
  if ($("#aiform"))
    $("#aiform").onsubmit = (e) => {
      e.preventDefault();
      if (!need()) return;
      $("#airesponse").textContent = "Consultando o provedor...";
      run(async () => {
        $("#airesponse").textContent = (
          await api("/ai", "POST", Object.fromEntries(new FormData(e.target)))
        ).text;
      }).then(() => {
        if ($("#airesponse")?.textContent === "Consultando o provedor...")
          $("#airesponse").textContent = "Consulta não concluída.";
      });
    };
}
window.addEventListener("hashchange", render);
run(async () => {
  user = (await api("/session")).user;
  await refresh();
});
