# Cartucho Music — Análisis de viabilidad técnica

> Fecha del análisis: 14 de noviembre de 2026.
> Las políticas de Spotify y Apple cambian con frecuencia. Antes de cada fase de integración, revisar los changelogs oficiales enlazados al final.

## Resumen ejecutivo

| Área | Viabilidad | Comentario |
|---|---|---|
| App de escritorio Tauri + React | ✅ Alta | Toolchain disponible (Node 24, Rust 1.99). |
| Spotify: OAuth, perfil, biblioteca, búsqueda | ✅ Alta | PKCE sin client secret. Sujeto a límites del Development Mode. |
| Spotify: control remoto (Spotify Connect vía Web API) | ✅ Alta | Requiere Premium del usuario. Controla un dispositivo Spotify oficial. |
| Spotify: reproducción dentro de la app (Web Playback SDK) | ✅ Confirmada en Windows | Fase 3: licencia Widevine concedida y audio reproducido en el dispositivo «Cartucho Music» con una cuenta Premium real (Development Mode). |
| Spotify: recomendaciones, related artists, audio features | ❌ No disponible | Retirado para apps nuevas desde nov. 2024. |
| Spotify: letras | ❌ No disponible | No existe API pública de letras. |
| Apple Music: catálogo y búsqueda | ✅ Alta | Requiere Developer Token firmado en servidor. |
| Apple Music: biblioteca del usuario | ⚠️ Media | Hay problemas de `authorize()` reportados en WebViews embebidos. |
| Apple Music: reproducción completa | ⚠️ Incierta | DRM (EME) dentro de WebView2/WKWebView sin verificar. |
| Apple Music: letras sincronizadas | ❌ No disponible | El endpoint de letras no está abierto a terceros. |
| Fusionar catálogos en una cola o playlist común | ❌ No permitido | Cada servicio opera aislado (ver políticas). |

**Conclusión:** el proyecto es viable como cliente unificado de **navegación y control**, con cada servicio aislado. El riesgo principal es la **reproducción embebida con DRM dentro de Tauri**. Hay que validarla con una prueba de concepto antes de diseñar la Fase 4 en torno a ella.

---

## 1. Spotify

### 1.1 Autenticación
- **Flujo:** Authorization Code con **PKCE**. No necesita client secret, así que nada sensible va en el instalador.
- **Redirect URI:** Spotify exige una IP de loopback literal y no acepta `localhost`. El resto de URIs requieren HTTPS. Con loopback el puerto puede ser dinámico: se registra `http://127.0.0.1/callback` y Rust abre un servidor efímero en un puerto libre, abre el navegador del sistema y captura el `code`, validando el `state`.
- **Tokens:** el access token dura unos 60 minutos y el refresh token rota en cada renovación. Se guardan en el **almacén seguro del sistema** (Windows Credential Manager / macOS Keychain / Secret Service) mediante el crate `keyring`, nunca en `localStorage` ni en SQLite.
- **El client ID no es secreto:** se puede distribuir.

### 1.2 Development Mode (cambios de febrero de 2026)
- El **propietario de la app necesita Spotify Premium** activo.
- Máximo **5 usuarios** en la allowlist por app. La cuota se cuenta por cuenta de desarrollador (julio de 2026).
- **Extended Quota** solo se concede a empresas establecidas con gran base de usuarios. En la práctica, Cartucho Music funcionará para el desarrollador y hasta 4 personas más.
- Endpoints restringidos en Development Mode: novedades (`new-releases`), top tracks de artista, perfiles de otros usuarios, lecturas masivas (varios IDs), sellos discográficos, y popularidad o seguidores de artistas, entre otros. Spotify revirtió parte de estas restricciones (`external_ids` y `available_markets`).
- Retirado desde noviembre de 2024 para apps nuevas: **Recommendations**, **Related Artists**, **Audio Features/Analysis**, **Featured/Category Playlists**, playlists algorítmicas o editoriales de Spotify y `preview_url`.

