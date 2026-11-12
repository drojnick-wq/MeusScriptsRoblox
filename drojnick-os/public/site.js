(async () => {
  const id = document.currentScript.dataset.project,
    p = await (await fetch("/public/project/" + id)).json();
  let selections = [];
  function calc() {
    selections = [...document.querySelectorAll("input")].map((e, i) => ({
      name: p.products[i].name,
      price: p.products[i].price,
      qty: Math.min(99, Math.max(0, Number(e.value) || 0)),
    }));
    document.querySelector("#total").textContent =
      "Subtotal: R$ " +
      selections.reduce((a, x) => a + x.qty * x.price, 0).toFixed(2);
  }
  document.querySelectorAll("input").forEach((e) => (e.oninput = calc));
  calc();
  document.querySelector("#order").onclick = () => {
    let phone = p.phone.replace(/\D/g, "");
    if (phone.length === 10 || phone.length === 11) phone = "55" + phone;
    const items = selections.filter((x) => x.qty);
    if (!/^55[1-9]\d{9,10}$/.test(phone) || !items.length) {
      document.querySelector("#notice").textContent =
        "Selecione produtos e confirme se o telefone do estabelecimento foi cadastrado.";
      return;
    }
    const text =
      "Olá! Gostaria de solicitar:\n" +
      items
        .map((x) => `${x.qty}x ${x.name} — R$ ${(x.qty * x.price).toFixed(2)}`)
        .join("\n") +
      "\nSubtotal: R$ " +
      items.reduce((a, x) => a + x.qty * x.price, 0).toFixed(2) +
      "\nFavor confirmar disponibilidade, retirada/entrega e valor final.";
    window.open(
      "https://wa.me/" + phone + "?text=" + encodeURIComponent(text),
      "_blank",
      "noopener",
    );
    document.querySelector("#notice").textContent =
      "Pedido preparado. Envie no WhatsApp e aguarde a confirmação do estabelecimento.";
  };
})();
