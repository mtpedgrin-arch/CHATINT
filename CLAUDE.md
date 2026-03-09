# Casino 463 Admin Panel — Memoria del Proyecto

## IMPORTANTE
- **Este es el proyecto CORRECTO y ACTUAL**: `C:\Users\user\Desktop\Nuevo Automatización\casino-admin`
- NO hay otra version. Si el browser muestra version vieja, hacer **Ctrl+Shift+R** (hard refresh)
- El frontend correcto tiene 12 items en el sidebar (incluyendo Palta Wallet y Analytics)
- Si despues de cambios el usuario dice que ve version vieja → es cache del browser, NO es otro proyecto

## Configuracion Rapida
- **Backend:** `cd casino-admin && npx ts-node src/index.ts` → Puerto **4000**
- **Frontend:** `cd casino-admin/frontend && npm run dev` → Puerto **5174**
- **Widget:** `http://localhost:4000/widget` (se sirve como static desde public/)
- **Login Admin:** `admin@gana463.com` / `123456` (usuario: `admin`)
- **Login Admin 2:** `boss@gana463.com` / `admin123` (usuario: `boss`)
- **.env:** `PORT=4000`, tiene `OPENAI_API_KEY` configurada para OCR, tiene `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`
- **Vite proxy:** apunta a `localhost:4000` (vite.config.js)
- **Despues de cambios en frontend:** decirle al usuario que haga Ctrl+Shift+R para limpiar cache
- **widget.html es static:** no requiere reiniciar backend para ver cambios, solo refrescar browser

## Arquitectura General
El sistema tiene **2 caras**:
- **LA CASA** = Admin Panel (`/login`, `/chats`, `/clientes`, `/palta`, etc.) — donde el dueño gestiona todo
- **EL JUGADOR** = Widget (`/widget`) — chat del cliente con 463.life de fondo en iframe

### Stack
- Backend: Express + TypeScript + Socket.IO (src/)
- Frontend Admin: React + Vite (frontend/src/)
- Widget: HTML vanilla monolítico (public/widget.html, ~3800 líneas)
- Data: JSON file (data/store.json) via dataService
- Scraper: Puppeteer (Palta Wallet)
- OCR: OpenAI Vision (gpt-4o-mini)
- Push: web-push (VAPID)

## Estructura de Archivos Clave

### Backend (src/)
| Archivo | Función |
|---------|---------|
| `src/index.ts` | Entry point, Socket.IO, rutas, middleware, debug endpoints |
| `src/routes/auth.routes.ts` | Login admin (JWT) |
| `src/routes/chat.routes.ts` | Widget login, mensajes, automation state machine, comprobante upload, OCR, "volver" handling |
| `src/routes/admin.routes.ts` | CRUD clientes, pagos approve/reject, labels, cuentas bancarias |
| `src/routes/event.routes.ts` | Eventos/sorteos |
| `src/routes/notification.routes.ts` | Push notifications (VAPID), subscribe/unsubscribe/send, popup templates |
| `src/routes/push-automation.routes.ts` | Push automation programado, campañas, inactividad, event triggers |
| `src/routes/analytics.routes.ts` | Métricas y analytics |
| `src/routes/palta.routes.ts` | Palta wallet endpoints + test-popup + debug-sockets |
| `src/services/data.service.ts` | CRUD sobre store.json (clientes, chats, pagos, eventos, actividad, push subscriptions, popups) |
| `src/services/palta.service.ts` | Scraper Palta Wallet (Puppeteer), auto-approve, name matching, multi-page scanning |
| `src/services/ocr.service.ts` | OCR con OpenAI Vision (gpt-4o-mini) para comprobantes |
| `src/services/push.service.ts` | Web Push notifications (VAPID auto-generation) |
| `src/services/analytics.service.ts` | Cálculo de métricas |

