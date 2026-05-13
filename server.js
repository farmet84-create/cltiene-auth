/**
 * CLTIENE Authentication Server
 * Backend Node.js — API REST con autenticación en 3 fases
 * Compatible con Hostinger VPS (Ubuntu 20/22)
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sirve el HTML principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'cltiene-auth.html'));
});

// ─── Almacenamiento temporal de códigos OTP ──────────────────────────────────
// En producción usa Redis o MongoDB para persistir entre reinicios
const otpStore = new Map(); // { documento: { code, expires, attempts } }

// ─── Helper: generar código OTP ──────────────────────────────────────────────
function generarOTP(longitud = 6) {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < longitud; i++) {
    code += digits[crypto.randomInt(0, digits.length)];
  }
  return code;
}

// ─── Helper: enmascarar teléfono ─────────────────────────────────────────────
function maskPhone(phone) {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  return clean.slice(0, -4).replace(/./g, '*') + clean.slice(-4);
}

// ─── Helper: enviar WhatsApp via API WIP ─────────────────────────────────────
async function enviarWhatsApp(telefono, mensaje) {
  const API_URL  = process.env.WIP_API_URL   || 'https://api.wiptool.com';
  const API_KEY  = process.env.WIP_API_KEY   || '';
  const CLIENTE  = process.env.WIP_CLIENTE   || 'MULTISERVICIOS CL TIENE';

  if (!API_KEY) {
    console.log(`[DEMO] WhatsApp a ${telefono}: ${mensaje}`);
    return { success: true, demo: true };
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`${API_URL}/v2/messages/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
        'X-Client': CLIENTE,
      },
      body: JSON.stringify({ to: telefono, message: mensaje }),
    });
    const data = await res.json();
    return { success: res.ok, data };
  } catch (err) {
    console.error('[WA Error]', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Base de datos simulada (reemplaza con MongoDB/MySQL real) ────────────────
// Estructura: { documento: { nombre, telefono, plan, estado, tipo } }
const DB_USUARIOS = {
  '1234567890': {
    nombre: 'Juan García',
    telefono: '+573001234567',
    plan: 'Premium',
    estado: 'Activo',
    tipo: 'CC',
  },
  '0987654321': {
    nombre: 'María López',
    telefono: '+573009876543',
    plan: 'Básico',
    estado: 'Activo',
    tipo: 'CC',
  },
  // Agrega más usuarios aquí o conecta tu base de datos real
};

// ─── ENDPOINT 1: Validar documento ───────────────────────────────────────────
app.post('/api/auth/validate-document', async (req, res) => {
  const { documento, tipo_documento } = req.body;

  if (!documento || !tipo_documento) {
    return res.status(400).json({ success: false, message: 'Documento y tipo requeridos.' });
  }

  const user = DB_USUARIOS[documento.trim()];

  if (!user) {
    return res.status(404).json({ success: false, message: 'Documento no encontrado en el sistema.' });
  }

  // Retornar datos parciales (sin enviar el código todavía)
  res.json({
    success: true,
    user: {
      nombre: user.nombre,
      telefono: maskPhone(user.telefono),
      plan: user.plan,
      estado: user.estado,
    },
  });
});

// ─── ENDPOINT 2: Enviar código OTP ───────────────────────────────────────────
app.post('/api/auth/send-code', async (req, res) => {
  const { documento, tipo_documento } = req.body;

  if (!documento) {
    return res.status(400).json({ success: false, message: 'Documento requerido.' });
  }

  const user = DB_USUARIOS[documento.trim()];
  if (!user) {
    return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
  }

  // Verificar si ya hay un código vigente (anti-spam: 60s entre intentos)
  const existing = otpStore.get(documento);
  if (existing && Date.now() < existing.expires - 60000) {
    return res.status(429).json({
      success: false,
      message: 'Espera un momento antes de solicitar otro código.',
    });
  }

  const code = generarOTP(6);
  const expires = Date.now() + 2 * 60 * 1000; // 2 minutos

  otpStore.set(documento, { code, expires, attempts: 0 });

  const mensaje = `🔐 *CL TIENE - Código de Verificación*\n\nTu código es: *${code}*\n\nVálido por 2 minutos. No lo compartas con nadie.`;
  const resultado = await enviarWhatsApp(user.telefono, mensaje);

  console.log(`[OTP] ${documento} → código ${code} enviado a ${maskPhone(user.telefono)}`);

  res.json({
    success: true,
    message: 'Código enviado por WhatsApp.',
    demo: resultado.demo || false,
  });
});

// ─── ENDPOINT 3: Verificar código OTP ────────────────────────────────────────
app.post('/api/auth/verify-code', async (req, res) => {
  const { documento, codigo } = req.body;

  if (!documento || !codigo) {
    return res.status(400).json({ success: false, message: 'Documento y código requeridos.' });
  }

  const stored = otpStore.get(documento);

  if (!stored) {
    return res.status(400).json({ success: false, message: 'No hay código activo. Solicita uno nuevo.' });
  }

  if (Date.now() > stored.expires) {
    otpStore.delete(documento);
    return res.status(400).json({ success: false, message: 'El código expiró. Solicita uno nuevo.' });
  }

  if (stored.attempts >= 3) {
    otpStore.delete(documento);
    return res.status(429).json({ success: false, message: 'Demasiados intentos. Solicita un nuevo código.' });
  }

  if (stored.code !== codigo.trim()) {
    stored.attempts++;
    const restantes = 3 - stored.attempts;
    return res.status(400).json({
      success: false,
      message: `Código incorrecto. Te quedan ${restantes} intentos.`,
    });
  }

  // ✅ Código correcto
  otpStore.delete(documento);
  const user = DB_USUARIOS[documento];

  res.json({
    success: true,
    message: 'Autenticación exitosa.',
    user: {
      nombre: user.nombre,
      telefono: user.telefono,
      plan: user.plan,
      estado: user.estado,
    },
  });
});

// ─── ENDPOINT 4: Reenviar código ─────────────────────────────────────────────
app.post('/api/auth/resend-code', async (req, res) => {
  const { documento, tipo_documento } = req.body;
  // Reutiliza la lógica de send-code
  req.url = '/api/auth/send-code';
  app.handle(req, res);
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ CLTIENE Auth Server corriendo en http://localhost:${PORT}`);
  console.log(`   Modo: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
