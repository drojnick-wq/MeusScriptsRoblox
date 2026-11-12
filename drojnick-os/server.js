const express = require("express"),
  session = require("express-session"),
  helmet = require("helmet"),
  { rateLimit } = require("express-rate-limit"),
  { DatabaseSync } = require("node:sqlite"),
  { z } = require("zod"),
  bcrypt = require("bcryptjs"),
  PDF = require("pdfkit"),
  crypto = require("crypto"),
  fs = require("fs"),
  path = require("path");
const app = express(),
  port = Number(process.env.PORT || 3000);
fs.mkdirSync(process.env.DATA_DIR || "data", { recursive: true });
const db = new DatabaseSync(
  path.join(process.env.DATA_DIR || "data", "app.sqlite"),
);
db.exec(
  `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,password TEXT); CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,created TEXT NOT NULL); CREATE INDEX IF NOT EXISTS records_owner_kind ON records(owner,kind); CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,data TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS integration_secrets(owner TEXT NOT NULL,provider TEXT NOT NULL,encrypted TEXT NOT NULL,PRIMARY KEY(owner,provider));`,
);
class Store extends session.Store {
  get(id, cb) {
    try {
      let r = db
        .prepare("SELECT data FROM sessions WHERE id=? AND expires>?")
        .get(id, Date.now());
      cb(null, r ? JSON.parse(r.data) : null);
    } catch (e) {
      cb(e);
    }
  }
  set(id, s, cb) {
    try {
      db.prepare("INSERT OR REPLACE INTO sessions VALUES(?,?,?)").run(
        id,
        JSON.stringify(s),
        Date.now() + 86400000,
      );
      cb?.();
    } catch (e) {
      cb?.(e);
    }
  }
  destroy(id, cb) {
    db.prepare("DELETE FROM sessions WHERE id=?").run(id);
    cb?.();
  }
}
const secretPath = path.join(process.env.DATA_DIR || "data", "session-secret");
if (!fs.existsSync(secretPath))
  fs.writeFileSync(secretPath, crypto.randomBytes(48).toString("hex"), {
    mode: 0o600,
  });
// The encryption key is separate from the database; back up both securely.
const integrationKeyPath = path.join(
  process.env.DATA_DIR || "data",
  "integration-key",
);
if (!fs.existsSync(integrationKeyPath)) {
  try {
    fs.writeFileSync(integrationKeyPath, crypto.randomBytes(32), {
      mode: 0o600,
      flag: "wx",
    });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}
if (fs.statSync(integrationKeyPath).mode & 0o077)
  throw new Error(
    "Integration key file must not be accessible by group or others; set permissions to 0600",
  );
const integrationKey = fs.readFileSync(integrationKeyPath);
if (integrationKey.length !== 32)
  throw new Error("Invalid integration encryption key");
function encryptSecret(value, owner) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", integrationKey, iv);
  cipher.setAAD(Buffer.from(`google-places:${owner}`));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    value: encrypted.toString("base64"),
  });
}
function googleKey(owner) {
  const row = db
    .prepare(
      "SELECT encrypted FROM integration_secrets WHERE owner=? AND provider=?",
    )
    .get(owner, "google-places");
  if (!row) return process.env.GOOGLE_PLACES_API_KEY || "";
  try {
    const payload = JSON.parse(row.encrypted);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      integrationKey,
      Buffer.from(payload.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(`google-places:${owner}`));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.value, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw Object.assign(
      new Error(
        "Não foi possível ler a chave desta conta. Reconfigure a integração.",
      ),
      { status: 503 },
    );
  }
}
function hasPersonalGoogleKey(owner) {
  return !!db
    .prepare("SELECT 1 FROM integration_secrets WHERE owner=? AND provider=?")
    .get(owner, "google-places");
}
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "200kb" }));
app.use(
  session({
    store: new Store(),
    secret: process.env.SESSION_SECRET || fs.readFileSync(secretPath, "utf8"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 86400000,
    },
  }),
);
app.use("/api", rateLimit({ windowMs: 60000, limit: 150 }));
app.use("/api", (req, res, next) => {
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers.origin &&
    new URL(req.headers.origin).host !== req.headers.host
  )
    return res.status(403).json({ error: "Origem não autorizada" });
  next();
});
const uid = () => crypto.randomUUID(),
  esc = (s) =>
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
    );
