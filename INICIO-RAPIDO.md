# ⚡ INICIO RÁPIDO — CLTIENE AUTH

## Opción más rápida (sin backend)

1. Descarga `cltiene-auth.html`
2. Súbelo a tu hosting → carpeta `public_html`
3. Abre `https://tudominio.com/cltiene-auth.html`
4. ¡Listo! Funciona en modo demo (código: 123456)

---

## Con backend completo (VPS Hostinger)

Sigue los 10 pasos en **HOSTINGER-GUIA.md**

Resumen:
```bash
ssh root@TU_IP
cd /home/cltiene
npm install
cp .env.example .env
nano .env        # configura tu API key
pm2 start server.js --name cltiene-auth
```

---

## Archivos del proyecto

| Archivo | Para qué |
|---------|----------|
| `cltiene-auth.html` | App web completa |
| `server.js` | Backend Node.js |
| `package.json` | Dependencias |
| `.env.example` | Config de entorno |
| `HOSTINGER-GUIA.md` | Deploy paso a paso |
| `Dockerfile` | Para Docker |

---

Versión 1.0 — MULTISERVICIOS CL TIENE 2026
