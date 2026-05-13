require('dotenv').config();
const express = require('express');
const path    = require('path');
const crypto  = require('crypto');
const app     = express();
const PORT    = process.env.PORT || 3000;

// ── Config WIP ────────────────────────────────────────────────────────────────
const WIP_BASE   = 'https://api.wiptool.com';
const WIP_KEY    = process.env.WIP_API_KEY    || 'xWjGb5Zt84g4YEBEe4C8ZxNWkVswJg7ZRbkLwJeQ';
const COMPANY_ID = process.env.WIP_COMPANY_ID || '67379dff213b73f99523f061';
const USER_ID    = process.env.WIP_USER_ID    || '67a0dcadba440e5f0db90ccc';

// ── Config WhatsApp (whapi.cloud) ─────────────────────────────────────────────
const WA_URL   = process.env.WHAPI_URL   || 'https://gate.whapi.cloud';
const WA_TOKEN = process.env.WHAPI_TOKEN || 'WwW3UAz2x6iJ0nasEd7ar5WFoVsxnGpc';
const WA_NUM   = process.env.WHAPI_NUM   || '573185159138';

app.use(express.json());

// ── Rutas HTML ─────────────────────────────────────────────────────────────────
app.get('/',                  (req, res) => res.sendFile(path.join(__dirname, 'wip-dashboard.html')));
app.get('/wip-dashboard.html',(req, res) => res.sendFile(path.join(__dirname, 'wip-dashboard.html')));
app.get('/auth',              (req, res) => res.sendFile(path.join(__dirname, 'cltiene-auth.html')));
app.get('/cltiene-auth.html', (req, res) => res.sendFile(path.join(__dirname, 'cltiene-auth.html')));

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

async function wipFetch(wipPath, method = 'GET', body = null) {
  const nodeFetch = (await import('node-fetch')).default;
  const opts = { method, headers: { 'Authorization': WIP_KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await nodeFetch(WIP_BASE + wipPath, opts);
  const text = await res.text();
  console.log(`[WIP] ${method} ${wipPath} → ${res.status} | ${text.slice(0,200)}`);
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

// Enviar mensaje WhatsApp via whapi.cloud
async function sendWhatsApp(telefono, mensaje) {
  const nodeFetch = (await import('node-fetch')).default;
  // Normalizar número: quitar +, espacios, guiones
  let num = telefono.toString().replace(/[\s\-\+\(\)]/g, '');
  if (num.startsWith('0')) num = '57' + num.slice(1);
  if (!num.startsWith('57') && num.length === 10) num = '57' + num;
  const to = num + '@s.whatsapp.net';

  try {
    const res = await nodeFetch(`${WA_URL}/messages/text`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, body: mensaje })
    });
    const data = await res.json();
    console.log(`[WhatsApp] → ${num}: ${res.status}`, JSON.stringify(data).slice(0,150));
    return { ok: res.ok, data };
  } catch(e) {
    console.error('[WhatsApp] Error:', e.message);
    return { ok: false, error: e.message };
  }
}

// OTP store en memoria { documento: { code, expires, attempts } }
const otpStore = new Map();
function generarOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// ════════════════════════════════════════════════════════════════════════════
// 1. AUTENTICACIÓN OTP CON WHATSAPP
// ════════════════════════════════════════════════════════════════════════════

