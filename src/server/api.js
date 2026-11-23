import {Pool} from 'pg';
import {initialData, save, openOrders} from '../domain/inventory.js';

let pool;
let ready;

export async function closeDatabase() {
  const active = pool;
  pool = undefined;
  ready = undefined;
  await active?.end();
}

function database() {
  if (!ready) {
    ready = (async () => {
      if (!process.env.DATABASE_URL) throw Error('Configure DATABASE_URL no arquivo .env.');
      if (!pool) {
        pool = new Pool({connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000});
        pool.on('error', error => console.error('Conexão ociosa com PostgreSQL encerrada:', error.message));
      }
      await pool.query(`CREATE TABLE IF NOT EXISTS machine_airsoft_state (
        id smallint PRIMARY KEY CHECK (id = 1),
        data jsonb NOT NULL
      )`);
      await pool.query('INSERT INTO machine_airsoft_state (id,data) VALUES (1,$1) ON CONFLICT DO NOTHING', [initialData]);
      return pool;
    })().catch(error => { ready = undefined; throw error; });
  }
  return ready;
}

class RequestError extends Error {}
function invalid(message) { throw new RequestError(message); }

const required = {
  equipment:['code','name'], part:['name','minimum'], purchase:['part','quantity','supplier','date','cost'],
  order:['equipment','description','owner'], consume:['part','quantity'], finish:[]
};
const exists = (list,id) => list.some(item => item.id === id);

function validate(body,state) {
  const {action, recordId, values} = body ?? {};
  if (!Object.hasOwn(required,action) || !values || typeof values !== 'object') invalid('Operação inválida.');
  const clean = {};
  for (const key of required[action]) {
    if (typeof values[key] !== 'string' || !values[key].trim() || values[key].length > 200) invalid('Preencha todos os campos com valores válidos.');
    clean[key] = values[key].trim();
  }
  for (const [key,min] of [['quantity',1],['minimum',0]]) {
    if (key in clean && (!Number.isSafeInteger(Number(clean[key])) || Number(clean[key]) < min || Number(clean[key]) > 1000000)) {
      invalid('Informe uma quantidade inteira válida.');
    }
  }
  if ('cost' in clean && (!/^\d{1,8}(\.\d{1,2})?$/.test(clean.cost))) invalid('Informe um custo válido.');
  if ('date' in clean) {
    const parsed = new Date(clean.date + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.date) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0,10) !== clean.date) invalid('Informe uma data válida.');
  }
  if ('part' in clean && !exists(state.parts,clean.part)) invalid('Peça não encontrada.');
  if ('equipment' in clean && !exists(state.equipment,clean.equipment)) invalid('Equipamento não encontrado.');
  if (['consume','finish'].includes(action) && !exists(openOrders(state),recordId)) invalid('A ordem precisa estar aberta.');
  return {action,recordId,clean};
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString('utf8');
    if (body.length > 16000) invalid('Solicitação muito grande.');
  }
  try { return JSON.parse(body); } catch { return invalid('Envie um JSON válido.'); }
}

function respond(response,status,data) {
  response.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  response.end(JSON.stringify(data));
}

export async function api(request,response,next) {
  const path = request.url?.split('?')[0];
  if (path !== '/api/data') return next();
  try {
    if (!['GET','POST'].includes(request.method)) {
      response.setHeader('Allow','GET, POST');
      return respond(response,405,{error:'Método não permitido.'});
    }
    const db = await database();
    if (request.method === 'GET') {
      const {rows} = await db.query('SELECT data FROM machine_airsoft_state WHERE id = 1');
      return respond(response,200,rows[0].data);
    }
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) return respond(response,415,{error:'Use application/json.'});
    const body = await readBody(request);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      // A leitura com bloqueio serializa as baixas concorrentes antes de validar o saldo.
      const {rows} = await client.query('SELECT data FROM machine_airsoft_state WHERE id = 1 FOR UPDATE');
      const data = rows[0].data;
      const {action,recordId,clean} = validate(body,data);
      try { save[action](data,clean,recordId); } catch (error) { invalid(error.message); }
      await client.query('UPDATE machine_airsoft_state SET data = $1 WHERE id = 1',[data]);
      await client.query('COMMIT');
      respond(response,200,data);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof RequestError) return respond(response,400,{error:error.message});
    console.error('Falha no PostgreSQL:', error.message);
    respond(response,503,{error:'Banco de dados indisponível. Verifique a configuração do servidor.'});
  }
}