Otros cambios de febrero de 2026, ya aplicados en el conector:
- **Biblioteca:** guardar, quitar y comprobar usan `PUT`/`DELETE`/`GET /me/library[/contains]?uris=…` (máximo 40 URIs).
- **Playlists:** el campo `tracks` pasa a `items` y cada entrada `track` pasa a `item`. El contenido solo llega en playlists propias o colaborativas.
- **Búsqueda:** `limit` máximo de 10.
- **Perfil:** `GET /me` ya no devuelve `product`, así que el Premium se detecta por el 403 `PREMIUM_REQUIRED`.
- **Lectura por lotes:** `GET /albums?ids=…` y similares desaparecen; cada elemento se pide por separado (con caché).

**Consecuencias para el diseño:**
- "Recomendaciones" (Inicio/Explorar) **no se mostrarán para Spotify**. La sección se oculta según `capabilities`.
- "Artistas más escuchados" usa `GET /me/top/artists`, que sigue disponible.
- "Reproducciones recientes" usa `GET /me/player/recently-played`.
- Las páginas de artista no tendrán "Top canciones" mientras la app esté en Development Mode.

### 1.3 Reproducción
Hay dos mecanismos oficiales:

1. **Web Playback SDK:** crea un dispositivo Spotify Connect dentro de la app.
   - Requiere **Premium** y **EME/Widevine**.
   - **Windows (WebView2, basado en Chromium/Edge):** sin confirmar. Hay reportes de fallos de licencia Widevine en Electron, y otros de que `player.connect()` queda pendiente en Development Mode desde 2026.
   - **macOS (WKWebView):** sin Widevine. **No viable.**
   - **Linux (WebKitGTK):** sin Widevine. **No viable.**
2. **Spotify Connect remoto (Web API `/me/player/*`):** controla un dispositivo oficial (app de escritorio, móvil, altavoz).
   - Requiere Premium.
   - **Funciona en todas las plataformas.**

**Resultado de la prueba de concepto (Fase 3, 14-11-2026, Windows 11, WebView2 157):**
- `requestMediaKeySystemAccess` admite `com.widevine.alpha` y `com.microsoft.playready`, y crea `MediaKeys`.
- `https://sdk.scdn.co/spotify-player.js` se carga en unos 180 ms y expone `Spotify.Player`.
- **Confirmado con una cuenta Premium real:**
  - El SDK llega a `ready` en Development Mode.
  - Spotify concede la licencia Widevine.
  - La reproducción avanza en el dispositivo «Cartucho Music» (33,4 s → 38,7 s en 5 s).
  - Si en otro equipo no hay `ready` en 20 s, la app lo indica y sigue como mando remoto.
- macOS y Linux siguen sin Widevine en el WebView del sistema.

**Decisión:** el modo base de Spotify será el **control remoto Connect**. El Web Playback SDK queda como mejora opcional que se activa solo si la prueba de concepto de la Fase 3 confirma que funciona en WebView2. Si no hay dispositivo activo, la UI lo dice claramente ("Abre Spotify en algún dispositivo"). **Nunca se simula reproducción.**

### 1.4 Cola
- `GET /me/player/queue` permite leer la cola y `POST /me/player/queue` permite añadir.
- **No existen endpoints para reordenar ni eliminar.**
- **Solución (1.0.1):** Cartucho gestiona la lista. Al quitar o reordenar:
  - Toma la canción actual y las siguientes: el álbum o la playlist completos si los lanzó Cartucho, o si no la cola que informa Spotify.
  - Aplica el cambio.
  - Reenvía la lista con `PUT /me/player/play` (`uris`, `offset: 0`, `position_ms` de la canción actual).
- **Efectos de esta solución:**
  - Puede notarse un corte breve al aplicar cada cambio.
  - El aleatorio se desactiva para que no desordene la lista.
  - Las canciones que otras apps de Spotify añadan a su cola nativa quedan fuera del control de Cartucho.
  - Como máximo se gestionan 100 canciones.

### 1.5 Límites de solicitudes
- Ventana móvil de 30 segundos. Al superarla, la API responde `429` con `Retry-After`.
- Plan: cliente HTTP con backoff que respeta `Retry-After`, deduplicación de solicitudes en vuelo, caché de metadatos con TTL y polling del estado de reproducción adaptativo (más frecuente mientras suena, pausado si la ventana está oculta).

### 1.6 Políticas a respetar
- **Developer Policy y Design Guidelines:** atribuir con el logo y el nombre de Spotify, enlazar al contenido en Spotify, no modificar portadas ni metadatos, y no mezclar contenido de Spotify con el de otros servicios en una misma experiencia reproducible.
- El uso comercial requiere un acuerdo aparte con Spotify.
- No se puede usar contenido de Spotify para entrenar modelos de IA.