// Validar documento → busca en WIP y retorna teléfono
app.post('/api/auth/validate-document', async (req, res) => {
  const { documento } = req.body;
  if (!documento) return res.status(400).json({ success: false, message: 'Documento requerido' });

  try {
    // Buscar en todos los BUs
    const buRes = await wipFetch(`/business/api/v1/BusinessUnit/company/${COMPANY_ID}/business-units/services`);
    const buIds = (buRes.data.businessUnits || []).map(b => b.id);

    const nodeFetch = (await import('node-fetch')).default;
    const promesas = buIds.map(buId =>
      nodeFetch(`${WIP_BASE}/Customer/api/v1/Customer/Subscription?companyId=${COMPANY_ID}&businessUnitId=${buId}&searchTerm=${encodeURIComponent(documento)}`, {
        headers: { 'Authorization': WIP_KEY, 'Content-Type': 'application/json' }
      }).then(r => r.json()).catch(() => null)
    );
    const resultados = await Promise.all(promesas);
    const clientes = [];
    resultados.forEach(r => {
      const items = Array.isArray(r) ? r : (r?.id ? [r] : []);
      items.forEach(c => { if (!clientes.find(x => x.id === c.id)) clientes.push(c); });
    });

    if (!clientes.length) return res.status(404).json({ success: false, message: 'Documento no encontrado en el sistema.' });

    const cliente = clientes[0];
    const telefono = cliente.phone || '';
    const masked = telefono ? telefono.slice(0,-4).replace(/\d/g,'*') + telefono.slice(-4) : null;

    res.json({
      success: true,
      user: { nombre: cliente.name, telefono: masked, tieneWhatsApp: !!telefono },
      _tel: telefono // se usa en send-code
    });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Enviar OTP por WhatsApp
app.post('/api/auth/send-code', async (req, res) => {
  const { documento } = req.body;
  if (!documento) return res.status(400).json({ success: false, message: 'Documento requerido' });

  // Anti-spam
  const existing = otpStore.get(documento);
  if (existing && Date.now() < existing.expires - 90000) {
    return res.status(429).json({ success: false, message: 'Espera antes de solicitar otro código.' });
  }

  try {
    // Obtener teléfono del cliente
    const buRes = await wipFetch(`/business/api/v1/BusinessUnit/company/${COMPANY_ID}/business-units/services`);
    const buIds = (buRes.data.businessUnits || []).map(b => b.id);
    const nodeFetch = (await import('node-fetch')).default;
    const promesas = buIds.map(buId =>
      nodeFetch(`${WIP_BASE}/Customer/api/v1/Customer/Subscription?companyId=${COMPANY_ID}&businessUnitId=${buId}&searchTerm=${encodeURIComponent(documento)}`, {
        headers: { 'Authorization': WIP_KEY, 'Content-Type': 'application/json' }
      }).then(r => r.json()).catch(() => null)
    );
    const resultados = await Promise.all(promesas);
    let telefono = '', nombre = '';
    resultados.forEach(r => {
      const items = Array.isArray(r) ? r : (r?.id ? [r] : []);
      items.forEach(c => { if (!telefono && c.phone) { telefono = c.phone; nombre = c.name; } });
    });

    if (!telefono) return res.status(404).json({ success: false, message: 'No se encontró número de WhatsApp para este documento.' });

    const code = generarOTP();
    otpStore.set(documento, { code, expires: Date.now() + 2 * 60 * 1000, attempts: 0, telefono, nombre });

    const msg = `🔐 *CL TIENE — Código de Verificación*\n\nHola ${nombre}, tu código es:\n\n*${code}*\n\nVálido por 2 minutos. No lo compartas con nadie.\n\n_MULTISERVICIOS CL TIENE_`;
    const wa = await sendWhatsApp(telefono, msg);

    res.json({ success: true, message: 'Código enviado por WhatsApp.', demo: !wa.ok });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Verificar OTP
app.post('/api/auth/verify-code', async (req, res) => {
  const { documento, codigo } = req.body;
  const stored = otpStore.get(documento);
  if (!stored) return res.status(400).json({ success: false, message: 'No hay código activo.' });
  if (Date.now() > stored.expires) { otpStore.delete(documento); return res.status(400).json({ success: false, message: 'Código expirado.' }); }
  if (stored.attempts >= 3) { otpStore.delete(documento); return res.status(429).json({ success: false, message: 'Demasiados intentos.' }); }
  if (stored.code !== codigo?.trim()) {
    stored.attempts++;
    return res.status(400).json({ success: false, message: `Código incorrecto. ${3 - stored.attempts} intentos restantes.` });
  }
  otpStore.delete(documento);
  // Confirmación por WhatsApp
  sendWhatsApp(stored.telefono, `✅ *CL TIENE*\n\nHola ${stored.nombre}, tu acceso ha sido verificado exitosamente.\n\n_MULTISERVICIOS CL TIENE_`);
  res.json({ success: true, message: 'Autenticación exitosa.', user: { nombre: stored.nombre } });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. PROXY WIP
// ════════════════════════════════════════════════════════════════════════════

// Unidades de negocio
app.get('/wip/business-units', async (req, res) => {
  try {
    const r = await wipFetch(`/business/api/v1/BusinessUnit/company/${COMPANY_ID}/business-units/services`);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Buscar servicios en todos los BUs en paralelo
app.post('/wip/services/search', async (req, res) => {
  try {
    const { subject='', businessUnitId='', pageSize=50, page=0, sort='scheduledDate', sortDirection='Desc' } = req.body;
    let buIds = [];
    if (businessUnitId) {
      buIds = [businessUnitId];
    } else {
      const buRes = await wipFetch(`/business/api/v1/BusinessUnit/company/${COMPANY_ID}/business-units/services`);
      buIds = (buRes.data.businessUnits || []).map(b => b.id);
      if (!buIds.length) buIds = [''];
    }
    const promesas = buIds.map(buId => {
      const searchBody = { pageSize, page, sort, sortDirection, companyId: COMPANY_ID, subject };
      if (buId) searchBody.businessUnitId = buId;
      return wipFetch('/service/api/v1/Service/search', 'POST', searchBody)
        .then(r => { console.log('[SEARCH] buId:', buId, '→', JSON.stringify(r.data).slice(0,200)); return r.data?.data || []; })
        .catch(e => { console.error('[SEARCH ERR]', e.message); return []; });
    });
    const resultados = await Promise.all(promesas);
    const seen = new Set();
    const data = [];
    resultados.flat().forEach(s => { if (s.id && !seen.has(s.id)) { seen.add(s.id); data.push(s); } });
    data.sort((a,b) => new Date(b.scheduledDate||0) - new Date(a.scheduledDate||0));
    res.json({ data, totalRows: data.length });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Crear servicio + notificación WhatsApp
app.post('/wip/services/create', async (req, res) => {
  try {
    const r = await wipFetch(`/service/api/v2/Service/${COMPANY_ID}/service/${USER_ID}`, 'POST', req.body);
    if (r.ok) {
      // Notificar al cliente por WhatsApp
      const tel = req.body.userClientePhone || req.body.userPhone || '';
      const nombre = req.body.finalClientName || req.body.userName || 'Cliente';
      const tipo = req.body.type || 'Servicio';
      const expediente = r.data.wipExpedient || r.data.id || '';
      const fecha = req.body.scheduledDate ? new Date(req.body.scheduledDate).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }) : '';
      if (tel) {
        const msg = `✅ *CL TIENE — Servicio Registrado*\n\nHola ${nombre},\n\nTu solicitud ha sido registrada exitosamente:\n\n📋 *Expediente:* ${expediente}\n🔧 *Servicio:* ${tipo}\n📅 *Fecha:* ${fecha}\n\nNuestro equipo se pondrá en contacto contigo pronto.\n\n_MULTISERVICIOS CL TIENE_`;
        sendWhatsApp(tel, msg);
      }
    }
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Buscar por ID
app.get('/wip/services/:id', async (req, res) => {
  try {
    const r = await wipFetch(`/service/api/v1/Service/${req.params.id}`);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Suscripciones
app.get('/wip/subscriptions', async (req, res) => {
  try {
    const { businessUnitId='', searchTerm='' } = req.query;
    const r = await wipFetch(`/Customer/api/v1/Customer/Subscription?companyId=${COMPANY_ID}&businessUnitId=${businessUnitId}&searchTerm=${encodeURIComponent(searchTerm)}`);
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Detalle suscripción
app.post('/wip/subscriptions/detail', async (req, res) => {
  try {
    const r = await wipFetch('/Customer/api/v1/Customer/Subscription/Consumption', 'POST', {
      customerId: req.body.customerId, businessUnitId: req.body.businessUnitId,
      timeZone: 'America/Bogota', companyId: COMPANY_ID
    });
    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. WEBHOOK — Notificar cambio de estado por WhatsApp
// ════════════════════════════════════════════════════════════════════════════
app.post('/wip/webhook', async (req, res) => {
  try {
    const { id, status, finalClientName, userClientePhone, plate, wipExpedient } = req.body;
    const r = await wipFetch('/status', 'POST', req.body);

    // Notificar al cliente por WhatsApp
    if (userClientePhone) {
      const statusMap = {
        Pending:    '🕐 *Pendiente* — Tu servicio está en espera de asignación.',
        InProgress: '🔧 *En Progreso* — Un técnico está atendiendo tu solicitud.',
        Done:       '✅ *Finalizado* — Tu servicio ha sido completado exitosamente.',
        Cancelled:  '❌ *Cancelado* — Tu servicio ha sido cancelado.',
      };
      const statusMsg = statusMap[status] || `Estado actualizado: ${status}`;
      const msg = `📡 *CL TIENE — Actualización de Servicio*\n\nHola ${finalClientName || 'Cliente'},\n\n${statusMsg}\n\n📋 Expediente: ${wipExpedient || id}\n🚗 Placa: ${plate || '—'}\n\n_MULTISERVICIOS CL TIENE_`;
      sendWhatsApp(userClientePhone, msg);
    }

    res.status(r.status).json(r.data);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Endpoint manual para notificar estado
app.post('/api/notify', async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) return res.status(400).json({ success: false, message: 'telefono y mensaje requeridos' });
  const result = await sendWhatsApp(telefono, mensaje);
  res.json({ success: result.ok, ...result });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), whatsapp: WA_NUM }));

app.listen(PORT, () => {
  console.log(`✅ CLTIENE en http://localhost:${PORT}`);
  console.log(`   WhatsApp: ${WA_NUM} via whapi.cloud`);
  console.log(`   WIP: ${WIP_BASE}`);
});

module.exports = app;
