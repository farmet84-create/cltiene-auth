 require('dotenv').config();
const express = require('express');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

const WIP_BASE   = 'https://api.wiptool.com';
const WIP_KEY    = process.env.WIP_API_KEY    || 'xWjGb5Zt84g4YEBEe4C8ZxNWkVswJg7ZRbkLwJeQ';
const COMPANY_ID = process.env.WIP_COMPANY_ID || '67379dff213b73f99523f061';
const USER_ID    = process.env.WIP_USER_ID    || '67a0dcadba440e5f0db90ccc';
const WA_URL     = process.env.WHAPI_URL      || 'https://gate.whapi.cloud';
const WA_TOKEN   = process.env.WHAPI_TOKEN    || 'WwW3UAz2x6iJ0nasEd7ar5WFoVsxnGpc';

app.use(express.json());

app.get('/',                   (req, res) => res.sendFile(path.join(__dirname, 'wip-dashboard.html')));
app.get('/wip-dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'wip-dashboard.html')));
app.get('/auth',               (req, res) => res.sendFile(path.join(__dirname, 'cltiene-auth.html')));
app.get('/cltiene-auth.html',  (req, res) => res.sendFile(path.join(__dirname, 'cltiene-auth.html')));

// ── Helper WIP ────────────────────────────────────────────────────────────────
async function wipFetch(wipPath, method, body) {
  method = method || 'GET';
  const nodeFetch = (await import('node-fetch')).default;
  const opts = { method, headers: { 'Authorization': WIP_KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await nodeFetch(WIP_BASE + wipPath, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data: data };
}

// ── Helper WhatsApp ───────────────────────────────────────────────────────────
async function sendWA(tel, msg) {
  try {
    const nodeFetch = (await import('node-fetch')).default;
    let num = tel.toString().replace(/[\s\-\+\(\)]/g, '');
    if (num.length === 10) num = '57' + num;
    const res = await nodeFetch(WA_URL + '/messages/text', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + WA_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: num + '@s.whatsapp.net', body: msg })
    });
    const data = await res.json();
    console.log('[WA]', num, res.status);
    return { ok: res.ok, data: data };
  } catch(e) {
    console.error('[WA Error]', e.message);
    return { ok: false };
  }
}

