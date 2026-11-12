const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function searchContext(api) {
  const element = { innerHTML: '', get textContent() { return this.innerHTML; } };
  const context = vm.createContext({
    api, need: () => true, $: () => element,
    empty: (title) => title, toast: () => {},
    results: [], pageToken: '', resultCards: () => 'Consultando Restaurante',
  });
  vm.runInContext(source.slice(source.indexOf('let searchArgs;'), source.indexOf('function searchMore()')), context);
  return { context, element };
}
test('successful search preserves business names containing Consultando', async () => {
  const { context, element } = searchContext(async () => ({ businesses: [{ name: 'Consultando Restaurante' }], nextPageToken: 'next' }));
  await context.doSearch({});
  assert.equal(element.innerHTML, 'Consultando Restaurante');
  assert.equal(context.pageToken, 'next');
});
test('current search failure renders error; superseded failures preserve current results', async () => {
  const old = deferred();
  let calls = 0;
  const { context, element } = searchContext(() => ++calls === 1 ? old.promise : Promise.resolve({ businesses: [], nextPageToken: 'current' }));
  const pending = context.doSearch({});
  await context.doSearch({});
  old.reject(Error('old error'));
  await pending;
  assert.equal(element.innerHTML, 'Consultando Restaurante');
  context.api = async () => { throw Error('current error'); };
  await context.doSearch({});
  assert.equal(element.innerHTML, 'Não foi possível concluir a pesquisa');
});
function placesContext() {
  const request = deferred(), input = { value: 'synthetic-key' }, form = { elements: { key: input } };
  const elements = { '#placesform': form, '#modal': { hidden: false } };
  let closes = 0, refreshes = 0, pending;
  const context = vm.createContext({
    need: () => true, modal: () => {}, integrations: {},
    $: (selector) => elements[selector], api: () => request.promise,
    run: (fn) => { pending = fn(); }, closeModal: () => { closes++; },
    refresh: async () => { refreshes++; }, toast: () => {}, location: { hash: '#settings' },
  });
  vm.runInContext(source.slice(source.indexOf('function configurePlaces()'), source.indexOf('function removePlaces()')), context);
  context.configurePlaces();
  const submit = () => { form.onsubmit({ preventDefault() {}, currentTarget: form }); return pending; };
  return { request, input, form, elements, submit, counts: () => ({ closes, refreshes }) };
}
test('key save clears submitted field and closes its own dialog', async () => {
  const c = placesContext();
  const pending = c.submit();
  c.request.resolve({});
  await pending;
  assert.equal(c.input.value, '');
  assert.deepEqual(c.counts(), { closes: 1, refreshes: 1 });
});
test('late key save cannot clear or close a replacement dialog', async () => {
  const c = placesContext(), replacement = { elements: { key: { value: 'new-value' } } };
  const pending = c.submit();
  c.elements['#placesform'] = replacement;
  c.request.resolve({});
  await pending;
  assert.equal(c.input.value, '');
  assert.equal(replacement.elements.key.value, 'new-value');
  assert.deepEqual(c.counts(), { closes: 0, refreshes: 1 });
});
test('failed key save retains submitted value and leaves dialog open', async () => {
  const c = placesContext();
  const pending = c.submit();
  c.request.reject(Error('save failed'));
  await assert.rejects(pending, /save failed/);
  assert.equal(c.input.value, 'synthetic-key');
  assert.deepEqual(c.counts(), { closes: 0, refreshes: 0 });
});