### Frontend Admin (frontend/src/)
| Archivo | Función |
|---------|---------|
| `App.jsx` | Router principal con todas las rutas |
| `components/Layout.jsx` | Sidebar con 12 nav items |
| `pages/Chats.jsx` | Panel de chats en tiempo real |
| `pages/Clients.jsx` | CRUD clientes |
| `pages/PaltaWallet.jsx` | Dashboard Palta (820 líneas) — status, config, transacciones, matching |
| `pages/Analytics.jsx` | Dashboard analytics (732 líneas) — DAU, revenue, retention, gráficos |
| `pages/Events.jsx` | Eventos y sorteos |
| `pages/Notifications.jsx` | Push notifications |
| `pages/Users.jsx` | Usuarios admin |
| `pages/Accounts.jsx` | Cuentas bancarias |
| `pages/Commands.jsx` | Comandos del bot |
| `pages/AutoMessages.jsx` | Mensajes automáticos |
| `pages/ApiConfig.jsx` | Configuración de APIs externas |
| `pages/Settings.jsx` | Ajustes generales |
| `api.js` | Todas las funciones fetch al backend |

### Widget (public/)
| Archivo | Función |
|---------|---------|
| `public/widget.html` | Widget del jugador (~3800 líneas) — identificación + chat + 463.life iframe. Funciona standalone (/widget) y como fuente para embed |
| `public/casino-widget.js` | **Script embeddable** (patrón TitanWidget) — fetch /widget + DOM injection (NO iframe para widget) |
| `public/embed-example.html` | Ejemplo de cómo usar el widget embeddable |
| `public/sw.js` | Service Worker — cache, push notifications, notification click |
| `public/casino.html` | Wrapper page (463.life + login + widget) |
| `public/index.html` | SPA fallback para admin |
| `public/login.html` | Login page admin (standalone) |
| `public/manifest.json` | PWA manifest |

---

## Widget: Flujo de Identificación y Login (estilo ganaya.live/TitanWidget)

### Arquitectura Visual del Widget
```
┌─────────────────────────────────────────────┐
│  PÁGINA (localhost:4000/widget)              │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  IFRAME (463.life) - FULL SCREEN    │ z:0│
│  │  ← Sitio del casino de fondo       │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌──────────┐                               │
│  │  WIDGET  │ z:9999 (flota encima)         │
│  │  Chat    │                               │
│  └──────────┘                               │
│                                             │
│  ● Burbuja dorada (abajo-derecha)    z:9999 │
└─────────────────────────────────────────────┘
```

### Pantalla de Identificación (cuando NO hay sesión)
```
+----------------------------------+
│  Identificación            [–][X]│  ← Header (título dinámico)
│                                  │
│         ⭐ (ícono dorado 72px)   │
│                                  │
│      Identificación              │
│                                  │
│  Bienvenido. Por favor,         │
│  ingresá a tu cuenta para       │
│  abrir el chat.                 │
│                                  │
│  [======= Entra aquí =======]  │  ← Botón dorado full-width
│                                  │
+----------------------------------+
```

### Flow Completo de Login (copiado de ganaya.live)
```
1. Usuario abre widget → ve pantalla "Identificación" con botón "Entra aquí"
2. Click "Entra aquí" → iframe navega a 463.life/auth + widget se CIERRA
3. Usuario ve 463.life a pantalla completa → se loguea normalmente
4. 463.life envía postMessage({tipo: "login", usuario: "xxx"}) al parent
5. Widget detecta el login → autoLoginByUsername(usuario)
6. Widget se AUTO-ABRE con el chat listo y botones de menú
```

### Flow de Logout (sincronizado con 463.life)
```
1. 463.life envía postMessage({tipo: "logout"}) al parent
2. Widget detecta el logout →
   - Desconecta socket
   - Borra estado (chatId, clientId, visitorName, credenciales)
   - Limpia mensajes del chat
   - Vuelve a pantalla "Identificación"
   - Cierra panel del widget
   - Resetea iframe a 463.life (home)
```

### postMessage Protocol (widget ↔ 463.life)
| Dirección | Mensaje | Datos | Acción |
|-----------|---------|-------|--------|
| iframe → widget | `{tipo: "login"}` | `token`, `usuario` | Auto-login + abrir widget |
| iframe → widget | `{tipo: "logout"}` | ninguno | Desconectar + volver a identificación |
| iframe → widget | `{type: "casino-login"}` | `username`, `password` | Login con credenciales |

### Header Dinámico
- Cuando muestra pantalla de identificación: título = **"Identificación"**
- Cuando muestra el chat: título = **"Casino 463"**
- Controlado por `showPrechatForm()` y `showChatArea()`