---

## 2. Apple Music

### 2.1 Requisitos
- **Apple Developer Program** (99 USD al año), un identificador MusicKit y una clave privada `.p8`.
- **Developer Token:** un JWT ES256 con validez máxima de 6 meses, que incluye `origin` en MusicKit JS. **Debe firmarse en un servidor** (función serverless mínima). La clave `.p8` **jamás** va en el instalador.
- **Music User Token:** se obtiene con `MusicKit.authorize()`, que abre el inicio de sesión de Apple ID en un popup. Hay que gestionar `window.open` desde Tauri. Hay reportes de que `authorize()` no resuelve en WebViews nativos.

### 2.2 Origen de la app
Tauri v2 sirve la UI desde `http://tauri.localhost` (Windows) o `tauri://localhost` (macOS). Ese origen debe ser aceptado por el claim `origin` del token, y está **sin verificar**. Hay que hacer una prueba de concepto antes de la Fase 5.

### 2.3 Reproducción
- MusicKit JS usa EME: FairPlay en Safari y Widevine/PlayReady en Chromium.
- Dentro de WebView2 o WKWebView está **sin verificar**.
- La reproducción completa requiere suscripción a Apple Music. Sin ella solo hay previews de 30 s, que deben etiquetarse como tales.

### 2.4 Funciones disponibles
- Catálogo, búsqueda, biblioteca, playlists, recomendaciones (`/me/recommendations`), recientes (`/me/recent/played`) y rotación (`/me/history/heavy-rotation`).
- La **cola** se gestiona del lado del cliente con MusicKit JS, por lo que se puede reordenar y eliminar.
- **Letras:** no hay endpoint público para terceros.

---

## 3. Letras
Ningún proveedor ofrece letras a terceros.

- Existen fuentes comunitarias (p. ej. LRCLIB), pero sus licencias de letras son dudosas.
- **Decisión:** el módulo `features/lyrics` existe con una interfaz `LyricsSource`, pero **queda desactivado**. La UI solo muestra el botón de letras cuando una fuente autorizada declara la capacidad.

## 4. Riesgo principal: DRM en Tauri
Cider usa Electron con una build de Chromium que incluye Widevine con firma VMP (castlabs ECS). Tauri usa el WebView del sistema, sobre el que no controlamos el CDM.

- **Si las pruebas de concepto de las Fases 3 y 5 fallan:**
  - (a) Spotify en modo Connect remoto, que ya es la decisión base.
  - (b) Apple Music limitado a navegación y previews.
  - (c) Reevaluar Electron + castlabs ECS. Esto rompe el requisito de usar Tauri y requiere decisión explícita del propietario.

## 5. Arquitectura derivada
- La interfaz `MusicProvider` es común a todos los servicios.
- Cada proveedor publica un objeto **`ProviderCapabilities`** explícito (p. ej. `queue.reorder: false` en Spotify). Los componentes de UI consultan capacidades, no nombres de servicio.
- Los resultados de búsqueda llevan siempre `provider`. No existe ningún tipo "colección mixta reproducible".
- Los tokens van en el keychain del SO (Rust). SQLite guarda solo preferencias, caché de metadatos e historial local.
- El backend de firma de Apple vive en un proyecto separado (`/server`, Fase 5).

## Fuentes
- [Spotify — Migration guide Feb 2026](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Spotify — Web API quota updates (julio 2026)](https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates)
- [Spotify — Changelog julio 2026](https://developer.spotify.com/documentation/web-api/references/changes/july-2026)
- [TechCrunch — cambios del Developer Mode](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/)
- [Spotify — Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk)
- [Spotify Community — Widevine en Electron](https://community.spotify.com/t5/Spotify-for-Developers/Issue-using-Widevine-DRM-development-license-in-an-Electron-app/m-p/6068831/highlight/true)
- [Spotify Community — player.connect() pendiente en Development Mode](https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-player-connect-never-resolves-in-Development/td-p/7392190)
- [Apple Developer Forums — MusicKit JS](https://developer.apple.com/forums/tags/musickit-js)
- [Apple Developer Forums — Authorization error en Chrome/Edge](https://developer.apple.com/forums/thread/770988)
