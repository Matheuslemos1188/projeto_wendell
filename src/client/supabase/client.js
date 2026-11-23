import {supabaseUrl, supabasePublishableKey} from './config.js';

const origin = supabaseUrl.replace(/\/$/, '');
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(origin)
  && /^sb_publishable_[\w-]+$/.test(supabasePublishableKey);
const sessionKey = 'machine-airsoft-session:' + origin;
let session = JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null');

function setSession(value) {
  session = value && {...value, expires_at: value.expires_at ?? Date.now() / 1000 + value.expires_in};
  if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session));
  else sessionStorage.removeItem(sessionKey);
}

async function send(path, {body, token, method = body ? 'POST' : 'GET'} = {}) {
  const headers = {apikey: supabasePublishableKey};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(origin + path, {method, headers, body: JSON.stringify(body)});
  const bodyText = await response.text();
  const result = bodyText ? JSON.parse(bodyText) : null;
  if (!response.ok) {
    const error = new Error(result?.message ?? result?.msg ?? 'Falha ao acessar o Supabase.');
    error.status = response.status;
    throw error;
  }
  return result;
}

export function hasSession() {
  return Boolean(session);
}

export async function signIn(email, password) {
  setSession(await send('/auth/v1/token?grant_type=password', {body: {email, password}}));
}

export async function signOut() {
  const token = session?.access_token;
  setSession(null);
  if (token) await send('/auth/v1/logout?scope=local', {method: 'POST', token});
}

async function accessToken() {
  if (!session) throw new Error('Entre na sua conta.');
  if (session.expires_at * 1000 <= Date.now() + 30000) {
    try {
      setSession(await send('/auth/v1/token?grant_type=refresh_token', {
        body: {refresh_token: session.refresh_token}
      }));
    } catch (error) {
      if (error.status === 400 || error.status === 401 || error.status === 403) setSession(null);
      throw error;
    }
  }
  return session.access_token;
}

export function cloudInventory() {
  return rpc('inventory_state');
}

export function writeCloudInventory(action, fields, recordId) {
  return rpc('inventory_write', {action, fields, record_id: recordId ?? null});
}

async function rpc(name, body) {
  const token = await accessToken();
  try {
    return await send('/rest/v1/rpc/' + name, {body, token});
  } catch (error) {
    if (error.status === 401) setSession(null);
    throw error;
  }
}