### Otros Métodos de Login (se mantienen como fallback)
- **URL params:** `?u=USUARIO&p=PIN` → `autoLoginFromIframe()` directo
- **Auto-login por username:** `POST /api/chat/widget/auto-login` (solo username)
- **Login completo:** `POST /api/chat/widget/login` (username + password)
- **Session resume:** localStorage guarda chatId + visitor data → `resumeChat()`

---

## Widget: Botón "Volver" en Todas las Etapas

### Backend (`chat.routes.ts`)
En `processAutomation()`, ANTES de la state machine, se detecta globalmente:
```
Palabras: "volver", "menu", "inicio", "cancelar", "__volver__"
→ Resetea a state: "options"
→ Emite chat:state-changed + chat:show-buttons
```

### Frontend (widget.html)
`showButtonsForState(chatState)` muestra "↩ Volver" en cada estado:
- `options/welcome/idle` → Menú principal (sin volver)
- `carga_cuenta` → CBU | ALIAS | ↩ Volver (inline, single-row)
- `carga_comprobante` → 📸 Subir Comprobante + ↩ Volver (al lado)
- `retiro_datos/soporte/cuponera` → Solo ↩ Volver
- `carga_verificando/retiro_procesando` → Solo ↩ Volver

CSS: `.quick-btn.back-btn` — fondo gris sutil, borde blanco tenue, más chico que los botones normales.

---

## Flujo del Chat (State Machine)
El widget tiene un state machine en `chat.routes.ts`:
```
options → deposito/retiro/soporte/historial/evento
deposito → carga_cuenta → carga_comprobante → carga_verificando → (OCR + Palta match) → auto-approve
retiro → retiro_datos → retiro_procesando → pending
soporte → agent_queue → agente humano
Cualquier estado + "volver" → options (reset)
```

### Botones del Menú Principal
```
💰 Cargar  |  💸 Retirar
🤝 Soporte |  🎁 Cuponera
[🎰 ¡PARTICIPAR DEL EVENTO!]  ← Solo si hay evento activo
```
Los botones son configurables: enabled/disabled, tipo chat o link externo (`POST /api/admin/options`).

---

## Flujo Comprobante → Palta → Fichas Automáticas
1. Jugador sube foto comprobante en el chat
2. OCR (OpenAI Vision gpt-4o-mini) extrae: monto, banco, titular, CBU, fecha
3. Se crea Payment pendiente en store.json
4. Palta scraper hace poll a palta.com.ar (Puppeteer, cada 60s)
5. **Escanea 3 páginas** de transacciones (scroll + click load more, acumula resultados)
6. Deduplicación por `_id` de transacciones
7. Matching por nombre (exact 100%, partial 90%, fuzzy 75%) + monto exacto
8. Si match con confianza ≥ 75% → `autoApprovePayment()`:
   - Payment → approved
   - Client balance += amount
   - Chat state → options
   - Socket emite `payment:approved` a rooms `chat:` y `client:`
   - Popup de "¡FICHAS CARGADAS!" en el widget

### Palta Multi-Page Scanning
- `capturedPageCount` cuenta páginas interceptadas
- Interceptor acumula actividades en `capturedActivities[]` (no sobreescribe)
- `getActivities()` hace scroll al fondo + click en botón "load more" hasta 3 páginas
- Log: `[Palta] 📡 Página X: Y transacciones (total acumulado: Z)`
- TypeScript workaround: `as unknown as PaltaActivity[]` por narrowing issues con null

---

## Popups Especiales del Widget
- `payment:approved` → Popup verde "¡FICHAS CARGADAS!" con confetti y monto
- `withdrawal:approved` → Popup azul "¡RETIRO ENVIADO!" con confetti y monto
- Función: `showSpecialPopup({type, amount, message})`
- Se emite a AMBAS rooms: `chat:${chatId}` y `client:${clientId}`
- Test endpoint: `POST /api/palta/test-popup` con `{chatId, clientId, type, amount}`
- Debug sockets: `GET /api/palta/debug-sockets` muestra rooms y sockets conectados
- También hay debug endpoint en index.ts: `POST /api/debug/test-popup`

---

