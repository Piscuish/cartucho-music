# Cartucho Music

Cliente musical de escritorio para Windows (Tauri + React + TypeScript) con identidad propia y muy personalizable. Se conecta a Spotify a través de sus APIs oficiales. Apple Music está preparado pero en pausa.

> Antes de tocar las integraciones, lee **[docs/VIABILIDAD.md](docs/VIABILIDAD.md)** (restricciones de las APIs, políticas y riesgos) y **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)**.

## Estado — versión 1.0.0

| Fase | Estado |
|---|---|
| 0. Análisis de viabilidad | ✅ `docs/VIABILIDAD.md` |
| 1. Identidad visual y prototipo navegable | ✅ |
| 2. Arquitectura (SQLite, keychain, contrato de proveedores) | ✅ `docs/ARQUITECTURA.md` |
| 3. Spotify: OAuth PKCE, conector y Web Playback SDK | ✅ Verificado con una cuenta real (audio integrado incluido) |
| 4. Biblioteca, búsqueda y reproducción reales | ✅ Scroll infinito, listas virtualizadas, filtro sobre la biblioteca completa, menú de canción, búsqueda paginada |
| 5. Apple Music: servidor de Developer Token y MusicKit | ⏸ En pausa (requiere Apple Developer Program). Oculto por defecto; se reactiva en Ajustes → Servicios. |
| 6. Personalización avanzada | ✅ Temas (incl. Sistema y OLED), acento libre, tipografía, esquinas, 4 fondos, Inicio y barra lateral configurables, Reproduciendo y diseños propios |
| 7. Funciones nativas | ✅ Bandeja, cerrar a bandeja, instancia única, teclas multimedia, notificaciones, Media Session, inicio con Windows, estado de ventana |
| 8. Pruebas, optimización y empaquetado | ✅ Fuentes locales, código dividido por pantallas, CSP estricta, instalador NSIS |

## Instalar

El instalador se genera en:

```
src-tauri/target/release/bundle/nsis/Cartucho Music_1.0.0_x64-setup.exe
```

- Se instala para el usuario actual, sin pedir permisos de administrador.
- Si falta WebView2, el instalador lo descarga.

### Conectar Spotify
1. En el [dashboard de Spotify](https://developer.spotify.com/dashboard), registra la Redirect URI `http://127.0.0.1/callback` (sin puerto).
2. En **Ajustes → Servicios conectados**, pega el **Client ID** y pulsa **Conectar con Spotify**.

No hace falta el Client Secret: el login usa PKCE en el navegador del sistema y los tokens se guardan en el almacén seguro de Windows.

## Desarrollo

App de escritorio con recarga en caliente:

```bash
npm run tauri dev
```

Solo la interfaz en el navegador (sin Spotify real):

```bash
npm run dev
```

Verificación completa (tipos, pruebas de frontend y pruebas de Rust):

```bash
npm run check
```

Cobertura de pruebas:

```bash
npm run test:coverage
```

Instalador de producción:

```bash
npm run tauri build
```

## Estructura

```
src/
  app/            Enrutado (pantallas cargadas bajo demanda) y QueryClient
  components/     Componentes reutilizables (Cover, TrackList virtualizada, TrackMenu, MediaCard, ui)
  layouts/        AppShell, Sidebar, PlayerBar, DynamicBackground
  pages/          Una por pantalla
  features/       catalog · library · search · home · queue · player · settings · desktop
  providers/      Contrato MusicProvider, registro y capacidades
    spotify/      OAuth (vía Rust), Web API, Spotify Connect, Web Playback SDK
    preview/      Proveedor de vista previa (datos de ejemplo)
    testing/      Suite de contrato reutilizable
  hooks/          Apariencia, esquema de color, atajos, proveedores
  stores/         Zustand: apariencia, reproductor, servicios, escritorio, UI
  database/       kv · caché · historial (SQLite vía Rust; localStorage en el navegador)
  services/       Cliente HTTP, caché persistente, almacén seguro
  styles/         Tokens de diseño, fuentes empaquetadas
src-tauri/src/    db.rs · secrets.rs · spotify.rs · desktop.rs
docs/             Viabilidad y arquitectura
```

## Principios
- Cada entidad lleva `provider`. Los servicios **nunca** se mezclan en una cola o playlist.
- La UI consulta `ProviderCapabilities`, no nombres de servicio, para mostrar u ocultar controles.
- Sin secretos en el cliente ni en el instalador: Spotify usa PKCE, el refresh token nunca sale de Rust, y el token de Apple se firmará en un servidor propio.
- Nunca se simula reproducción con un servicio conectado; los datos de ejemplo siempre se marcan como tales.