const list = (owner, kind) =>
  db
    .prepare(
      "SELECT * FROM records WHERE owner=? AND kind=? ORDER BY created DESC",
    )
    .all(owner, kind)
    .map((r) => ({ ...JSON.parse(r.data), id: r.id, created: r.created }));
const get = (owner, kind, id) => list(owner, kind).find((r) => r.id === id);
const save = (owner, kind, data, id = uid()) => {
  const created = new Date().toISOString();
  db.prepare(
    "INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
  ).run(id, owner, kind, JSON.stringify(data), created);
  return { ...data, id, created };
};
const audit = (o, text) => save(o, "activities", { text });
const base = (req) =>
  process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
app.get("/api/session", (q, s) => s.json({ user: q.session.user || null }));
const authLimiter = rateLimit({ windowMs: 900000, limit: 30 });
app.post("/api/auth/:action", authLimiter, async (q, s) => {
  try {
    if (!["login", "register"].includes(q.params.action))
      return s.sendStatus(404);
    const b = z
      .object({
        email: z.string().email().max(200),
        password: z.string().min(10).max(128),
        name: z.string().max(80).optional(),
      })
      .parse(q.body);
    let u = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(b.email.toLowerCase());
    if (q.params.action === "register") {
      if (u) return s.status(409).json({ error: "E-mail já cadastrado" });
      u = {
        id: uid(),
        email: b.email.toLowerCase(),
        name: b.name || "DROJNICK",
        password: await bcrypt.hash(b.password, 12),
      };
      db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
        u.id,
        u.email,
        u.name,
        u.password,
      );
    } else if (!u || !(await bcrypt.compare(b.password, u.password)))
      return s.status(401).json({ error: "Credenciais inválidas" });
    q.session.regenerate((err) => {
      if (err) return s.sendStatus(500);
      q.session.user = { id: u.id, name: u.name, email: u.email };
      s.json(q.session.user);
    });
  } catch (e) {
    s.status(400).json({
      error: "Informe e-mail válido e senha com pelo menos 10 caracteres.",
    });
  }
});
app.post("/api/logout", (q, s) =>
  q.session.destroy(() => s.json({ ok: true })),
);
app.use("/api", (q, s, n) =>
  q.session.user
    ? n()
    : s.status(401).json({ error: "Entre na sua conta para continuar." }),
);
app.get("/api/state", (q, s) => {
  const o = q.session.user.id;
  s.json(
    Object.fromEntries(
      ["leads", "projects", "proposals", "sales", "tasks", "activities"].map(
        (k) => [k, list(o, k)],
      ),
    ),
  );
});
app.get("/api/integrations", (q, s) => {
  const personal = hasPersonalGoogleKey(q.session.user.id);
  s.set("Cache-Control", "no-store").json({
    places: personal || !!process.env.GOOGLE_PLACES_API_KEY,
    placesSource: personal
      ? "account"
      : process.env.GOOGLE_PLACES_API_KEY
        ? "server"
        : null,
    ai: !!process.env.OPENAI_API_KEY,
    payments: false,
    publicBase: process.env.PUBLIC_BASE_URL || null,
  });
});
const integrationLimiter = rateLimit({ windowMs: 60000, limit: 10 });
app.put("/api/integrations/google-places", integrationLimiter, (q, s) => {
  const { key } = z
    .object({
      key: z
        .string()
        .trim()
        .min(1)
        .max(512)
        .regex(/^[\x21-\x7e]+$/),
    })
    .parse(q.body);
  db.prepare(
    "INSERT INTO integration_secrets(owner,provider,encrypted) VALUES(?,?,?) ON CONFLICT(owner,provider) DO UPDATE SET encrypted=excluded.encrypted",
  ).run(
    q.session.user.id,
    "google-places",
    encryptSecret(key, q.session.user.id),
  );
  audit(q.session.user.id, "Chave do Google Places configurada para a conta.");
  s.set("Cache-Control", "no-store").json({ ok: true });
});
app.delete("/api/integrations/google-places", integrationLimiter, (q, s) => {
  db.prepare(
    "DELETE FROM integration_secrets WHERE owner=? AND provider=?",
  ).run(q.session.user.id, "google-places");
  audit(q.session.user.id, "Chave do Google Places removida da conta.");
  s.set("Cache-Control", "no-store").json({
    ok: true,
    serverKeyAvailable: !!process.env.GOOGLE_PLACES_API_KEY,
  });
});
app.post("/api/search", async (q, s) => {
  try {
    const b = z
      .object({
        category: z.string().min(2).max(80),
        city: z.string().min(2).max(120),
        demo: z.boolean().optional(),
        pageToken: z.string().max(2000).optional(),
      })
      .parse(q.body);
    if (b.demo)
      return s.json({
        businesses: [
          {
            providerId: "demo-restaurante",
            name: "Restaurante Exemplo • Demonstração",
            category: b.category,
            address: `${b.city} — endereço demonstrativo`,
            phone: "",
            website: "",
            source: "Dados sintéticos para teste",
            demo: true,
            queriedAt: new Date().toISOString(),
          },
        ],
      });
    const placesKey = googleKey(q.session.user.id);
    if (!placesKey)
      return s.status(503).json({
        error:
          "Google Places não configurado. Configure a chave em Configurações ou use o modo demonstração.",
      });
    const r = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": placesKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,nextPageToken",
        },
        body: JSON.stringify({
          textQuery: `${b.category} em ${b.city}`,
          languageCode: "pt-BR",
          pageSize: 20,
          ...(b.pageToken ? { pageToken: b.pageToken } : {}),
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok)
      throw Error(
        "O fornecedor recusou a consulta. Verifique a chave, permissões e faturamento.",
      );
    const d = await r.json();
    s.json({
      businesses: (d.places || []).map((p) => ({
        providerId: p.id,
        name: p.displayName?.text,
        address: p.formattedAddress,
        phone: p.nationalPhoneNumber || "",
        website: p.websiteUri || "",
        maps: p.googleMapsUri,
        rating: p.rating,
        reviews: p.userRatingCount,
        category: b.category,
        source: "Google Places",
        queriedAt: new Date().toISOString(),
      })),
      nextPageToken: d.nextPageToken,
    });
  } catch (e) {
    s.status(e.status || (e instanceof z.ZodError ? 400 : 502)).json({
      error:
        e instanceof z.ZodError
          ? "Dados inválidos. Revise a busca."
          : e.status
            ? e.message
            : "Não foi possível consultar o Google Places. Verifique a chave, permissões, faturamento e conexão.",
    });
  }
});
const leadSchema = z.object({
  name: z.string().min(2).max(180),
  category: z.string().max(100).default("Serviços"),
  address: z.string().max(500).default(""),
  phone: z.string().max(30).default(""),
  website: z.string().max(500).default(""),
  source: z.string().max(200).default("Cadastro manual"),
  providerId: z.string().max(200).optional(),
  demo: z.boolean().optional(),
  rating: z.number().optional(),
  reviews: z.number().optional(),
  queriedAt: z.string().optional(),
  maps: z.string().optional(),
});
app.post("/api/leads", (q, s) => {
  const d = leadSchema.parse(q.body),
    o = q.session.user.id;
  const old = list(o, "leads").find(
    (l) => d.providerId && l.providerId === d.providerId,
  );
  if (old) return s.json(old);
  s.json(save(o, "leads", { ...d, status: "Novo" }));
  audit(o, `Lead salvo: ${d.name}`);
});
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
app.patch("/api/leads/:id", (q, s) => {
  const o = q.session.user.id,
    l = get(o, "leads", q.params.id);
  if (!l) return s.sendStatus(404);
  const b = z
    .object({
      status: z.enum(stages).optional(),
      notes: z.string().max(5000).optional(),
      phone: z.string().max(30).optional(),
    })
    .parse(q.body);
  s.json(save(o, "leads", { ...l, ...b }, l.id));
  audit(o, `Lead atualizado: ${l.name} — ${b.status || "anotações"}`);
});
app.post("/api/leads/:id/analyze", (q, s) => {
  const o = q.session.user.id,
    l = get(o, "leads", q.params.id);
  if (!l) return s.sendStatus(404);
  const score =
    (!l.website ? 60 : 10) + (l.reviews >= 20 ? 25 : 0) + (l.phone ? 15 : 0);
  const analysis = {
    score,
    facts: [
      `Fonte: ${l.source}`,
      `Website informado: ${l.website || "não identificado na fonte"}`,
      `Avaliações: ${l.reviews ?? "indisponível"}`,
    ],
    inferences: [
      !l.website
        ? "Um site com apresentação, localização e contato pode ampliar a presença digital."
        : "Uma revisão do site existente pode identificar melhorias.",
    ],
    missing: [
      "Qualidade mobile não verificada",
      "Cardápio e preços não fornecidos",
      "Capacidade financeira não avaliada",
    ],
    potential: l.reviews >= 20 ? "Potencial moderado" : "Dados insuficientes",
    criteria:
      "Sem website: 60; com website: 10; 20+ avaliações: 25; telefone: 15.",
    at: new Date().toISOString(),
  };
  s.json(save(o, "leads", { ...l, analysis, status: "Analisado" }, l.id));
});
app.post("/api/projects", (q, s) => {
  const o = q.session.user.id,
    l = get(o, "leads", q.body.leadId);
  if (!l) return s.status(404).json({ error: "Selecione um lead" });
  const old = list(o, "projects").find((p) => p.leadId === l.id);
  if (old) return s.json(old);
  const p = save(o, "projects", {
    leadId: l.id,
    name: l.name,
    title: l.name,
    description:
      "Conheça nosso estabelecimento. Edite esta apresentação antes de compartilhar.",
    address: l.address,
    phone: l.phone,
    color:
      { Essencial: "#7c3aed", Bistrô: "#94633b", Studio: "#27716d" }[
        q.body.template
      ] || "#7c3aed",
    template: q.body.template || "Essencial",
    products: [],
    published: true,
    official: false,
    demo: l.demo || false,
    versions: [],
  });
  save(o, "leads", { ...l, status: "Demonstração pronta" }, l.id);
  audit(o, `Demonstração criada: ${l.name}`);
  s.json(p);
});
const projectSchema = z.object({
  title: z.string().min(1).max(180),
  description: z.string().max(5000),
  address: z.string().max(500),
  phone: z.string().max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  products: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        price: z.number().min(0).max(100000),
      }),
    )
    .max(100),
  published: z.boolean(),
  official: z.boolean(),
});
app.put("/api/projects/:id", (q, s) => {
  const o = q.session.user.id,
    p = get(o, "projects", q.params.id);
  if (!p) return s.sendStatus(404);
  const d = projectSchema.parse(q.body);
  s.json(
    save(
      o,
      "projects",
      {
        ...p,
        ...d,
        versions: [
          ...p.versions,
          { ...p, versions: undefined, at: new Date().toISOString() },
        ].slice(-20),
      },
      p.id,
    ),
  );
  audit(o, `Projeto salvo: ${p.name}`);
});
app.post("/api/proposals", (q, s) => {
  const o = q.session.user.id,
    p = get(o, "projects", q.body.projectId);
  if (!p) return s.sendStatus(404);
  const amount = z.coerce
    .number()
    .positive()
    .max(1000000)
    .parse(q.body.amount ?? 500);
  const proposal = save(o, "proposals", {
    projectId: p.id,
    leadId: p.leadId,
    name: p.title,
    amount,
    scope:
      "Site responsivo, apresentação, localização, contato e cardápio com produtos fornecidos pelo cliente.",
    terms:
      "Prazo: 7 dias úteis após recebimento do conteúdo. Inclui 2 revisões. Domínio, hospedagem e serviços de terceiros não inclusos. Validade: 15 dias.",
    accepted: false,
  });
  const l = get(o, "leads", p.leadId);
  save(o, "leads", { ...l, status: "Proposta preparada" }, l.id);
  audit(o, `Proposta criada: ${p.title}`);
  s.json(proposal);
});
const phone = (n) => {
  let d = n.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (!/^55[1-9]\d{9,10}$/.test(d))
    throw Object.assign(
      new Error("Cadastre um telefone brasileiro válido com DDD."),
      { status: 400 },
    );
  return d;
};
app.post("/api/proposals/:id/contact", (q, s) => {
  const o = q.session.user.id,
    p = get(o, "proposals", q.params.id);
  if (!p) return s.sendStatus(404);
  const l = get(o, "leads", p.leadId),
    n = phone(l.phone);
  const message = `Olá! Sou DROJNICK e trabalho com criação de sites. Preparei uma demonstração para ${p.name}: ${base(q)}/preview/${p.projectId}\n\nO investimento proposto é de R$ ${p.amount.toFixed(2)}. Confira as condições: ${base(q)}/proposal/${p.id}\n\nPosso explicar como funcionaria?`;
  audit(o, `Mensagem preparada para ${p.name}; envio ainda não confirmado.`);
  s.json({
    message,
    url: `https://wa.me/${n}?text=${encodeURIComponent(message)}`,
  });
});
app.post("/api/proposals/:id/confirm-contact", (q, s) => {
  const o = q.session.user.id,
    p = get(o, "proposals", q.params.id);
  if (!p) return s.sendStatus(404);
  const l = get(o, "leads", p.leadId);
  save(o, "leads", { ...l, status: "Contatado" }, l.id);
  audit(
    o,
    `Envio declarado manualmente pelo usuário: ${p.name}. Recebimento e leitura não verificados.`,
  );
  s.json({ ok: true });
});
app.post("/api/sales", (q, s) => {
  const o = q.session.user.id,
    b = z.object({ proposalId: z.string(), paid: z.boolean() }).parse(q.body),
    p = get(o, "proposals", b.proposalId);
  if (!p) return s.sendStatus(404);
  if (list(o, "sales").some((x) => x.proposalId === p.id))
    return s.status(409).json({ error: "Venda já registrada" });
  s.json(
    save(o, "sales", {
      proposalId: p.id,
      name: p.name,
      amount: p.amount,
      paid: b.paid,
      confirmation: b.paid ? "Confirmação manual do usuário" : "Pendente",
    }),
  );
  const l = get(o, "leads", p.leadId);
  save(o, "leads", { ...l, status: "Fechado" }, l.id);
  save(o, "tasks", {
    title: `Entregar ${p.name}: revisar conteúdo, domínio e publicação`,
    done: false,
  });
  audit(o, `Venda registrada manualmente: ${p.name}`);
});
app.post("/api/tasks", (q, s) =>
  s.json(
    save(q.session.user.id, "tasks", {
      title: z.string().min(2).max(300).parse(q.body.title),
      done: false,
    }),
  ),
);
app.patch("/api/tasks/:id", (q, s) => {
  const o = q.session.user.id,
    t = get(o, "tasks", q.params.id);
  if (!t) return s.sendStatus(404);
  s.json(
    save(o, "tasks", { ...t, done: z.boolean().parse(q.body.done) }, t.id),
  );
});
app.post("/api/ai", async (q, s) => {
  if (!process.env.OPENAI_API_KEY)
    return s.status(503).json({
      error:
        "IA externa não configurada. Defina OPENAI_API_KEY no servidor. O gerador por templates continua disponível.",
    });
  try {
    const prompt = z.string().min(1).max(5000).parse(q.body.prompt);
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Você é DROJNICK AI. Responda em português. Não invente fatos sobre empresas. Diferencie sugestões de fatos.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 1000,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw Error("Falha no provedor de IA");
    s.json({ text: (await r.json()).choices[0].message.content });
  } catch (e) {
    s.status(502).json({ error: e.message });
  }
});
const publicRecord = (kind, id) => {
  const r = db
    .prepare("SELECT * FROM records WHERE kind=? AND id=?")
    .get(kind, id);
  return r ? { ...JSON.parse(r.data), id: r.id, owner: r.owner } : null;
};
const shell = (title, body, color = "#7c3aed") =>
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:17px system-ui;background:#faf9f7;color:#24212b;margin:0}main{max-width:980px;margin:auto;padding:60px 24px}h1{font-size:clamp(36px,6vw,72px);line-height:1.05}h2{margin-top:50px}a,button{color:white;background:${color};border:0;border-radius:10px;padding:14px 22px;text-decoration:none;display:inline-block;cursor:pointer}header{background:#181321;color:white;padding:16px;text-align:center;font-size:13px}article{padding:24px;border:1px solid #ddd;border-radius:16px;margin:14px 0}footer{padding:40px;text-align:center;color:#777}input{padding:10px;width:60px}nav{display:flex;gap:20px}nav a{background:transparent;color:#555;padding:0}@media print{button,.no-print{display:none}}</style>${body}<footer>Criado por DROJNICK</footer></html>`;
app.get("/preview/:id", (q, s) => {
  const p = publicRecord("projects", q.params.id);
  if (!p || !p.published) return s.status(404).send("Site indisponível");
  s.send(
    shell(
      p.title,
      `${!p.official ? "<header>DEMONSTRAÇÃO COMERCIAL • Este projeto não representa o site oficial do estabelecimento.</header>" : ""}<main><nav><a href="#sobre">Sobre</a><a href="#cardapio">Cardápio</a><a href="#contato">Contato</a></nav><h1>${esc(p.title)}</h1><p id="sobre">${esc(p.description)}</p><a href="#cardapio">Conhecer o cardápio ↓</a><h2 id="cardapio">Cardápio</h2>${p.products.length ? p.products.map((x, i) => `<article><strong>${esc(x.name)}</strong><p>R$ ${x.price.toFixed(2)}</p><label>Quantidade <input type="number" min="0" max="99" value="0" data-index="${i}"></label></article>`).join("") : "<p>Produtos e preços ainda não fornecidos.</p>"}<div id="total"></div><button id="order">Preparar pedido no WhatsApp</button><p id="notice"></p><h2 id="contato">Visite e fale conosco</h2><p>${esc(p.address || "Endereço a confirmar")}</p><p>${esc(p.phone || "Contato a confirmar")}</p></main><script src="/site.js" data-project="${p.id}"></script>`,
      p.color,
    ),
  );
});
app.get("/public/project/:id", (q, s) => {
  const p = publicRecord("projects", q.params.id);
  if (!p?.published) return s.sendStatus(404);
  s.json({ title: p.title, phone: p.phone, products: p.products });
});
app.get("/proposal/:id", (q, s) => {
  const p = publicRecord("proposals", q.params.id);
  if (!p) return s.sendStatus(404);
  s.send(
    shell(
      "Proposta • " + p.name,
      `<header>DROJNICK OS • PROPOSTA COMERCIAL</header><main><p>Uma nova presença digital para</p><h1>${esc(p.name)}</h1><h2>Investimento: R$ ${p.amount.toFixed(2)}</h2><p>${esc(p.scope)}</p><h2>Condições</h2><p>${esc(p.terms)}</p><a href="/preview/${p.projectId}">Ver demonstração</a> <a href="/proposal/${p.id}/pdf">Baixar PDF</a><p>O aceite e a contratação devem ser confirmados diretamente com DROJNICK.</p></main>`,
    ),
  );
});
app.get("/proposal/:id/pdf", (q, s) => {
  const p = publicRecord("proposals", q.params.id);
  if (!p) return s.sendStatus(404);
  s.setHeader("Content-Type", "application/pdf");
  s.setHeader(
    "Content-Disposition",
    'inline; filename="proposta-drojnick.pdf"',
  );
  const doc = new PDF({ margin: 60 });
  doc.pipe(s);
  doc
    .fontSize(14)
    .text("DROJNICK OS | PROPOSTA COMERCIAL")
    .moveDown(2)
    .fontSize(28)
    .text(p.name)
    .moveDown()
    .fontSize(22)
    .text(`Investimento: R$ ${p.amount.toFixed(2)}`)
    .moveDown()
    .fontSize(12)
    .text(p.scope)
    .moveDown()
    .text(p.terms)
    .moveDown()
    .text(`Demonstracao: ${base(q)}/preview/${p.projectId}`)
    .moveDown(3)
    .text("Criado por DROJNICK");
  doc.end();
});
app.use(express.static("public"));
app.get("/", (q, s) => s.sendFile(path.resolve("public/index.html")));
app.use((e, q, s, n) => {
  console.error(e.name);
  s.status(e instanceof z.ZodError ? 400 : e.status || 500).json({
    error:
      e instanceof z.ZodError
        ? "Dados inválidos. Revise os campos."
        : e.message || "Erro interno",
  });
});
app.listen(port, "0.0.0.0", () =>
  console.log(`DROJNICK OS http://0.0.0.0:${port}`),
);