## Socket.IO Rooms
- `agents` — todos los sockets del admin panel
- `agent:${agentId}` — agente específico
- `chat:${chatId}` — conversación específica (widget + admin)
- `client:${clientId}` — cliente específico (via widget:identify)

### Socket Events (widget recibe)
| Evento | Datos | Acción |
|--------|-------|--------|
| `message:new` | msg object | Agregar mensaje al chat |
| `typing:start/stop` | sender | Mostrar/ocultar indicador |
| `chat:resolved` | — | Mostrar banner "chat finalizado" |
| `chat:show-buttons` | buttons[], showOptions | Mostrar botones dinámicos |
| `chat:state-changed` | state | Actualizar botones según estado |
| `popup:show` | title, body, etc | Mostrar popup overlay |
| `event:started/ended` | event data | Mostrar/ocultar banner de evento |
| `event:winner` | prize data | Popup "¡GANASTE!" |
| `payment:approved` | chatId, amount, type | Popup "¡FICHAS CARGADAS!" |
| `withdrawal:approved` | chatId, amount | Popup "¡RETIRO ENVIADO!" |

---

## Push Notifications (completo)

### Backend
- `push.service.ts` — VAPID auto-generation, `sendToSubscription()`, `sendToMultiple()`
- `notification.routes.ts` — CRUD subscriptions, send manual, popup templates, history
- `push-automation.routes.ts` — Campañas programadas, reglas de inactividad, triggers por evento, quiet hours, segmentación

### Widget (sw.js + widget.html)
- Service Worker registrado en `/sw.js`
- Push event listener muestra notificación nativa
- Notification click abre/enfoca widget
- Subscribe flow: VAPID key → pushManager.subscribe → POST /api/notifications/subscribe
- Push banner aparece después de login si no está suscripto (cooldown 2h)

### PWA
- manifest.json con icons
- Install banner (Android/Chrome + iOS instrucciones)
- Cache-first para static, network-first para API
- Offline fallback a /widget

---

## Event System (Sorteos)
- Crear evento desde admin: nombre, descripción, premio, depósito mínimo, duración
- Banner flotante arriba de la página con countdown timer
- Mini banner dentro del chat
- Botón "🎰 ¡PARTICIPAR DEL EVENTO!" en menú principal
- Join endpoint: `POST /api/events/:id/join`
- Winner selection + claim prize
- Socket events: `event:started`, `event:ended`, `event:winner`, `event:prize-claimed`

---

## Promo Bubble System
- 8 mensajes promocionales rotan cada 30 segundos
- Burbuja aparece cerca del botón del widget
- Auto-hide después de 6 segundos
- Click en burbuja → abre widget
- No aparece si widget está abierto

---

## Usuarios de Prueba
| Tipo | Usuario | Password | ID | chatId |
|------|---------|----------|----|--------|
| Admin | admin@gana463.com / admin | 123456 | 1 | — |
| Admin | boss@gana463.com / boss | admin123 | 2 | — |
| Cliente | testlogin556666 | testing2025 | 1 | e963f3d0-dc42-4f72-b5ec-78af4e0af8f4 |
| Cliente | boss463 | boss123 | 252 | — |
| Cliente | xxpruebax2 | prueba123 | 253 | — |

---

