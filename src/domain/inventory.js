export const initialData = {
  demo: true,
  equipment: [
    { id: 'demo-eq-1', code: 'EQ-001', name: 'Máscara facial Alpha' },
    { id: 'demo-eq-2', code: 'EQ-002', name: 'Óculos de proteção Bravo' },
    { id: 'demo-eq-3', code: 'EQ-003', name: 'Coletes de proteção Charlie' }
  ],
  parts: [
    { id: 'demo-p-1', name: 'Tira elástica para máscara', minimum: 3, stock: 8, cost: 18.50 },
    { id: 'demo-p-2', name: 'Almofada de conforto para óculos', minimum: 3, stock: 2, cost: 14.90 },
    { id: 'demo-p-3', name: 'Fivela para colete', minimum: 4, stock: 12, cost: 8.50 }
  ],
  purchases: [
    { part: 'demo-p-1', date: '2026-11-15', supplier: 'Alfa Suprimentos', quantity: 10, cost: 18.50 },
    { part: 'demo-p-2', date: '2026-11-16', supplier: 'Bravo Proteção', quantity: 4, cost: 14.90 },
    { part: 'demo-p-3', date: '2026-11-18', supplier: 'Alfa Suprimentos', quantity: 12, cost: 8.50 }
  ],
  orders: [
    {
      id: 'demo-os-1', equipment: 'demo-eq-1', description: 'Substituição das tiras elásticas',
      owner: 'Marina Costa', used: [{ part: 'demo-p-1', quantity: 2, cost: 18.50 }], closed: false
    },
    {
      id: 'demo-os-2', equipment: 'demo-eq-2', description: 'Troca das almofadas de conforto',
      owner: 'Rafael Lima', used: [{ part: 'demo-p-2', quantity: 2, cost: 14.90 }], closed: true
    },
    {
      id: 'demo-os-3', equipment: 'demo-eq-3', description: 'Inspeção das fivelas',
      owner: 'Marina Costa', used: [], closed: false
    }
  ]
};

const find = (list, id) => list.find(item => item.id === id);
const id = () => crypto.randomUUID();
export const openOrders = (state) => state.orders.filter(order => !order.closed);
export const lowStock = (state) => state.parts.filter(part => part.stock <= part.minimum);
export const orderCost = (order) => order.used.reduce((total, part) => total + part.quantity * part.cost, 0);

export const save = {
  equipment(state, values) {
    if (state.equipment.some((item) => item.code.toLowerCase() === values.code.toLowerCase())) {
      throw new Error('Já existe um equipamento com esse código.');
    }
    state.equipment.push({ id: id(), ...values });
  },
  part(state, values) {
    state.parts.push({ id: id(), name: values.name, minimum: Number(values.minimum), stock: 0, cost: 0 });
  },
  purchase(state, values) {
    const part = find(state.parts, values.part);
    const quantity = Number(values.quantity);
    const cost = Number(values.cost);
    part.stock += quantity;
    part.cost = cost;
    state.purchases.push({ ...values, quantity, cost });
  },
  order(state, values) {
    if (openOrders(state).some((order) => order.equipment === values.equipment)) {
      throw new Error('Esse equipamento já tem uma ordem em aberto.');
    }
    state.orders.push({ id: id(), ...values, used: [], closed: false });
  },
  consume(state, values, recordId) {
    const order = find(state.orders, recordId);
    const part = find(state.parts, values.part);
    const quantity = Number(values.quantity);
    if (!order || order.closed) throw new Error('A ordem já foi concluída.');
    if (part.stock < quantity) throw new Error(`Saldo insuficiente. Disponível: ${part.stock}.`);
    // Guarde o custo no momento da baixa para preservar o histórico após novas compras.
    order.used.push({ part: part.id, quantity, cost: part.cost });
    part.stock -= quantity;
  },
  finish(state, values, recordId) {
    find(state.orders, recordId).closed = true;
  }
};
