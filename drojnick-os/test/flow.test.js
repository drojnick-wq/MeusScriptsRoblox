const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  { spawn } = require("node:child_process"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drojnick-test-")),
  base = "http://127.0.0.1:3199";
let child,
  cookie = "",
  cookie2 = "",
  lead,
  project,
  proposal;
async function req(route, method = "GET", body, c = cookie) {
  const r = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json", Cookie: c },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, headers: r.headers, body: await r.text() };
}
async function startServer() {
  child = spawn(
    process.execPath,
    ["--require", path.join(__dirname, "google-stub.cjs"), "server.js"],
    {
      env: {
        ...process.env,
        PORT: "3199",
        PLACES_DAILY_LIMIT: "100",
        PLACES_ACCOUNT_DAILY_LIMIT: "20",
        DATA_DIR: dir,
        GOOGLE_PLACES_API_KEY: "",
        OPENAI_API_KEY: "",
      },
      stdio: "pipe",
    },
  );
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("error", reject);
    setTimeout(() => reject(Error("startup timeout")), 5000).unref();
  });
}
before(startServer);
after(() => {
  child.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("complete persistent flow and account isolation", async (t) => {
  await t.test("unauthenticated state rejected", async () =>
    assert.equal((await req("/api/state")).status, 401),
  );
  await t.test("register account and authenticated session", async () => {
    const r = await req("/api/auth/register", "POST", {
      name: "Teste",
      email: "test@example.invalid",
      password: "test-password-123",
    });
    assert.equal(r.status, 200);
    cookie = r.headers.get("set-cookie").split(";")[0];
    assert.ok(JSON.parse((await req("/api/session")).body).user);
  });
  await t.test(
    "missing integration reports limitation; demo is labeled",
    async () => {
      assert.equal(
        (
          await req("/api/search", "POST", {
            category: "Restaurante",
            city: "Rio",
          })
        ).status,
        503,
      );
      const r = await req("/api/search", "POST", {
        category: "Restaurante",
        city: "Rio",
        demo: true,
      });
      const b = JSON.parse(r.body).businesses[0];
      assert.equal(b.demo, true);
      lead = JSON.parse((await req("/api/leads", "POST", b)).body);
      const again = JSON.parse((await req("/api/leads", "POST", b)).body);
      assert.equal(lead.id, again.id);
    },
  );
  await t.test(
    "analysis distinguishes observations and missing data",
    async () => {
      const r = await req(`/api/leads/${lead.id}/analyze`, "POST");
      assert.equal(r.status, 200);
      assert.ok(JSON.parse(r.body).analysis.missing.length);
    },
  );
  await t.test(
    "generate and edit public website; persistence and XSS escaping",
    async () => {
      project = JSON.parse(
        (await req("/api/projects", "POST", { leadId: lead.id })).body,
      );
      assert.equal((await req("/preview/" + project.id)).status, 200);
      project = {
        ...project,
        title: "Restaurante <script>alert(1)</script>",
        description: "Texto revisado",
        products: [{ name: "Produto de teste", price: 12.5 }],
        phone: "21999999999",
      };
      assert.equal(
        (await req("/api/projects/" + project.id, "PUT", project)).status,
        200,
      );
      const saved = JSON.parse((await req("/api/state")).body).projects[0];
      assert.equal(saved.description, "Texto revisado");
      const html = (await req("/preview/" + project.id)).body;
      assert.ok(html.includes("&lt;script&gt;"));
      assert.ok(!html.includes("<script>alert"));
    },
  );
  await t.test("create R$500 proposal and real PDF bytes", async () => {
    proposal = JSON.parse(
      (
        await req("/api/proposals", "POST", {
          projectId: project.id,
          amount: 500,
        })
      ).body,
    );
    assert.equal(proposal.amount, 500);
    const r = await req("/proposal/" + proposal.id + "/pdf");
    assert.equal(r.status, 200);
    assert.ok(r.body.startsWith("%PDF"));
  });
  await t.test(
    "invalid contact rejected; preparing WhatsApp does not confirm sending",
    async () => {
      assert.equal(
        (await req(`/api/proposals/${proposal.id}/contact`, "POST")).status,
        400,
      );
      await req("/api/leads/" + lead.id, "PATCH", { phone: "21999999999" });
      const r = await req(`/api/proposals/${proposal.id}/contact`, "POST");
      assert.match(
        JSON.parse(r.body).url,
        /^https:\/\/wa.me\/5521999999999\?text=/,
      );
      assert.notEqual(
        JSON.parse((await req("/api/state")).body).leads[0].status,
        "Contatado",
      );
      await req(`/api/proposals/${proposal.id}/confirm-contact`, "POST");
      assert.equal(
        JSON.parse((await req("/api/state")).body).leads[0].status,
        "Contatado",
      );
    },
  );
  await t.test(
    "CRM negotiation, manual sale, duplicate protection and finances",
    async () => {
      await req("/api/leads/" + lead.id, "PATCH", { status: "Negociando" });
      assert.equal(
        (
          await req("/api/sales", "POST", {
            proposalId: proposal.id,
            paid: true,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await req("/api/sales", "POST", {
            proposalId: proposal.id,
            paid: true,
          })
        ).status,
        409,
      );
      const s = JSON.parse((await req("/api/state")).body);
      assert.equal(s.sales[0].amount, 500);
      assert.equal(s.sales[0].paid, true);
      assert.equal(s.tasks.length, 1);
    },
  );
  await t.test("publish official and unpublish", async () => {
    await req("/api/projects/" + project.id, "PUT", {
      ...project,
      official: true,
    });
    assert.ok(
      !(await req("/preview/" + project.id)).body.includes(
        "DEMONSTRAÇÃO COMERCIAL",
      ),
    );
    await req("/api/projects/" + project.id, "PUT", {
      ...project,
      published: false,
    });
    assert.equal((await req("/preview/" + project.id)).status, 404);
  });
  await t.test(
    "second account cannot read or mutate first account records",
    async () => {
      const r = await req(
        "/api/auth/register",
        "POST",
        { email: "other@example.invalid", password: "test-password-456" },
        "",
      );
      cookie2 = r.headers.get("set-cookie").split(";")[0];
      assert.equal(
        JSON.parse((await req("/api/state", "GET", null, cookie2)).body).leads
          .length,
        0,
      );
      assert.equal(
        (
          await req(
            "/api/leads/" + lead.id,
            "PATCH",
            { status: "Perdido" },
            cookie2,
          )
        ).status,
        404,
      );
      assert.equal(
        (await req("/api/projects/" + project.id, "PUT", project, cookie2))
          .status,
        404,
      );
      assert.equal(
        (
          await req(
            "/api/proposals",
            "POST",
            { projectId: project.id },
            cookie2,
          )
        ).status,
        404,
      );
    },
  );
  await t.test(
    "Google Places credentials are encrypted, isolated, used and removable",
    async () => {
      const key = "synthetic-account-key";
      const put = await req("/api/integrations/google-places", "PUT", { key });
      assert.equal(put.status, 200);
      assert.equal(put.headers.get("cache-control"), "no-store");
      assert.ok(!put.body.includes(key));
      const status = await req("/api/integrations");
      assert.deepEqual(JSON.parse(status.body).placesSource, "account");
      assert.ok(!status.body.includes(key));
      assert.equal(
        JSON.parse((await req("/api/integrations", "GET", null, cookie2)).body)
          .places,
        false,
      );
      assert.equal(
        (
          await req(
            "/api/search",
            "POST",
            { category: "Restaurante", city: "Rio" },
            cookie2,
          )
        ).status,
        503,
      );
      const stopped = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await stopped;
      await startServer();
      assert.equal(
        JSON.parse((await req("/api/integrations")).body).placesSource,
        "account",
      );
      const r = await req("/api/search", "POST", {
        category: "Restaurante",
        city: "Rio",
      });
      assert.equal(r.status, 200);
      assert.equal(
        JSON.parse(r.body).businesses[0].providerId,
        "test-only-place",
      );
      assert.equal(JSON.parse(r.body).nextPageToken, "test-next-page");
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(path.join(dir, "app.sqlite"));
      const stored = db
        .prepare("SELECT encrypted FROM integration_secrets")
        .get();
      assert.ok(stored && !stored.encrypted.includes(key));
      db.close();
      assert.equal(
        fs.statSync(path.join(dir, "integration-key")).mode & 0o777,
        0o600,
      );
      const stoppedForPermissions = new Promise((resolve) =>
        child.once("exit", resolve),
      );
      child.kill();
      await stoppedForPermissions;
      const keyPath = path.join(dir, "integration-key");
      fs.chmodSync(keyPath, 0o644);
      const insecure = spawn(process.execPath, ["server.js"], {
        env: { ...process.env, PORT: "3199", DATA_DIR: dir },
        stdio: "pipe",
      });
      let errorOutput = "";
      insecure.stderr.on("data", (data) => {
        errorOutput += data;
      });
      const exitCode = await new Promise((resolve) =>
        insecure.once("close", resolve),
      );
      assert.notEqual(exitCode, 0);
      assert.match(errorOutput, /Integration key file must not be accessible/);
      fs.chmodSync(keyPath, 0o600);
      await startServer();
      assert.equal(
        JSON.parse((await req("/api/integrations")).body).placesSource,
        "account",
      );
      assert.equal(
        (
          await req("/api/integrations/google-places", "PUT", {
            key: "invalid key with spaces",
          })
        ).status,
        400,
      );
      assert.equal(
        (await req("/api/integrations/google-places", "DELETE", null, cookie2))
          .status,
        200,
      );
      assert.equal(
        JSON.parse((await req("/api/integrations")).body).places,
        true,
      );
      assert.equal(
        (
          await req("/api/integrations/google-places", "PUT", {
            key: "rejected-key",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await req("/api/search", "POST", {
            category: "Restaurante",
            city: "Rio",
          })
        ).status,
        502,
      );
      assert.equal(
        (await req("/api/integrations/google-places", "DELETE")).status,
        200,
      );
      assert.equal(
        JSON.parse((await req("/api/integrations")).body).places,
        false,
      );
      assert.equal(
        (
          await req("/api/search", "POST", {
            category: "Restaurante",
            city: "Rio",
          })
        ).status,
        503,
      );
    },
  );
  await t.test(
    "receipt ownership, no-store, Places storage and quota",
    async () => {
      assert.equal(
        (await req("/api/state")).headers.get("cache-control"),
        "no-store",
      );
      const sale = JSON.parse((await req("/api/state")).body).sales[0];
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(path.join(dir, "app.sqlite"));
      const row = db
        .prepare("SELECT data FROM records WHERE id=?")
        .get(sale.id);
      db.prepare("UPDATE records SET data=? WHERE id=?").run(
        JSON.stringify({ ...JSON.parse(row.data), paid: false }),
        sale.id,
      );
      assert.equal(
        (await req("/api/sales/" + sale.id + "/receipt", "POST", null, cookie2))
          .status,
        404,
      );
      assert.equal(
        (await req("/api/sales/" + sale.id + "/receipt", "POST")).status,
        200,
      );
      assert.equal(
        JSON.parse((await req("/api/state")).body).sales[0].paid,
        true,
      );
      assert.equal(
        (
          await req("/api/leads", "POST", {
            name: "Google name",
            source: "Google Places",
            providerId: "storage-test",
          })
        ).status,
        422,
      );
      const leadResult = JSON.parse(
        (
          await req("/api/leads", "POST", {
            name: "Verified business",
            source: "Cadastro manual",
            providerId: "storage-test",
            phone: "21999999999",
          })
        ).body,
      );
      assert.equal(leadResult.name, "Verified business");
      const otherProject = JSON.parse(
        (await req("/api/projects", "POST", { leadId: leadResult.id })).body,
      );
      const otherProposal = JSON.parse(
        (await req("/api/proposals", "POST", { projectId: otherProject.id }))
          .body,
      );
      db.exec(
        `CREATE TRIGGER fail_task BEFORE INSERT ON records WHEN NEW.kind='tasks' BEGIN SELECT RAISE(ABORT,'test failure'); END;`,
      );
      assert.equal(
        (
          await req("/api/sales", "POST", {
            proposalId: otherProposal.id,
            paid: false,
          })
        ).status,
        500,
      );
      assert.ok(
        !JSON.parse((await req("/api/state")).body).sales.some(
          (x) => x.proposalId === otherProposal.id,
        ),
      );
      db.exec("DROP TRIGGER fail_task");
      await req("/api/integrations/google-places", "PUT", {
        key: "synthetic-account-key",
      });
      db.prepare("INSERT OR REPLACE INTO places_usage VALUES(?,100)").run(
        new Date().toISOString().slice(0, 10),
      );
      assert.equal(
        (
          await req("/api/search", "POST", {
            category: "Restaurante",
            city: "Rio",
          })
        ).status,
        429,
      );
      assert.equal(
        (
          await req(
            "/api/search",
            "POST",
            { category: "Restaurante", city: "Rio" },
            cookie2,
          )
        ).status,
        503,
      );
      db.close();
    },
  );
  await t.test("login and logout are real", async () => {
    assert.equal(
      (
        await req(
          "/api/auth/login",
          "POST",
          { email: "test@example.invalid", password: "wrong-password-123" },
          "",
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await req(
          "/api/auth/login",
          "POST",
          { email: "test@example.invalid", password: "test-password-123" },
          "",
        )
      ).status,
      200,
    );
    await req("/api/logout", "POST");
    assert.equal((await req("/api/state")).status, 401);
  });
});
