# Cartucho Music — Arquitectura (Fase 2)

## Vista general

```
┌──────────────────────────── UI (React) ────────────────────────────┐
│ pages/ · layouts/ · components/                                    │
│        │ solo usan hooks, nunca importan datos directamente        │
│        ▼                                                           │
│ features/*/queries.ts  (React Query: caché, cancelación, estados)  │
│ stores/player.ts       (reflejo del estado de reproducción)        │
│        │                                                           │
│        ▼                                                           │
│ providers/registry.ts  ── MusicProvider (contrato común) ──┐       │
│   ├─ PreviewProvider   (Fase 1-2, datos de ejemplo)        │       │
│   ├─ SpotifyProvider   (Fase 3)  ── services/http/client ──┤       │
│   └─ AppleMusicProvider(Fase 5)                            │       │
│                                                            │       │
│ database/stores.ts (kv · cache · history)  services/secure-store   │
└───────────────┬────────────────────────────────────┬───────────────┘
                │ invoke (comandos acotados)         │
┌───────────────▼─────────── Rust (Tauri) ───────────▼───────────────┐
│ db.rs: SQLite (kv, cache con TTL, play_history), migraciones       │
│ secrets.rs: keychain del SO, lista cerrada de claves               │
└────────────────────────────────────────────────────────────────────┘
```

## Contrato de proveedores (`src/providers/types.ts`)
Cada servicio implementa `MusicProvider`, que se compone de estos módulos:

| Módulo | Para qué sirve |
|---|---|
| `auth` | Estado de conexión observable, `connect` y `disconnect`. |
| `catalog` | Búsqueda, álbum, playlist, artista, discografía, top canciones y novedades. |
| `library` | Canciones guardadas, álbumes, artistas, playlists, `containsTracks`, guardar y quitar. |
| `personalization` | Recientes, artistas más escuchados y recomendaciones. |
| `playback` | `play(PlayContext)`, transporte, cola y `subscribe` del estado. |

Cada proveedor declara además sus `capabilities`, siguiendo estas reglas:
- **La UI decide con las capacidades, nunca con el nombre del servicio.**
- Una operación no soportada lanza `UnsupportedOperationError`. La suite de contrato lo verifica.
- `PlaybackState.mode` vale `preview` (sin audio), `in-app` o `remote` (Spotify Connect), y la UI lo muestra.
- `PlaybackState.positionMs` + `timestamp`: el proveedor solo emite cambios y la UI interpola la posición (`usePlaybackPosition`). Así se evita hacer polling constante.

**Añadir un servicio nuevo** son cuatro pasos:
1. Añadir su `ProviderId` y sus metadatos en `registry.ts`.
2. Implementar `MusicProvider`.
3. Hacer que supere `runProviderContract`.
4. Llamar a `registry.register()`.

El núcleo no cambia.

## Spotify (Fase 3)

| Pieza | Archivo | Qué hace |
|---|---|---|
| OAuth PKCE | `src-tauri/src/spotify.rs` | Loopback `127.0.0.1:<puerto libre>` con verificación de `state`, login en el navegador del sistema, intercambio de código y renovación con rotación. El refresh token no sale de Rust. |
| Auth | `providers/spotify/auth.ts` | Pide access tokens a Rust y los guarda en memoria. Agrupa las renovaciones concurrentes. Si la sesión se revoca, vuelve a la vista previa. |
| API | `providers/spotify/api.ts` | Valida con zod (`schemas.ts`) y mapea (`mappers.ts`). Caché en SQLite: álbumes y artistas 24 h, playlists 10 min, búsquedas 30 min. |
| Reproducción | `providers/spotify/playback.ts` | Spotify Connect: consulta adaptativa (5 s sonando, 10 s en pausa, 30 s oculta), actualizaciones optimistas y elección de dispositivo. |
| Reproductor integrado | `providers/spotify/webPlayback.ts` | Web Playback SDK si hay Widevine. Aparece como dispositivo «Cartucho Music». |
| Conexión | `providers/spotify/connector.ts` | Restaura la sesión al arrancar, conecta y desconecta, sustituyendo el proveedor en el registro. |

El **Client ID** de la app «Cartucho Music» va incluido (`BUILTIN_SPOTIFY_CLIENT_ID`; `VITE_SPOTIFY_CLIENT_ID` lo sustituye al compilar), así que los usuarios solo pulsan «Conectar». En Ajustes → Servicios → «Usar mi propia app» se puede guardar otro. La Redirect URI `http://127.0.0.1/callback` debe estar registrada en el dashboard de esa app. **No se usa ni se guarda el Client Secret.**