## Endpoints Importantes
| Endpoint | Método | Función |
|----------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/auth/login` | POST | Login admin |
| `/api/chat/widget/login` | POST | Login widget (username+password) |
| `/api/chat/widget/auto-login` | POST | Auto-login (solo username) |
| `/api/chat/widget/message` | POST | Enviar mensaje desde widget |
| `/api/chat/widget/upload` | POST | Upload comprobante (base64 → OCR) |
| `/api/admin/clients` | GET | Listar clientes |
| `/api/admin/payments` | GET | Listar pagos |
| `/api/admin/payments/:id/approve` | POST | Aprobar pago |
| `/api/admin/payments/:id/reject` | POST | Rechazar pago |
| `/api/admin/options` | GET/PUT | Config botones del widget |
| `/api/admin/api-config/:section` | GET/PUT | Config APIs (openai/casino/aws/openrouter) |
| `/api/palta/status` | GET | Estado del scraper Palta |
| `/api/palta/start` | POST | Iniciar scraper |
| `/api/palta/stop` | POST | Detener scraper |
| `/api/palta/poll` | POST | Forzar poll manual |
| `/api/palta/config` | GET/PUT | Config de Palta (headless, interval, credentials) |
| `/api/palta/test-popup` | POST | Probar popup en widget |
| `/api/palta/test` | POST | Health-check real (browser + login + datos) |
| `/api/palta/debug-sockets` | GET | Ver rooms de socket activas |
| `/api/debug/test-popup` | POST | Debug popup directo desde index.ts |
| `/api/events/active` | GET | Evento activo actual |
| `/api/events/:id/join` | POST | Unirse a evento |
| `/api/analytics/overview` | GET | KPIs generales |
| `/api/analytics/active-users` | GET | Serie temporal usuarios activos |
| `/api/analytics/financial` | GET | Depósitos vs retiros |
| `/api/analytics/retention` | GET | Cohortes de retención |
| `/api/notifications/vapid-public-key` | GET | VAPID public key |
| `/api/notifications/subscribe` | POST | Registrar push subscription |
| `/api/notifications/send` | POST | Enviar push notification |
| `/api/push-automation/status` | GET | Estado push automation |

---

## Configuración de APIs desde el Panel
La página `/apis` (ApiConfig.jsx) permite configurar desde el UI:
- **OpenAI** (🧠) — API Key + Modelo para OCR de comprobantes. Al guardar reconfigura `ocrService` en vivo
- **Casino 463** (🎰) — Token + URL de la API del casino
- **AWS** (☁️) — Access Key, Secret Key, Region
- **OpenRouter** (🤖) — API Key + Modelo

Las keys se guardan en `store.json > apiConfig` y se enmascaran en el GET.
Prioridad de OpenAI key: stored config > .env fallback.

---

## Widget Embeddable (casino-widget.js) — Patrón TitanWidget/ganaya.live

### ARQUITECTURA: DOM Injection (NO iframe para el widget)
```
┌──────────────────────────────────────────┐
│  HOST PAGE (cualquier website)           │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ iframe (463.life) z:1              │  │  ← Background (solo modo 'full')
│  │ pointer-events: auto               │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ div#casino463-root z:1000          │  │  ← Widget container (DOM directo)
│  │ pointer-events: NONE               │  │     clicks pasan al bg-iframe
│  │                                    │  │
│  │  ● Burbuja (pointer-events: auto)  │  │  ← Botón toggle
│  │  ▣ Panel   (pointer-events: auto)  │  │  ← Chat flotante
│  │  ▣ Banners, Popups, etc.           │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**Diferencia clave vs versión anterior:** El widget ya NO usa iframe. Inyecta CSS + HTML + JS directamente en el DOM de la página, exactamente como hace TitanWidget de ganaya.live. Esto permite que `pointer-events: none` funcione correctamente para que los clicks pasen a 463.life.

### Cómo funciona internamente
```
1. Página carga casino-widget.js (script externo)
2. CasinoWidget.init() →
   a. Crea iframe para 463.life (z:1, pointer-events:auto)
   b. Fetch /widget del servidor → obtiene widget.html
   c. Parsea HTML con DOMParser
   d. Extrae CSS → inyecta como <style> en el <head>
   e. Extrae HTML (menos bg-iframe) → inyecta en div#casino463-root
   f. Carga Socket.IO desde CDN
   g. Ejecuta el JS del widget directamente en la página
3. Widget funciona como si estuviera en /widget, pero SIN iframe
4. postMessages de 463.life llegan directo (mismo documento)
```

### Código para Instalar (copiar y pegar en cualquier HTML)
```html
<!-- Modo FULL: 463.life de fondo + widget flotante encima -->
<script src="https://TU-SERVIDOR/casino-widget.js"></script>
<script>
  CasinoWidget.init({
    serverUrl: 'https://TU-SERVIDOR',  // opcional si el script se carga del mismo server
    siteUrl: 'https://463.life',       // opcional, URL del fondo (default: 463.life)
    // autoLogin: { username: 'user', password: 'pass' },  // opcional
    // position: 'full'  // 'full' (default) o 'corner' (solo chat flotante)
  });
</script>
```

