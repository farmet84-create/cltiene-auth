# CLTIENE Authentication

Sistema de autenticación en **3 fases** con verificación por WhatsApp para MULTISERVICIOS CL TIENE.

## Tecnologías

- **Frontend**: HTML5 + CSS3 + JavaScript vanilla
- **Backend**: Node.js + Express
- **WhatsApp**: API WIP (wiptool.com)
- **Deploy**: VPS Hostinger con Nginx + PM2

## Flujo de autenticación

1. Usuario ingresa número de documento y tipo
2. Sistema valida en base de datos y envía código OTP por WhatsApp
3. Usuario ingresa el código de 6 dígitos
4. Sistema verifica y muestra el perfil del usuario

## Instalación rápida

```bash
npm install
cp .env.example .env
# Edita .env con tus datos reales
npm start
```

## Deploy en Hostinger VPS

Ver `HOSTINGER-GUIA.md` para instrucciones detalladas paso a paso.

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| PORT | Puerto del servidor (default: 3000) |
| WIP_API_KEY | API Key de wiptool.com |
| WIP_CLIENTE | Nombre del cliente en WIP |
| CORS_ORIGIN | Dominio permitido |

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/auth/validate-document | Valida documento |
| POST | /api/auth/send-code | Envía OTP por WhatsApp |
| POST | /api/auth/verify-code | Verifica OTP |
| GET  | /api/health | Estado del servidor |

## Modo demo

Si no hay backend disponible, la app funciona en modo demo automáticamente usando el código `123456`.

---

MULTISERVICIOS CL TIENE — 2026