## Escala (Fase 4)
- **Paginación de la biblioteca:** cada proveedor tiene su `useInfiniteQuery` (`useLibraryInfinite`). Al filtrar u ordenar se completa la carga página a página (`useLoadAll`) con progreso visible: unas 2.200 canciones en unos 12 s, respetando los límites de solicitudes.
- **Listas largas:** `TrackList` virtualiza a partir de 80 filas (`@tanstack/react-virtual`, con el contenedor de scroll vía `ScrollContainerContext`). El estado de "guardada" se consulta solo para los bloques visibles de 40.
- **Favoritos:** guardar y quitar actualiza la caché de la lista infinita en lugar de volver a pedir todas sus páginas.
- **Playlists grandes:** la primera página llega con el detalle y el resto con `getPlaylistTracks`.
- **Búsqueda por tipo:** se pagina de 10 en 10. En Development Mode, Spotify devuelve `next: null` aunque haya más resultados, así que una página llena indica que hay más.
- **Fondo dinámico:** limita la luminancia percibida de la paleta para mantener la legibilidad.

## Personalización (Fase 6)
- **Store:** toda la apariencia vive en `stores/appearance.ts` y se guarda en SQLite.
  - Cada campo se valida con zod y cae a su valor por defecto si llega corrupto.
  - Incluye la migración de la v1 (`dynamicBackground: false` → `bgStyle: "off"`).
- **Del store a la interfaz:** `useAppearanceSync` vuelca el estado como atributos `data-*` en `<html>`: `theme`, `oled`, `typeface`, `corners`, `density`, `glass` y `motion`.
  - Los estilos responden con variables CSS: `--radius-*`, `--font-display-face` y la paleta.
  - Ningún componente lleva radios ni fuentes de titular fijos.
- **Tema «Sistema»:** se resuelve en vivo con `prefers-color-scheme` (`useColorScheme`).
- **Cambios estructurales:**
  - Orden y visibilidad de las secciones de Inicio.
  - Entradas ocultables de la barra lateral.
  - Estilos de fondo (`DynamicBackground`).
  - Disposición, fondo, forma de la portada y panel «A continuación» de Reproduciendo.
- **Diseños propios:** instantáneas completas y validadas del estado (máximo 12).

## Escritorio (Fase 7)
| Función | Dónde | Notas |
|---|---|---|
| Bandeja del sistema | `src-tauri/src/desktop.rs` | Menú: mostrar, reproducir/pausar, siguiente, anterior y salir. Las acciones se emiten como `tray-action` al frontend. El tooltip muestra la canción actual. |
| Cerrar a la bandeja | `desktop.rs` (`CloseRequested`) | Configurable. «Salir» del menú cierra de verdad. |
| Instancia única | `tauri-plugin-single-instance` | Una segunda ejecución trae al frente la ventana existente. |
| Estado de ventana | `tauri-plugin-window-state` | Guarda tamaño, posición y maximizado, pero no la visibilidad. |
| Inicio con Windows | `tauri-plugin-autostart` + `--autostart` | Si `startMinimized` está activo (Rust lo lee de `state:desktop` en SQLite), arranca oculta. |
| Teclas multimedia | `tauri-plugin-global-shortcut` | Opcionales: chocan con la app oficial de Spotify si está abierta. El fallo de registro se explica en Ajustes. |
| Notificaciones | `tauri-plugin-notification` | Solo cuando empieza otra canción, y por defecto solo con la ventana oculta (`features/desktop/logic.ts`). |
| Controles de Windows | Media Session API | Metadatos y acciones para la superposición multimedia del sistema. |

## Producción (Fase 8)
- **Fuentes:** empaquetadas con `@fontsource` (solo los pesos usados y el subconjunto latino). La app no hace peticiones a Google y funciona sin conexión.
- **Bundle:** Inicio se carga de inmediato y el resto de pantallas con `React.lazy`. Las librerías van en chunks propios (`react`, `motion`, `tanstack`, `zod`, `icons`). El código de la app pasa de 762 KB a 95 KB.
- **CSP** (en `tauri.conf.json`, solo en release):
  - Únicamente `self` y los dominios oficiales de Spotify: API, imágenes, SDK y su iframe.
  - `object-src 'none'` y `form-action 'none'`.
  - En desarrollo no se aplica (`devCsp: null`) para no interferir con el recargado en caliente de Vite.
