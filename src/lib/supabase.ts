import { createClient } from '@supabase/supabase-js';

let sbClient: ReturnType<typeof createClient> | null = null;
let cachedConfig: { supabaseUrl: string; supabaseKey: string; adminPin?: string } | null = null;

export function getSupabaseClient() {
  return sbClient;
}

function getDataJsonUrl(): string {
  if (isRemote()) {
    const basePath = window.location.pathname.replace(/\/admin\/.*$/, '');
    return basePath + '/data.json';
  }
  return 'data.json';
}

export async function initSupabase(): Promise<boolean> {
  if (sbClient) return true;

  const localFallback = async (): Promise<{ supabaseUrl: string; supabaseKey: string } | null> => {
    try {
      const r = await fetch('/api/company-config');
      if (r.ok) {
        const d = await r.json();
        if (d?.supabaseUrl && d?.supabaseKey) return { supabaseUrl: d.supabaseUrl, supabaseKey: d.supabaseKey };
      }
    } catch {}
    try {
      const r = await fetch('/api/web-data');
      if (r.ok) {
        const d = await r.json();
        if (d.config?.supabaseUrl && d.config?.supabaseKey) return { supabaseUrl: d.config.supabaseUrl, supabaseKey: d.config.supabaseKey };
      }
    } catch {}
    try {
      const r = await fetch('http://localhost:4050/api/company-config');
      if (r.ok) {
        const d = await r.json();
        if (d?.supabaseUrl && d?.supabaseKey) return { supabaseUrl: d.supabaseUrl, supabaseKey: d.supabaseKey };
      }
    } catch {}
    try {
      const r = await fetch(getDataJsonUrl());
      if (r.ok) {
        const d = await r.json();
        if (d.supabaseUrl && d.supabaseKey) return { supabaseUrl: d.supabaseUrl, supabaseKey: d.supabaseKey };
      }
    } catch {}
    return null;
  };

  const creds = await localFallback();
  if (!creds || !creds.supabaseUrl || !creds.supabaseKey) return false;

  sbClient = createClient(creds.supabaseUrl, creds.supabaseKey);
  return true;
}

async function loadConfig(): Promise<void> {
  if (cachedConfig) return;
  if (!sbClient) return;

  const sbUrl = sbClient.supabaseUrl;
  const sbKey = sbClient.supabaseKey;
  cachedConfig = { supabaseUrl: sbUrl, supabaseKey: sbKey };

  try {
    const { data } = await sbClient.from('settings').select('key, value').eq('key', 'companyConfig').maybeSingle();
    if (data?.value) {
      try { const parsed = JSON.parse(data.value); if (typeof parsed === 'object') cachedConfig = { ...cachedConfig, ...parsed }; } catch {}
    }
  } catch {}
}

export function isRemote(): boolean {
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1';
}

export function isLocal(): boolean {
  return !isRemote();
}

export async function verifyPin(pin: string): Promise<boolean> {
  await loadConfig();
  if (!cachedConfig?.adminPin) return true;
  return cachedConfig.adminPin === pin;
}

export function getSupabaseUrl(): string {
  return cachedConfig?.supabaseUrl || sbClient?.supabaseUrl || '';
}

export function getSupabaseKey(): string {
  return cachedConfig?.supabaseKey || sbClient?.supabaseKey || '';
}
