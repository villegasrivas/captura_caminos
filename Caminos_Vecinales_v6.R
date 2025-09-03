# ================== generar_mapa.R (ASCII) ==================
# Requisitos: install.packages(c("leaflet","htmlwidgets","htmltools","sf","geojsonsf","jsonlite"))

library(leaflet)
library(htmlwidgets)
library(htmltools)
library(sf)
library(geojsonsf)
library(jsonlite)

# -------- CONFIG EDITABLE --------
SCRIPT_URL <- "https://script.google.com/macros/s/AKfycbxsE576Xn4hEorzMqKe7WK6FVzUCawN395OQDFckzAsKvf2nzcMoHb7U33uHkvPNd6WFw/exec?token=SIG_CAMINOS_V1"
SHP_PATH   <- "C:/Users/gvillegas/Documents/MUNICIPALIDAD/SECPLAN/CAMINOS/capa_base.shp"

CENTER_LNG <- -72.9498
CENTER_LAT <- -38.7428
START_ZOOM <- 14

# Estilo capa base (linea azul)
LINE_COLOR   <- "#1d4ed8"
LINE_WEIGHT  <- 6
LINE_OPACITY <- 0.50
LEGEND_LABEL <- "Caminos MOP"

# Tamaños UI
SCALE_MOBILE     <- 1.05
LAYERS_FONT_SIZE <- 12
LAYERS_GAP       <- 10   # separacion entre filtros y OSM/Satelite
# ---------------------------------

# Shapefile -> GeoJSON (EPSG:4326)
base_sf <- st_read(SHP_PATH, quiet = TRUE)
suppressWarnings({ base_sf <- st_make_valid(base_sf) })
if (is.na(st_crs(base_sf))) stop("Tu shapefile no tiene CRS; define EPSG:4326.")
if (st_crs(base_sf)$epsg != 4326) base_sf <- st_transform(base_sf, 4326)
BASE_GEOJSON <- sf_geojson(base_sf, digits = 6)

# Feed de reportes (GeoJSON)
FEED_URL <- paste0(SCRIPT_URL, "&as=geojson")

# Mapa base
m <- leaflet(options = leafletOptions(tap = FALSE, doubleClickZoom = FALSE)) |>
  addTiles(group = "OSM") |>
  addProviderTiles(providers$Esri.WorldImagery, group = "Satelite") |>
  setView(lng = CENTER_LNG, lat = CENTER_LAT, zoom = START_ZOOM) |>
  addLayersControl(baseGroups = c("OSM","Satelite"),
                   options = layersControlOptions(collapsed = FALSE, autoZIndex = TRUE))

# Dependencias Geoman
m <- m |>
  prependContent(
    tags$head(
      tags$meta(name="viewport", content="width=device-width, initial-scale=1, maximum-scale=1"),
      tags$link(rel="stylesheet",
                href="https://unpkg.com/@geoman-io/leaflet-geoman-free@2.14.2/dist/leaflet-geoman.css"),
      tags$script(src="https://unpkg.com/@geoman-io/leaflet-geoman-free@2.14.2/dist/leaflet-geoman.min.js")
    )
  )

# CSS (orden filtros arriba; OSM/Satelite debajo)
css <- sprintf("
html, body { height:100%%; margin:0; }
.leaflet-container { height:100vh; width:100vw; }

/* Botones nativos */
.leaflet-touch .leaflet-bar a { width:26px !important; height:26px !important; line-height:26px !important; }

/* En movil: filtro arriba y capas debajo, con escala */
@media (max-width: 900px) {
  .leaflet-control-zoom, .leaflet-pm-toolbar { transform: scale(%f); transform-origin: top left; }
  .filter-ctl, .leaflet-control-layers { transform: scale(%f); transform-origin: top right; }
  .leaflet-control-layers { margin-top: %dpx !important; }
}

/* Texto del selector de capas */
.leaflet-control-layers { font-size: %dpx !important; }

/* Margenes genericos */
.leaflet-left .leaflet-control  { margin-left: 12px; }
.leaflet-top  .leaflet-control  { margin-top:  12px; }

/* Leyenda */
.legend-box {
  background:#fff; padding:8px 10px; border-radius:10px; box-shadow: 0 2px 12px rgba(0,0,0,.15);
  font: 14px/1.3 system-ui, sans-serif; display:flex; flex-direction:column; gap:6px;
}
.legend-row { display:flex; align-items:center; gap:8px; white-space:nowrap; }
.legend-line { width:40px; height:12px; }

/* Panel de filtros */
.filter-box { background:#fff; padding:8px 10px; border-radius:10px; box-shadow:0 2px 12px rgba(0,0,0,.15); font:14px/1.3 system-ui, sans-serif; }
.filter-box label { display:block; font-weight:600; margin-bottom:6px; }
.filter-box select { width:100%%; font-size:14px; padding:6px; }

/* Modal select */
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.35); display:flex; align-items:center; justify-content:center; z-index:10000; }
.modal-dialog  { background:#fff; border-radius:12px; padding:14px; width:92%%; max-width:380px; box-shadow:0 10px 24px rgba(0,0,0,.25); font:15px/1.4 system-ui,sans-serif; }
.modal-dialog h3 { margin:0 0 8px 0; font-size:18px; }
.modal-dialog select { width:100%%; padding:8px; font-size:16px; }
.modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
.modal-actions button { padding:8px 12px; border-radius:8px; border:1px solid #ddd; background:#f7f7f7; }
.modal-actions button.primary { background:#2563eb; color:#fff; border-color:#2563eb; }
", SCALE_MOBILE, SCALE_MOBILE, LAYERS_GAP, LAYERS_FONT_SIZE)
m <- m |> appendContent(tags$style(HTML(css)))

# Inyecta datos y config para el JS externo
cfg <- list(
  LINE_COLOR = LINE_COLOR,
  LINE_WEIGHT = LINE_WEIGHT,
  LINE_OPACITY = LINE_OPACITY,
  LEGEND_LABEL = LEGEND_LABEL,
  FEED_URL = FEED_URL,
  SCRIPT_URL = SCRIPT_URL
)
m <- m |>
  appendContent(tagList(
    tags$script(id="base-geojson", type="application/json", HTML(BASE_GEOJSON)),
    tags$script(HTML(paste0("window.CAPTURA_CFG = ", jsonlite::toJSON(cfg, auto_unbox = TRUE), ";")))
  )) |>
  appendContent(includeScript("captura_app_V6.js")) |>
  onRender("function(el,x){ if(window.capturaAppInit){ window.capturaAppInit(this); } }")

# Guarda el HTML que subiras a GitHub Pages
saveWidget(m, "mapa_v6.html", selfcontained = TRUE)
# ================== fin generar_mapa.R ==================
