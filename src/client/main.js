import {Children, createElement, isValidElement, cloneElement} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {initialData, save, openOrders, lowStock, orderCost} from '../domain/inventory.js';
import {configured, hasSession, signIn, signOut, cloudInventory, writeCloudInventory} from './supabase/client.js';

const root = createRoot(document.querySelector('#root'));
const money = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});
const pages = {
  Painel: ['◫', 'Visão geral da operação', 'order'],
  Equipamentos: ['◇', 'Cadastro e situação dos equipamentos', 'equipment'],
  'Peças e estoque': ['▤', 'Saldos e movimentações das peças', 'part'],
  Compras: ['＋', 'Entradas de peças e custos de aquisição', 'purchase'],
  Manutenções: ['⚙', 'Ordens, responsáveis e peças utilizadas', 'order']
};
const labels = {
  equipment: 'Cadastrar equipamento', part: 'Cadastrar peça', purchase: 'Registrar compra',
  order: 'Abrir manutenção', consume: 'Adicionar peças', finish: 'Concluir manutenção'
};
const get = (list, id) => list.find(item => item.id === id);
const date = value => value.split('-').reverse().join('/');
const postgres = import.meta.env.MODE === 'postgres';
const storageKey = 'machine-airsoft-react-demo';
let data;
let page = 'Painel';
let dialog;

function element(tag, attributes = {}, ...children) {
  const props = {};
  for (const [key, value] of Object.entries(attributes)) {
    const name = {
      class: 'className', maxlength: 'maxLength', autocomplete: 'autoComplete',
      click: 'onClick', submit: 'onSubmit'
    }[key] ?? key;
    props[name] = key === 'required' ? true : value;
  }
  const keyedChildren = children.flat(Infinity).map((child, index) =>
    isValidElement(child) ? cloneElement(child, {key: child.key ?? index}) : child
  );
  return createElement(tag, props, ...Children.toArray(keyedChildren));
}

const button = (label, click, className = 'quiet', attrs = {}) =>
  element('button', {type: 'button', class: className, click, ...attrs}, label);
const badge = (text, attention) => element('span', {class: attention ? 'badge attention' : 'badge'}, text);

