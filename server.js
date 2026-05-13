require('dotenv').config();
const express = require('express');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

const WIP_BASE    = 'https://api.wiptool.com';
const WIP_KEY     = process.env.WIP_API_KEY    || 'xWjGb5Zt84g4YEBEe4C8ZxNWkVswJg7ZRbkLwJeQ';
const COMPANY_ID  = process.env.WIP_COMPANY_ID || '67379dff213b73f99523f061';
const USER_ID     = process.env.WIP_USER_ID    || '67a0dcadba440e5f0db90ccc';

app.use(express.json());

app.get('/',                  (req, res) => res.sendFile(path.join(__dirname, 'wip-dashboard.html')));
app.get('/wip-dashboard.html',(req, res) => res.sendFile(path.join(__dirname, 'wip-dashboard.html')));
app.get('/auth',              (req, res) => res.sendFile(path.join(__dirname, 'cltiene-auth.html')));
app.get('/cltiene-auth.html', (req, res) => res.sendFile(path.join(__dirname, 'cltiene-auth.html')));

async function wipFetch(wipPath, method = 'GET', body = null) {
  const nodeFetch = (await import('node-fetch')).default;
  const url = WIP_BASE + wipPath;
  console.log(`[WIP] ${method} ${url}`, body ? JSON.stringify(body).slice(0,150) : '');
  const opts = { method, headers: { 'Authorization': WIP_KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await nodeFetch(url, opts);
  const text = await res.text();
  console.log(`[WIP] ${res.status} | ${text.slice(0, 300)}`);
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

// 2. Buscar servicios — busca en TODOS los BUs en paralelo y combina resultados
app.post('/wip/services/search', async (req, res) => {
  try {
    const { subject='', businessUnitId='', pageSize=50, page=0, sort='scheduledDate', sortDirection='Desc' } = req.body;

    // Si tiene businessUnitId específico, busca solo ahí
    // Si no, busca en todos los BUs en paralelo
    let buIds = [];
    if (businessUnitId) {
      buIds = [businessUnitId];
    } else {
      // Obtener todos los BUs
      const buRes = await wipFetch(`/business/api/v1/BusinessUnit/company/${COMPANY_ID}/business-units/services`);
      buIds = (buRes.data.businessUnits || []).map(b => b.id);
      if (!buIds.length) buIds = ['']; // fallback sin filtro
    }

    // Buscar en cada BU en paralelo
    const promesas = buIds.map(buId => {
      const body = {
        pageSize, page, sort, sortDirection,
        companyId: COMPANY_ID,
        userId: USER_ID,
        subject: subject,
        businessUnitId: buId,
      };
      return wipFetch('/service/api/v1/Service/search', 'POST', body)
        .then(r => r.data?.data || [])
        .catch(() => []);
    });

    const resultados = await Promise.all(promesas);

    // Combinar y deduplicar por id
    const seen = new Set();
    const data = [];
    resultados.flat().forEach(s => {
      if (s.id && !seen.has(s.id)) { seen.add(s.id); data.push(s); }
    });

    // Ordenar por fecha descendente
    data.sort((a,b) => new Date(b.scheduledDate||0) - new Date(a.scheduledDate||0));

    res.json({ data, totalRows: data.length, pageSize, page });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
});

// 3. Crear servicio
app.post('/wip/services/create', async (req, res) => {
  try {
    const r = await wipFetch(`/service/api/v2/Service/${COMPANY_ID}/service/${USER_ID}`, 'POST', req.body);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// 4. Buscar por ID
app.get('/wip/services/:id', async (req, res) => {
  try {
    const r = await wipFetch(`/service/api/v1/Service/${req.params.id}`);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// 5. Suscripciones
app.get('/wip/subscriptions', async (req, res) => {
  try {
    const { businessUnitId='', searchTerm='' } = req.query;
    const url = `/Customer/api/v1/Customer/Subscription?companyId=${COMPANY_ID}&businessUnitId=${businessUnitId}&searchTerm=${encodeURIComponent(searchTerm)}`;
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

app.listen(PORT, () => console.log(`✅ CLTIENE en http://localhost:${PORT}`));
module.exports = app;