- **Instalador:** NSIS por usuario, en español, con bootstrapper de WebView2. No contiene secretos: el Client ID lo introduce el usuario.

## Versión 1.0.1
- **Playlists:**
  - `LibraryModule.addToPlaylist` / `createPlaylist`, con la capacidad `library.playlistWrite`.
  - `Playlist.canEdit` marca las propias o colaborativas: compara `owner.id` con `/me`.
  - En Spotify requiere los scopes `playlist-modify-*`. Las sesiones antiguas lanzan `MissingPermissionError` y la UI ofrece «Reconectar».
- **Cola editable de Spotify:** gestionada por Cartucho (`SpotifyPlayback.managed`). Ver VIABILIDAD §1.4.
- **Actualizador** (`tauri-plugin-updater`):
  - Configurado en `plugins.updater` de `tauri.conf.json`: clave pública y `latest.json` de la última Release.
  - El store vive en `features/updates/updater.ts` y la UI en Ajustes → Actualizaciones, con aviso en la barra lateral.
  - El workflow de Release firma con los secretos `TAURI_SIGNING_PRIVATE_KEY*`.
- **Retirado:** Explorar, porque Spotify retiró las novedades y las categorías. También la sección Audio y las opciones planificadas que no funcionaban.

## Separación entre servicios
- Todas las entidades llevan `provider`, y las rutas de detalle lo incluyen (`/album/:provider/:id`).
- Las claves de React Query empiezan por el proveedor.
- Las búsquedas y la biblioteca se consultan **por proveedor** y se devuelven en trozos separados.
- `PreviewPlayback` rechaza colas que mezclen servicios. `stores/player.ts` pausa el proveedor anterior al reproducir en otro.

## Datos locales
| Dato | Dónde | Notas |
|---|---|---|
| Preferencias (apariencia) | SQLite `kv` | Validadas con zod al leer: un valor corrupto vuelve a su valor por defecto. |
| Caché de metadatos | SQLite `cache` | TTL obligatorio (máximo 30 días) y purga al arrancar. |
| Historial de escucha | SQLite `play_history` | Limitado a 5.000 entradas. |
| Tokens | Keychain del SO | Solo `spotify.session` y `apple-music.user-token`. |

- En el navegador (`npm run dev`) hay un respaldo en localStorage o en memoria, solo para diseñar. Ahí **no hay almacén de secretos**: falla a propósito.
- El frontend **no puede ejecutar SQL**: solo dispone de los comandos de `db.rs`, que validan longitud de clave, tamaño y TTL.

## Red (`src/services/http/client.ts`)
- **429:** respeta `Retry-After` con un tope de 60 s y pausa todas las solicitudes del cliente.
- **5xx y errores de red:** backoff exponencial con jitter, hasta 3 reintentos.
- **401:** una única renovación de sesión (`refreshAuth`) y después `AuthError`.
- **403:** `ForbiddenError`, sin reintentos (p. ej. falta de Premium o estar fuera de la allowlist).
- **Cancelación:** `AbortSignal` de punta a punta. React Query cancela las consultas obsoletas.
- **Deduplicación:** los GET idénticos que están en vuelo se agrupan en uno.
- **Validación:** las respuestas se validan con esquemas zod (`ResponseValidationError`).

## Pruebas
- `npm test`: 127 pruebas con Vitest (`npm run check` ejecuta tipos, Vitest y Rust).
  - Incluye `SpotifyProvider` contra una Web API simulada con estado (`providers/spotify/testing/fakeSpotify.ts`), que pasa la misma suite de contrato.
  - Cliente HTTP.
  - Reproducción de vista previa con reloj simulado.
  - Registro de proveedores.
  - Validación de preferencias.
  - Almacenes.
  - **Suite de contrato** (`providers/testing/contract.ts`), que se ejecuta contra los dos proveedores de vista previa y se reutilizará para Spotify y Apple Music.
- `npm run test:rust`: 13 pruebas.
  - Migraciones, kv, caché con TTL, historial y lista cerrada del keychain.
  - PKCE (con el vector del RFC 7636), análisis del callback (CSRF, denegación, rutas ajenas) y validación del Client ID y los scopes.
