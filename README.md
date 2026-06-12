# MapaJalisco2

Geoportal básico con visor de mapas y panel de administración de capas (vectoriales y raster).

## Stack

- **Backend:** Node.js 20 + Express + PostgreSQL/PostGIS + JWT
- **Frontend:** MapLibre GL JS (visor), HTML/CSS/JS plano (admin)
- **Almacenamiento:** PostgreSQL (metadatos) + filesystem (uploads)

## Características

- Visor interactivo con MapLibre GL (OpenStreetMap base)
- Subida de capas vectoriales (GeoJSON, Shapefile .zip) y raster (GeoTIFF, PNG, JPG)
- Control de capas: visibilidad, opacidad, orden (z_index)
- Estilos configurables por capa (color/grosor línea, relleno, puntos)
- Sistema de roles: **admin** (todo), **editor** (subir/editar capas), **viewer** (solo ver)
- Panel admin con login, gestión de capas y usuarios

## Estructura

```
server/src/
  index.js        # Entrada Express
  config.js       # Variables de entorno
  db/pool.js      # Pool de Postgres
  db/init.js      # Inicialización de esquema y admin
  middleware/auth.js   # JWT + roles
  routes/auth.js  # /api/auth
  routes/users.js # /api/users
  routes/layers.js # /api/layers (CRUD + upload + tile/data)
public/
  index.html      # Visor público
  admin.html      # Panel admin
  login.html      # Login
  js/api.js       # Cliente fetch con token
  js/visor.js     # Lógica del visor
  js/admin.js     # Lógica del admin
uploads/          # Archivos subidos
```

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login (devuelve JWT) |
| GET | `/api/auth/me` | Usuario actual |
| GET | `/api/users` | Listar usuarios (admin) |
| POST | `/api/users` | Crear usuario (admin) |
| DELETE | `/api/users/:id` | Eliminar usuario (admin) |
| GET | `/api/layers` | Listar capas (público) |
| GET | `/api/layers/:id` | Detalle de capa |
| PUT | `/api/layers/:id` | Actualizar capa (admin/editor) |
| DELETE | `/api/layers/:id` | Eliminar capa (admin/editor) |
| POST | `/api/layers/upload/vector` | Subir vector (admin/editor) |
| POST | `/api/layers/upload/raster` | Subir raster (admin/editor) |
| GET | `/api/layers/:id/data` | GeoJSON de la capa |
| GET | `/api/layers/:id/tile/:z/:x/:y.png` | Tile raster (sirve el archivo tal cual) |

## Despliegue local

```bash
# 1. Instalar dependencias
npm install

# 2. Levantar Postgres con PostGIS (ej. Docker)
docker run --name pg-mj2 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mapajalisco2 -p 5432:5432 -d postgis/postgis:16-3.4

# 3. Configurar entorno
cp .env.example .env
# editar DATABASE_URL si hace falta

# 4. Inicializar esquema (crea extensión postgis, tablas y usuario admin)
npm run init-db

# 5. Arrancar
npm start
# → http://localhost:3000
```

**Credenciales por defecto:** `admin` / `admin123` (configurable vía `BOOTSTRAP_ADMIN_USER` y `BOOTSTRAP_ADMIN_PASS`).

## Despliegue en Railway

1. Crear servicio Postgres con PostGIS en Railway (template `postgis` o usar `postgis/postgis:16-3.4`)
2. Enlazar este repo al servicio
3. Variables de entorno:
   - `DATABASE_URL` → referencia a la DB de Railway (`${{ Postgis.DATABASE_URL }}`)
   - `JWT_SECRET` → valor aleatorio seguro
   - `PORT` → Railway lo inyecta automáticamente
   - `UPLOAD_DIR` → `/app/uploads`
4. Comando de inicio: `npm run init-db && npm start` (o ejecutar `init-db` una vez manualmente desde la consola de Railway)
5. **Importante:** Railway tiene filesystem efímero. Para producción real conviene usar Railway Volumes o S3 para los archivos. Para esta versión inicial los archivos persisten mientras el contenedor no se redeploye.

## Roadmap

- [ ] Persistencia de uploads en Railway Volume / S3
- [ ] Servir tiles vectoriales reales con PostGIS (`pg_tileserv` o `st_asgeojson` con tiles)
- [ ] Catálogo WMTS/WMS para rasters
- [ ] Exportar capas (SHP/GeoPackage)