async function localRequest(payload) {
  if (!postgres) {
    const stored = localStorage.getItem(storageKey);
    const state = stored ? JSON.parse(stored) : structuredClone(initialData);
    if (payload) {
      save[payload.action](state, payload.values, payload.recordId);
      localStorage.setItem(storageKey, JSON.stringify(state));
    }
    return state;
  }
  const response = await fetch('/api/data', payload && {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function table(title, columns, rows) {
  const content = rows.length
    ? element('div', {class: 'scroll'}, element('table', {},
      element('thead', {}, element('tr', {}, columns.map(column => element('th', {scope: 'col'}, column)))),
      element('tbody', {}, rows.map(row => element('tr', {}, row.map(cell => element('td', {}, cell)))))))
    : element('p', {class: 'empty'}, 'Nenhum registro encontrado.');
  return element('section', {class: 'panel'}, element('h2', {}, title), content);
}

function input(label, name, attrs = {}) {
  return element('label', {}, label, element('input', {name, required: '', maxlength: 200, ...attrs}));
}
function select(label, name, items) {
  return element('label', {}, label, element('select', {name, required: '', defaultValue: ''},
    element('option', {value: ''}, 'Selecione'),
    items.map(item => element('option', {value: item.id}, item.name))));
}
function fields(action) {
  const quantity = () => input('Quantidade', 'quantity', {type: 'number', min: 1, max: 1000000, step: 1});
  switch (action) {
    case 'equipment': return [input('Código', 'code'), input('Nome', 'name')];
    case 'part': return [input('Nome da peça', 'name'), input('Estoque mínimo', 'minimum', {type: 'number', min: 0, max: 1000000, step: 1})];
    case 'purchase': return [
      select('Peça', 'part', data.parts), quantity(), input('Fornecedor', 'supplier'),
      input('Data', 'date', {type: 'date', min: '0001-01-01', max: '9999-12-31'}),
      input('Custo unitário (R$)', 'cost', {type: 'number', min: 0, max: 99999999.99, step: '0.01'})
    ];
    case 'order': return [select('Equipamento', 'equipment', data.equipment), input('Serviço', 'description'), input('Responsável', 'owner')];
    case 'consume': return [select('Peça disponível', 'part', data.parts.filter(part => part.stock > 0)), quantity()];
    case 'finish': return element('p', {}, 'Confirme a conclusão da ordem de manutenção.');
  }
}

function showDialog(title, content) {
  dialog?.close();
  const current = document.createElement('dialog');
  current.setAttribute('aria-labelledby', 'modal-title');
  const modalRoot = createRoot(current);
  current.addEventListener('close', () => {
    modalRoot.unmount();
    current.remove();
  }, {once: true});
  document.body.append(current);
  flushSync(() => modalRoot.render(element('div', {},
    element('div', {class: 'modal-heading'},
      element('h2', {id: 'modal-title'}, title),
      button('×', () => current.close(), 'quiet', {'aria-label': 'Fechar'})),
    content)));
  current.showModal();
  dialog = current;
  return current;
}

function edit(action, recordId) {
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = form.querySelector('[role="alert"]');
    const saveButton = form.querySelector('[type="submit"]');
    const values = Object.fromEntries(Array.from(new FormData(form), ([key, value]) => [key, value.trim()]));
    if (Object.values(values).some(value => !value || Array.from(value).length > 200)
      || (values.cost && !/^\d{1,8}(\.\d{1,2})?$/.test(values.cost))) {
      feedback.textContent = 'Preencha todos os campos com valores válidos.';
      return;
    }
    saveButton.disabled = true;
    feedback.textContent = '';
    try {
      if (configured) {
        await writeCloudInventory(action, values, recordId);
        current.close();
        await load('Registro salvo.');
      } else {
        data = await localRequest({action, values, recordId});
        current.close();
        render('Registro salvo.');
      }
    } catch (error) {
      if (configured && !hasSession()) {
        current.close();
        renderLogin('Sessão expirada. Entre novamente.');
      } else feedback.textContent = error.message;
    } finally {
      saveButton.disabled = false;
    }
  }
  const current = showDialog(labels[action], element('form', {submit},
    fields(action), element('p', {class: 'error', role: 'alert'}),
    element('button', {class: 'primary', type: 'submit'}, 'Salvar')));
}

function usageTable(order) {
  return table('Peças utilizadas', ['Peça', 'Quantidade', 'Custo unitário'], order.used.map(use =>
    [get(data.parts, use.part).name, use.quantity, money.format(use.cost)]));
}

function ordersTable(orders, title = 'Ordens de manutenção') {
  return table(title, ['Equipamento / serviço', 'Responsável', 'Status', 'Peças', 'Ações'], orders.map(order => [
    element('div', {}, element('strong', {}, get(data.equipment, order.equipment).name), element('small', {}, order.description)),
    order.owner, badge(order.closed ? 'Concluída' : 'Aberta', !order.closed), money.format(orderCost(order)),
    element('div', {class: 'actions'}, button('Ver peças', () => showDialog('Histórico', usageTable(order))),
      !order.closed ? [button('Adicionar peças', () => edit('consume', order.id)), button('Concluir', () => edit('finish', order.id))] : null)
  ]));
}
function purchasesTable(purchases) {
  return table('Compras registradas', ['Data', 'Fornecedor', 'Peça', 'Quantidade', 'Custo unitário'], purchases.map(purchase =>
    [date(purchase.date), purchase.supplier, get(data.parts, purchase.part).name, purchase.quantity, money.format(purchase.cost)]));
}
function partHistory(part) {
  showDialog('Histórico', [
    purchasesTable(data.purchases.filter(purchase => purchase.part === part.id)),
    table('Saídas', ['Equipamento', 'Serviço', 'Quantidade'], data.orders.flatMap(order =>
      order.used.filter(use => use.part === part.id).map(use =>
        [get(data.equipment, order.equipment).name, order.description, use.quantity])))
  ]);
}
function partsTable(parts, title = 'Peças cadastradas') {
  return table(title, ['Peça', 'Saldo', 'Mínimo', 'Situação', 'Ações'], parts.map(part => [
    part.name, part.stock, part.minimum,
    badge(part.stock <= part.minimum ? 'Estoque baixo' : 'Em estoque', part.stock <= part.minimum),
    button('Histórico', () => partHistory(part))
  ]));
}

function currentView(active, alerts) {
  switch (page) {
    case 'Painel': return [
      element('div', {class: 'summary'}, [
        ['Equipamentos', data.equipment.length, '◇'], ['Peças cadastradas', data.parts.length, '▤'],
        ['Manutenções abertas', active.length, '⚙'], ['Estoque baixo', alerts.length, '!']
      ].map(([label, total, icon]) => element('div', {class: 'metric'},
        element('span', {'aria-hidden': 'true'}, icon), element('strong', {}, total), element('p', {}, label)))),
      ordersTable(active, 'Manutenções em aberto'), partsTable(alerts, 'Alertas de estoque')
    ];
    case 'Equipamentos': return table('Equipamentos cadastrados', ['Código', 'Equipamento', 'Status', 'Ações'],
      data.equipment.map(item => {
        const repair = active.some(order => order.equipment === item.id);
        return [item.code, item.name, badge(repair ? 'Em manutenção' : 'Disponível', repair),
          button('Histórico', () => showDialog('Histórico', ordersTable(data.orders.filter(order => order.equipment === item.id))))];
      }));
    case 'Peças e estoque': return partsTable(data.parts);
    case 'Compras': return purchasesTable(data.purchases);
    case 'Manutenções': return ordersTable(data.orders);
  }
}

function render(notice = '') {
  const [, subtitle, action] = pages[page];
  root.render(element('div', {class: 'layout'},
    element('aside', {},
      element('div', {class: 'brand'}, element('b', {'aria-hidden': 'true'}, 'MA'), 'Machine Airsoft'),
      element('nav', {'aria-label': 'Menu principal'}, Object.entries(pages).map(([name, [icon]]) =>
        button([element('span', {'aria-hidden': 'true'}, icon), name], () => {
          page = name;
          render();
          requestAnimationFrame(() => document.querySelector('[aria-current="page"]')?.focus());
        }, 'nav-button', {'aria-current': page === name ? 'page' : undefined}))),
      configured ? button('Sair', async () => {
        data = undefined;
        page = 'Painel';
        const signingOut = signOut();
        renderLogin();
        await signingOut.catch(() => {});
      }) : element('p', {class: 'aside-note'}, postgres ? 'PostgreSQL' : 'Dados neste navegador')),
    element('main', {},
      element('header', {}, element('div', {}, element('h1', {}, page), element('p', {}, subtitle)),
        button(labels[action], () => edit(action), 'primary')),
      element('p', {class: 'notice', role: 'status'}, notice),
      currentView(openOrders(data), lowStock(data)))));
}

function screen(...content) {
  root.render(element('main', {class: 'entry'}, element('h1', {}, 'Machine Airsoft'), content));
}

function renderLogin(message = '') {
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = form.querySelector('[role="alert"]');
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    feedback.textContent = '';
    const fields = new FormData(form);
    try {
      await signIn(fields.get('email').trim(), fields.get('password'));
      await load();
    } catch {
      feedback.textContent = 'Não foi possível entrar. Confira seu e-mail e sua senha.';
    } finally {
      submitButton.disabled = false;
    }
  }
  screen(element('form', {class: 'panel login', submit},
    element('h2', {}, 'Entre na sua conta'),
    input('E-mail', 'email', {type: 'email', autocomplete: 'username'}),
    input('Senha', 'password', {type: 'password', autocomplete: 'current-password'}),
    element('p', {class: 'error', role: 'alert'}, message),
    element('button', {class: 'primary', type: 'submit'}, 'Entrar')));
}

async function load(notice = '') {
  screen(element('p', {role: 'status'}, 'Carregando registros…'));
  try {
    data = await (configured ? cloudInventory() : localRequest());
    render(notice);
  } catch (error) {
    if (configured && !hasSession()) renderLogin('Sessão expirada. Entre novamente.');
    else screen(element('p', {role: 'alert'}, error.message), button('Tentar novamente', () => load(notice), 'primary'),
      configured ? button('Sair', async () => {
        await signOut().catch(() => {});
        renderLogin();
      }) : null);
  }
}

if (configured && !hasSession()) renderLogin();
else load();
