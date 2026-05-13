# 🚀 GUÍA DE DEPLOY — HOSTINGER VPS

## Requisitos previos
- VPS Hostinger con Ubuntu 20.04 o 22.04
- Acceso SSH habilitado
- Un dominio apuntado a tu IP del VPS

---

## PASO 1 — Conectarte al VPS por SSH

```bash
ssh root@TU_IP_VPS
# Ingresa tu contraseña cuando la pida
```

---

## PASO 2 — Instalar Node.js 20 (si no lo tienes)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # debe mostrar v20.x.x
npm -v
```

---

## PASO 3 — Instalar PM2 (para mantener el server activo)

```bash
npm install -g pm2
```

---

## PASO 4 — Subir los archivos del proyecto

### Opción A: Desde tu computadora con SCP

```bash
# En tu PC (no en el VPS), ejecuta:
scp -r /ruta/al/proyecto/cltiene root@TU_IP_VPS:/home/cltiene
```

### Opción B: Crear carpeta en el VPS y pegar archivos por SFTP

```bash
# En el VPS:
mkdir -p /home/cltiene
cd /home/cltiene
```

Luego sube los archivos con FileZilla, WinSCP o el File Manager de Hostinger.

---

## PASO 5 — Configurar las variables de entorno

```bash
cd /home/cltiene
cp .env.example .env
nano .env
```

Edita los valores:
```
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://tudominio.com
WIP_API_KEY=TU_API_KEY_REAL
```

Guarda con `Ctrl+X`, luego `Y`, luego `Enter`.

---

## PASO 6 — Instalar dependencias

```bash
cd /home/cltiene
npm install --omit=dev
```

---

## PASO 7 — Iniciar con PM2

```bash
pm2 start server.js --name cltiene-auth
pm2 save
pm2 startup   # Para que inicie automáticamente al reiniciar el VPS
```

Verifica que está corriendo:
```bash
pm2 status
pm2 logs cltiene-auth
```

---

## PASO 8 — Configurar Nginx como proxy inverso

```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/cltiene
```

Pega esta configuración:

```nginx
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activa el sitio:
```bash
sudo ln -s /etc/nginx/sites-available/cltiene /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## PASO 9 — SSL gratis con Let's Encrypt (HTTPS)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d tudominio.com -d www.tudominio.com
```

Sigue las instrucciones en pantalla. Certbot configura HTTPS automáticamente.

---

## PASO 10 — Verificar que todo funciona

Abre en tu navegador:
```
https://tudominio.com
```

También prueba el health check:
```
https://tudominio.com/api/health
```

---

## Comandos útiles de PM2

```bash
pm2 status               # Ver estado
pm2 restart cltiene-auth # Reiniciar
pm2 stop cltiene-auth    # Detener
pm2 logs cltiene-auth    # Ver logs en tiempo real
pm2 monit                # Monitor visual
```

---

## Solución de problemas

**Error: "Cannot GET /"**
→ Asegúrate de que `cltiene-auth.html` esté en la misma carpeta que `server.js`

**Error: "Port 3000 already in use"**
→ `sudo lsof -ti:3000 | xargs kill -9`

**Nginx no inicia**
→ `sudo nginx -t` para ver el error exacto

**Node.js no encontrado**
→ Vuelve al Paso 2 y reinstala Node.js

---

## Estructura final en el VPS

```
/home/cltiene/
├── cltiene-auth.html    ← App principal
├── server.js            ← Backend
├── package.json
├── .env                 ← Variables (¡no subir a Git!)
└── node_modules/        ← Generado por npm install
```
