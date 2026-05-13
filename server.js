/**
 * CLTIENE — WIP Dashboard Server
 * Proxy completo para todos los endpoints de la API WIP v2.3
 */

require('dotenv').config();
const express = require('express');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

const WIP_BASE    = 'https://api.wiptool.com';
const WIP_KEY     = process.env.WIP_API_KEY    || 'xWjGb5Zt84g4YEBEe4C8ZxNWkVswJg7ZRbkLwJeQ';
const COMPANY_ID  = process.env.WIP_COMPANY_ID || '67379dff213b73f99523f061';
const USER_ID     = process.env.WIP_USER_ID    || '67a0dcadba440e5f0db90ccc';
const BU_OWNER_ID = process.env.WIP_BUOWNER_ID || '67379dff213b73f99523f061';

app.use(express.json());
app.use(express.static(__dirname));

app.get('/',    (req, res) => res.sendFile(path.join(__dirname, 'wip-dashboard.html')));
app.get('/auth',(req, res) => res.sendFile(path.join(__dirname, 'cltiene-auth.html')));

async function wipFetch(path, method = 'GET', body = null) {
  const nodeFetch = (await import('node-fetch')).default;
  const opts = { method, headers: { 'Authorization': WIP_KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await nodeFetch(WIP_BASE + path, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

// 1. Unidades de negocio
app.get('/wip/business-units', async (req, res) => {
  try {
    const r = await wipFetch(`/business/api/v1/BusinessUnit/company/${COMPANY_ID}/business-units/services`);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// 2. Crear servicio
app.post('/wip/services/create', async (req, res) => {
  try {
    const r = await wipFetch(`/service/api/v2/Service/${COMPANY_ID}/service/${USER_ID}`, 'POST', req.body);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// 3. Buscar por ID
app.get('/wip/services/:id', async (req, res) => {
  try {
    const r = await wipFetch(`/service/api/v1/Service/${req.params.id}`);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// 4. Buscar servicios
app.post('/wip/services/search', async (req, res) => {
  try {
    const body = { pageSize: req.body.pageSize||20, page: req.body.page||0, sort: req.body.sort||'scheduledDate', sortDirection: req.body.sortDirection||'Desc', companyId: COMPANY_ID, userId: USER_ID, subject: req.body.subject||'', businessUnitId: req.body.businessUnitId||'' };
    const r = await wipFetch('/service/api/v1/Service/search', 'POST', body);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// 5. Suscripciones
app.get('/wip/subscriptions', async (req, res) => {
  try {
    const { companyId=COMPANY_ID, businessUnitId='', searchTerm='' } = req.query;
    let url = `/Customer/api/v1/Customer/Subscription?companyId=${companyId}&searchTerm=${encodeURIComponent(searchTerm)}`;
    if (businessUnitId) url += `&businessUnitId=${businessUnitId}`;
    const r = await wipFetch(url);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// 6. Detalle suscripción
app.post('/wip/subscriptions/detail', async (req, res) => {
  try {
    const body = { customerId: req.body.customerId, businessUnitId: req.body.businessUnitId, timeZone: 'America/Bogota', companyId: COMPANY_ID };
    const r = await wipFetch('/Customer/api/v1/Customer/Subscription/Consumption', 'POST', body);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// 7. WebHook
app.post('/wip/webhook', async (req, res) => {
  try {
    const r = await wipFetch('/status', 'POST', req.body);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/health', (req, res) => res.json({ status:'ok', uptime: process.uptime() }));

app.listen(PORT, () => {
  console.log(`✅ CLTIENE WIP Dashboard en http://localhost:${PORT}`);
  console.log(`   WIP Base: ${WIP_BASE} | Company: ${COMPANY_ID}`);
});

module.exports = app;