// OTP store
const otpStore = new Map();

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/validate-document', async (req, res) => {
  const doc = req.body.documento;
  if (!doc) return res.status(400).json({ success: false, message: 'Documento requerido' });
  try {
    const buRes = await wipFetch('/business/api/v1/BusinessUnit/company/' + COMPANY_ID + '/business-units/services');
    const buIds = (buRes.data.businessUnits || []).map(function(b) { return b.id; });
    const nodeFetch = (await import('node-fetch')).default;
    const promesas = buIds.map(function(buId) {
      return nodeFetch(WIP_BASE + '/Customer/api/v1/Customer/Subscription?companyId=' + COMPANY_ID + '&businessUnitId=' + buId + '&searchTerm=' + encodeURIComponent(doc), {
        headers: { 'Authorization': WIP_KEY, 'Content-Type': 'application/json' }
      }).then(function(r) { return r.json(); }).catch(function() { return null; });
    });
    const resultados = await Promise.all(promesas);
    const clientes = [];
    resultados.forEach(function(r) {
      const items = Array.isArray(r) ? r : (r && r.id ? [r] : []);
      items.forEach(function(c) { if (!clientes.find(function(x) { return x.id === c.id; })) clientes.push(c); });
    });
    if (!clientes.length) return res.status(404).json({ success: false, message: 'Documento no encontrado en el sistema.' });
    const cliente = clientes[0];
    const tel = cliente.phone || '';
    const masked = tel ? tel.slice(0, -4).replace(/\d/g, '*') + tel.slice(-4) : null;
    res.json({ success: true, user: { nombre: cliente.name, telefono: masked, tieneWhatsApp: !!tel } });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/send-code', async (req, res) => {
  const doc = req.body.documento;
  if (!doc) return res.status(400).json({ success: false, message: 'Documento requerido' });
  const existing = otpStore.get(doc);
  if (existing && Date.now() < existing.expires - 90000) {
    return res.status(429).json({ success: false, message: 'Espera antes de solicitar otro código.' });
  }
  try {
    const buRes = await wipFetch('/business/api/v1/BusinessUnit/company/' + COMPANY_ID + '/business-units/services');
    const buIds = (buRes.data.businessUnits || []).map(function(b) { return b.id; });
    const nodeFetch = (await import('node-fetch')).default;
    const promesas = buIds.map(function(buId) {
      return nodeFetch(WIP_BASE + '/Customer/api/v1/Customer/Subscription?companyId=' + COMPANY_ID + '&businessUnitId=' + buId + '&searchTerm=' + encodeURIComponent(doc), {
        headers: { 'Authorization': WIP_KEY, 'Content-Type': 'application/json' }
      }).then(function(r) { return r.json(); }).catch(function() { return null; });
    });
    const resultados = await Promise.all(promesas);
    let telefono = '', nombre = '';
    resultados.forEach(function(r) {
      const items = Array.isArray(r) ? r : (r && r.id ? [r] : []);
      items.forEach(function(c) { if (!telefono && c.phone) { telefono = c.phone; nombre = c.name; } });
    });
    if (!telefono) return res.status(404).json({ success: false, message: 'No hay número WhatsApp registrado.' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(doc, { code: code, expires: Date.now() + 120000, attempts: 0, telefono: telefono, nombre: nombre });
    const msg = '🔐 *CL TIENE — Código de Verificación*\n\nHola ' + nombre + ', tu código es:\n\n*' + code + '*\n\nVálido por 2 minutos.\n\n_MULTISERVICIOS CL TIENE_';
    const wa = await sendWA(telefono, msg);
    res.json({ success: true, message: 'Código enviado.', demo: !wa.ok });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/verify-code', async (req, res) => {
  const doc = req.body.documento, codigo = req.body.codigo;
  const stored = otpStore.get(doc);
  if (!stored) return res.status(400).json({ success: false, message: 'No hay código activo.' });
  if (Date.now() > stored.expires) { otpStore.delete(doc); return res.status(400).json({ success: false, message: 'Código expirado.' }); }
  if (stored.attempts >= 3) { otpStore.delete(doc); return res.status(429).json({ success: false, message: 'Demasiados intentos.' }); }
  if (stored.code !== String(codigo).trim()) {
    stored.attempts++;
    return res.status(400).json({ success: false, message: 'Código incorrecto. ' + (3 - stored.attempts) + ' intentos restantes.' });
  }
  otpStore.delete(doc);
  sendWA(stored.telefono, '✅ *CL TIENE*\n\nHola ' + stored.nombre + ', acceso verificado exitosamente.\n\n_MULTISERVICIOS CL TIENE_');
  res.json({ success: true, message: 'Autenticación exitosa.', user: { nombre: stored.nombre } });
});

// ════════════════════════════════════════════════════════════════════════════
// WIP PROXY
// ════════════════════════════════════════════════════════════════════════════

app.get('/wip/business-units', async (req, res) => {
  try {
    const r = await wipFetch('/business/api/v1/BusinessUnit/company/' + COMPANY_ID + '/business-units/services');
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Búsqueda — prueba múltiples formatos
app.post('/wip/services/search', async (req, res) => {
  try {
    const subject      = req.body.subject      || '';
    const businessUnitId = req.body.businessUnitId || '';
    const pageSize     = req.body.pageSize     || 50;
    const page         = req.body.page         || 0;
    const sort         = req.body.sort         || 'scheduledDate';
    const sortDirection= req.body.sortDirection|| 'Desc';

    // Formato 1: subject
    const body1 = { pageSize: pageSize, page: page, sort: sort, sortDirection: sortDirection, companyId: COMPANY_ID, userId: USER_ID, businessUnitId: businessUnitId, subject: subject };
    const r1 = await wipFetch('/service/api/v1/Service/search', 'POST', body1);
    console.log('[S1]', r1.status, JSON.stringify(r1.data).slice(0, 300));
    if (r1.ok && r1.data && r1.data.data && r1.data.data.length > 0) {
      return res.json({ data: r1.data.data, totalRows: r1.data.totalRows || r1.data.data.length });
    }

    // Formato 2: filterValue customerDocument
    const body2 = { pageSize: pageSize, page: page, sort: sort, sortDirection: sortDirection, companyId: COMPANY_ID, userId: USER_ID,
      filterValue: subject ? [{ property: 'customerDocument', value: [subject], operator: 'Equal' }] : [] };
    const r2 = await wipFetch('/service/api/v1/Service/search', 'POST', body2);
    console.log('[S2]', r2.status, JSON.stringify(r2.data).slice(0, 300));
    if (r2.ok && r2.data && r2.data.data && r2.data.data.length > 0) {
      return res.json({ data: r2.data.data, totalRows: r2.data.totalRows || r2.data.data.length });
    }

    // Formato 3: sin subject (traer todos)
    const body3 = { pageSize: pageSize, page: page, sort: sort, sortDirection: sortDirection, companyId: COMPANY_ID, userId: USER_ID };
    const r3 = await wipFetch('/service/api/v1/Service/search', 'POST', body3);
    console.log('[S3]', r3.status, JSON.stringify(r3.data).slice(0, 300));
    if (r3.ok && r3.data && r3.data.data) {
      const all = r3.data.data;
      const filtered = subject ? all.filter(function(s) {
        return (s.customerDocument && s.customerDocument.includes(subject)) ||
               (s.finalClientName && s.finalClientName.toLowerCase().includes(subject.toLowerCase())) ||
               (s.plate && s.plate.toLowerCase().includes(subject.toLowerCase()));
      }) : all;
      return res.json({ data: filtered, totalRows: filtered.length });
    }

    res.json({ data: [], totalRows: 0, debug: { s1: r1.status, s2: r2.status, s3: r3.status } });
  } catch(e) {
    console.error('[SEARCH]', e.message);
    res.status(500).json({ message: e.message });
  }
});

// Crear servicio + WhatsApp
app.post('/wip/services/create', async (req, res) => {
  try {
    const r = await wipFetch('/service/api/v2/Service/' + COMPANY_ID + '/service/' + USER_ID, 'POST', req.body);
    if (r.ok) {
      const tel    = req.body.userClientePhone || req.body.userPhone || '';
      const nombre = req.body.finalClientName  || req.body.userName  || 'Cliente';
      const tipo   = req.body.type || 'Servicio';
      const exp    = r.data.wipExpedient || r.data.id || '';
      if (tel) {
        sendWA(tel, '✅ *CL TIENE — Servicio Registrado*\n\nHola ' + nombre + ',\n\n📋 Expediente: ' + exp + '\n🔧 Servicio: ' + tipo + '\n\nNuestro equipo se pondrá en contacto pronto.\n\n_MULTISERVICIOS CL TIENE_');
      }
    }
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.get('/wip/services/:id', async (req, res) => {
  try {
    const r = await wipFetch('/service/api/v1/Service/' + req.params.id);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.get('/wip/subscriptions', async (req, res) => {
  try {
    const buId = req.query.businessUnitId || '';
    const term = req.query.searchTerm || '';
    const r = await wipFetch('/Customer/api/v1/Customer/Subscription?companyId=' + COMPANY_ID + '&businessUnitId=' + buId + '&searchTerm=' + encodeURIComponent(term));
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.post('/wip/subscriptions/detail', async (req, res) => {
  try {
    const r = await wipFetch('/Customer/api/v1/Customer/Subscription/Consumption', 'POST', {
      customerId: req.body.customerId, businessUnitId: req.body.businessUnitId,
      timeZone: 'America/Bogota', companyId: COMPANY_ID
    });
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.post('/wip/webhook', async (req, res) => {
  try {
    const r = await wipFetch('/status', 'POST', req.body);
    const tel = req.body.userClientePhone || '';
    if (tel) {
      const statusMap = { Pending: '🕐 Pendiente', InProgress: '🔧 En Progreso', Done: '✅ Finalizado', Cancelled: '❌ Cancelado' };
      sendWA(tel, '📡 *CL TIENE*\n\nEstado actualizado: ' + (statusMap[req.body.status] || req.body.status) + '\nExpediente: ' + (req.body.wipExpedient || req.body.id || '') + '\n\n_MULTISERVICIOS CL TIENE_');
    }
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Diagnóstico
app.get('/api/diag', async (req, res) => {
  const out = {};
  const b1 = { pageSize: 5, page: 0, sort: 'scheduledDate', sortDirection: 'Desc', companyId: COMPANY_ID, userId: USER_ID, subject: '1000988807' };
  const t1 = await wipFetch('/service/api/v1/Service/search', 'POST', b1).catch(function(e) { return { status: 0, data: { err: e.message } }; });
  out.fmt1_subject = { status: t1.status, data: JSON.stringify(t1.data).slice(0, 400) };

  const b2 = { pageSize: 5, page: 0, sort: 'scheduledDate', sortDirection: 'Desc', companyId: COMPANY_ID, userId: USER_ID,
    filterValue: [{ property: 'customerDocument', value: ['1000988807'], operator: 'Equal' }] };
  const t2 = await wipFetch('/service/api/v1/Service/search', 'POST', b2).catch(function(e) { return { status: 0, data: { err: e.message } }; });
  out.fmt2_filterValue = { status: t2.status, data: JSON.stringify(t2.data).slice(0, 400) };

  const b3 = { pageSize: 5, page: 0, sort: 'scheduledDate', sortDirection: 'Desc', companyId: COMPANY_ID, userId: USER_ID };
  const t3 = await wipFetch('/service/api/v1/Service/search', 'POST', b3).catch(function(e) { return { status: 0, data: { err: e.message } }; });
  out.fmt3_empty = { status: t3.status, data: JSON.stringify(t3.data).slice(0, 400) };

  res.json(out);
});

app.get('/api/health', function(req, res) { res.json({ status: 'ok', uptime: process.uptime() }); });

app.listen(PORT, function() {
  console.log('✅ CLTIENE en http://localhost:' + PORT);
});

module.exports = app;