### Modos
| Modo | Descripción | Uso |
|------|-------------|-----|
| `full` (default) | 463.life iframe de fondo (z:1) + widget DOM (z:1000) | Para páginas wrapper (como ganaya.live) |
| `corner` | Solo widget flotante, sin bg-iframe | Para instalar en 463.life u otra página existente |

### API Programática
```javascript
CasinoWidget.login('usuario', 'password');   // Forzar login
CasinoWidget.logout();                        // Forzar logout
CasinoWidget.navigate('https://url');          // Navegar iframe de fondo
CasinoWidget.toggle(true/false);               // Abrir/cerrar widget
CasinoWidget.destroy();                        // Remover widget completamente
```

### Archivos Involucrados
| Archivo | Rol |
|---------|-----|
| `public/casino-widget.js` | Loader + injector (~320 líneas) — fetch /widget, parsea, inyecta CSS+HTML+JS en DOM |
| `public/widget.html` | Widget completo (~3800 líneas) — funciona standalone en /widget Y como fuente para embed |
| `src/index.ts` | `GET /widget` sirve widget.html con CORS headers |
| `public/embed-example.html` | Demo page con documentación |

### Globals de Integración (widget.html ↔ casino-widget.js)
casino-widget.js setea estos globals ANTES de ejecutar el JS del widget:
| Global | Valor | Propósito |
|--------|-------|-----------|
| `__casino463_serverUrl` | URL del server | API_BASE del widget usa este valor |
| `__casino463_embedMode` | `true` | Desactiva Service Worker y PWA install |
| `__casino463_bgIframeId` | `'casino463-bg-iframe'` | `getBgIframe()` usa este ID |

El widget expone estos globals para el API programático:
| Global | Función |
|--------|---------|
| `__casino463_autoLogin(u, p)` | Login con credenciales |
| `__casino463_autoLoginByUsername(u)` | Login solo con username |
| `__casino463_toggleWidget(open)` | Abrir/cerrar widget |

---

## Referencia: ganaya.live (TitanWidget) — YA IMPLEMENTADO
Analizamos esta página como referencia y **ahora usamos el mismo patrón**:
- TitanWidget: React 19 bundled (~418KB), DOM injection, iframe solo para 463.life
- **Nuestro widget: vanilla JS (~320 líneas loader + 3800 líneas widget), DOM injection, iframe solo para 463.life**
- Ambos usan: `pointer-events: none` en container + `pointer-events: auto` en hijos interactivos
- Ambos cargan 463.life en iframe z:1 y el widget en container z:1000
- Nuestro loader (casino-widget.js) hace fetch + parse + inject en vez de bundle estático
- Pantalla de identificación: "Entra aquí" → navega iframe a /auth → cierra widget
- postMessage protocol: `{tipo: "login", token, usuario}` y `{tipo: "logout"}`
- Auto-login: token en localStorage key "acc", polling cada 30s (solo TitanWidget)
- Nuestro widget replica este flow completo en vanilla JS

---

## Notas Técnicas
- store.json se lee en memoria al iniciar, cambios directos en el JSON requieren restart del backend
- El widget.html es un archivo monolítico vanilla JS (~3800 líneas), no usa React
- Los clientes tienen campo `usuario` y `clave` (no `username`/`password`)
- El OCR usa gpt-4o-mini (más barato y rápido que gpt-4o), configurable desde panel APIs
- Palta Wallet usa Puppeteer con chrome-profile persistente en `data/palta-session/`
- Palta tiene modo **headless** (configurable desde panel Config): ON para servidor, OFF para login manual
- Al reiniciar el servidor, `paltaService.fixStaleStatus()` corrige estados inconsistentes
- Botón "🧪 Probar Conexión" verifica: browser abierto → logueado → puede leer datos
- Botón "Reiniciar en Modo Visible" aparece cuando Palta está en login_required + headless
- VAPID keys están en .env para push notifications
- Las API keys se pueden configurar de 2 formas: .env (hardcoded) o panel APIs (dinámico, prioridad)
- TypeScript: `capturedActivities` usa `as unknown as PaltaActivity[]` por narrowing issues con async interceptor

## Cosas Pendientes
- [ ] Verificar que 463.life/auth existe y funciona correctamente
- [ ] Verificar que el postMessage logout se dispara desde 463.life al hacer logoff
- [ ] Testear popup fichas cargadas con usuario conectado al widget
