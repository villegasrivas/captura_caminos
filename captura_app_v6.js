  // ================= Google Identity (preparado para futuro) =================
(function loadGIS(){
  var s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
  document.head.appendChild(s);
})();
var idToken = null; // se llenará cuando activemos Google Sign-In
var GOOGLE_CLIENT_ID = 'TU_CLIENT_ID.apps.googleusercontent.com';
function initGoogle(){
  if (!window.google || !google.accounts || !google.accounts.id) return false;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: function (resp) { idToken = resp.credential || null; }
  });
  return true;
}

// ================= captura_app_v6.js (ASCII) =================
(function(){
  function getCfg(){ return (window.CAPTURA_CFG||{}); }
  function getBase(){
    var tag = document.getElementById('base-geojson');
    if(!tag) return null;
    try { return JSON.parse(tag.textContent || tag.innerText || "{}"); }
    catch(e){ return null; }
  }
  function norm(s){ return (s||"").toString().trim().toLowerCase(); }

// === Utilidades de medición y vista ===
function formatLength(m){
  if (!isFinite(m) || m <= 0) return '0 m';
  if (m < 1000) return Math.round(m) + ' m';
  return (m/1000).toFixed(2) + ' km';
}
function flattenLatLngs(latlngs){
  // Geoman/Leaflet puede anidar arreglos: [ [LatLng, ...] ]
  if (Array.isArray(latlngs) && Array.isArray(latlngs[0])) return latlngs.flat();
  return latlngs || [];
}
function polylineLengthMeters(layer){
  if (!layer || typeof layer.getLatLngs !== 'function') return 0;
  var pts = flattenLatLngs(layer.getLatLngs());
  var total = 0;
  for (var i=0;i<pts.length-1;i++){ total += pts[i].distanceTo(pts[i+1]); }
  return total;
}
function lastLatLngOf(layer){
  if (!layer || typeof layer.getLatLngs !== 'function') return null;
  var pts = flattenLatLngs(layer.getLatLngs());
  return pts.length ? pts[pts.length-1] : null;
}
function panIfOut(map, latlng){
  if (!latlng) return;
  var padBounds = map.getBounds().pad(0.08);
  if (!padBounds.contains(latlng)) map.panTo(latlng);
}
  
  // R llama window.capturaAppInit(this);
  window.capturaAppInit = function(map){
    var cfg  = getCfg();
    var BASE = getBase();

    // 0) capa base no editable + leyenda
    if (BASE){
      L.geoJSON(BASE, { pmIgnore:true, style:{ color: cfg.LINE_COLOR, weight: cfg.LINE_WEIGHT, opacity: cfg.LINE_OPACITY } }).addTo(map);
    }
    var legend = L.control({position:'bottomright'});
    legend.onAdd = function(){
      var div = L.DomUtil.create('div','legend-box');
      var row1 = L.DomUtil.create('div','legend-row', div);
      row1.innerHTML = '<svg class="legend-line" viewBox="0 0 40 12" aria-hidden="true">' +
                       '<line x1="0" y1="6" x2="40" y2="6" stroke="'+cfg.LINE_COLOR+'" stroke-width="'+cfg.LINE_WEIGHT+'" stroke-opacity="'+cfg.LINE_OPACITY+'" stroke-linecap="round"/></svg>' +
                       '<span>'+cfg.LEGEND_LABEL+'</span>';
      var row2 = L.DomUtil.create('div','legend-row', div);
      row2.innerHTML = '<svg class="legend-line" viewBox="0 0 40 12" aria-hidden="true">' +
                       '<line x1="0" y1="6" x2="40" y2="6" stroke="#f59e0b" stroke-width="4" stroke-opacity="0.85" stroke-linecap="round"/></svg>' +
                       '<span>Planificado/Programado</span>';
      var row3 = L.DomUtil.create('div','legend-row', div);
      row3.innerHTML = '<svg class="legend-line" viewBox="0 0 40 12" aria-hidden="true">' +
                       '<line x1="0" y1="6" x2="40" y2="6" stroke="#16a34a" stroke-width="4" stroke-opacity="0.85" stroke-linecap="round"/></svg>' +
                       '<span>Ejecutado</span>';
      return div;
    }; legend.addTo(map);

    // 1) Geoman mínimo
    var drawn = L.featureGroup().addTo(map);
    map.pm.addControls({
      position:'topleft',
      drawMarker:true, drawPolyline:true,
      drawPolygon:false, drawRectangle:false,
      drawCircle:false, drawCircleMarker:false,
      editMode:true, removalMode:true
    });
    map.pm.setGlobalOptions({ snappable:true, snapDistance:15, allowSelfIntersection:false });

    // === Control de medición en vivo ===
    var measureCtl = L.control({position:'bottomright'});
    measureCtl.onAdd = function(){
      var d = L.DomUtil.create('div','measure-box');
      // Estilo inline para no tocar CSS en otro archivo
      d.style.background = 'white';
      d.style.padding = '6px 8px';
      d.style.fontSize = '12px';
      d.style.borderRadius = '6px';
      d.style.boxShadow = '0 1px 4px rgba(0,0,0,.2)';
      d.style.display = 'none';
      d.textContent = 'Longitud: 0 m';
      return d;
    };
    measureCtl.addTo(map);
    var measureDiv = measureCtl.getContainer();
    function showMeasure(text){ measureDiv.style.display='block'; measureDiv.textContent = 'Longitud: ' + text; }
    function hideMeasure(){ measureDiv.style.display='none'; }
    function updateMeasureFromLayer(layer){
      var m = polylineLengthMeters(layer);
      showMeasure(formatLength(m));
    }

    
    // Capa en edición mientras dibujas (la "working layer" de Geoman)
    var drawingLayer = null;

    // Al empezar a dibujar
    map.on('pm:drawstart', function(e){
      drawingLayer = null;
      // Mostramos el medidor solo para líneas
      var shape = (e && e.shape) || '';
      if (shape.toLowerCase().includes('line')) {
        showMeasure('0 m');
      } else {
        hideMeasure();
      }
    });

    // Cada vez que agregas un vértice (nodo) en el dibujo
    map.on('pm:vertexadded', function(e){
      drawingLayer = e.layer || drawingLayer;
      if (drawingLayer && typeof drawingLayer.getLatLngs === 'function'){
        updateMeasureFromLayer(drawingLayer);
        panIfOut(map, lastLatLngOf(drawingLayer));
      }
    });

    // Mientras arrastras un vértice durante el dibujo o edición
    map.on('pm:markerdrag', function(e){
      var lyr = (e && e.layer) || drawingLayer || null;
      if (lyr && typeof lyr.getLatLngs === 'function'){
        updateMeasureFromLayer(lyr);
      }
    });
    map.on('pm:markerdragend', function(e){
      var lyr = (e && e.layer) || drawingLayer || null;
      if (lyr && typeof lyr.getLatLngs === 'function'){
        panIfOut(map, lastLatLngOf(lyr));
      }
    });

    // Al terminar el dibujo
    map.on('pm:drawend', function(){
      hideMeasure();
      drawingLayer = null;
    });

    // Cuando el usuario comienza a dibujar una nueva geometría,
    // limpiamos cualquier resto anterior (evita que A se mezcle con B)
    map.on('pm:drawstart', function () {
      drawn.clearLayers();
      lastDrawn = null;
    });

    
    // === SINCRONIZACIÓN DE DIBUJO/BORRADO (a prueba de balas) ===
    var lastDrawn = null;

    // Al crear: una geometría por envío
    map.on('pm:create', function(e){
      drawn.clearLayers();
      lastDrawn = e.layer;
      drawn.addLayer(lastDrawn);
    });

    // Si se borra con la papelera de Geoman
    map.on('pm:remove', function(e){
      if (drawn.hasLayer(e.layer)) drawn.removeLayer(e.layer);
      if (lastDrawn === e.layer)   lastDrawn = null;
    });

    // Si por cualquier motivo se quitara una capa del featureGroup
    drawn.on('layerremove', function(e){
      if (lastDrawn === e.layer) lastDrawn = null;
    });

    // Al APAGAR el modo borrar, barremos “fantasmas” que no estén en el mapa
    map.on('pm:globalremovalmodetoggled', function(e){
      if (!e.enabled){
        var toRemove = [];
        drawn.eachLayer(function(l){ if (!map.hasLayer(l)) toRemove.push(l); });
        toRemove.forEach(function(l){ drawn.removeLayer(l); });
        if (lastDrawn && !map.hasLayer(lastDrawn)) lastDrawn = null;
      }
    });
    // =============================================================

    // 2) Overlay de reportes + filtros
    var PLAN_COLOR = '#f59e0b', EJEC_COLOR = '#16a34a', UNK_COLOR = '#6d28d9';
    var reportesLayer = L.layerGroup().addTo(map);
    var reportesVisible = true, geoCache = null;
    var currentIdent = 'Todos', currentTipo = 'Todos';

    function styByTipo(f){
      var t = norm(f.properties && f.properties.tipo);
      var color = (t==='planificado' || t==='programado') ? PLAN_COLOR :
                  (t==='ejecutado') ? EJEC_COLOR : UNK_COLOR;
      return { color: color, weight:4, opacity:0.85 };
    }
    function mkPoint(f, latlng){
      var c = styByTipo(f).color;
      return L.circleMarker(latlng, { radius:6, fillOpacity:0.85, color:c });
    }
    function popupHtml(l){
      var p  = (l && l.feature && l.feature.properties) || {};
      var ts = p.ts ? new Date(p.ts).toLocaleString() : '';

      // Longitud: preferir lo guardado; si no hay, calcular al vuelo
      var lenm = (typeof p.length_m === 'number' && isFinite(p.length_m)) ? p.length_m : 0;
      if (!lenm && l && typeof l.getLatLngs === 'function'){
        lenm = Math.round(polylineLengthMeters(l));
      }
      var lenTxt = lenm ? formatLength(lenm) : '—';

      return '<b>Fecha creacion:</b> '+ ts +
             '<br/><b>Identificador:</b> ' + (p.identificacion||'(vacio)') +
             '<br/><b>Tipo:</b> ' + (p.tipo||'(vacio)') +
             '<br/><b>Longitud:</b> ' + lenTxt;
    }

    function renderReportes(){
      reportesLayer.clearLayers();
      if(!geoCache) return;
      var filtered = JSON.parse(JSON.stringify(geoCache));
      filtered.features = (filtered.features||[]).filter(function(ft){
        var okIdent = (currentIdent==='Todos') || (((ft.properties&&ft.properties.identificacion)||'' )=== currentIdent);
        var t = norm(ft.properties&&ft.properties.tipo);
        var okTipo  = (currentTipo==='Todos') ||
                      (currentTipo==='Planificado/Programado' && (t==='planificado' || t==='programado')) ||
                      (currentTipo==='Ejecutado' && t==='ejecutado');
        return okIdent && okTipo;
      });
      var layer = L.geoJSON(filtered, { pmIgnore:true, style: styByTipo, pointToLayer: mkPoint }).bindPopup(popupHtml);
      reportesLayer.addLayer(layer);
      if(!reportesVisible) map.removeLayer(reportesLayer);
    }
    function uniqueIdents(geo){
      var set = {}; (geo.features||[]).forEach(function(ft){
        var id = (ft.properties && ft.properties.identificacion) || '';
        if(!id) id = '(sin identificador)'; set[id] = true;
      });
      return Object.keys(set).sort(function(a,b){
        if(a==='(sin identificador)') return 1;
        if(b==='(sin identificador)') return -1;
        return a.localeCompare(b, 'es');
      });
    }

    // control de filtro (arriba-derecha)
    var filterCtl = L.control({position:'topright'});
    filterCtl.onAdd = function(){
      var div = L.DomUtil.create('div','filter-box');
      div.innerHTML =
        '<label>Filtrar por IDENTIFIQUESE</label><select id="identFilter"><option value="Todos">Todos</option></select>'+
        '<label style="margin-top:8px;">Filtrar por TIPO</label><select id="tipoFilter">'+
        '<option>Todos</option><option>Planificado/Programado</option><option>Ejecutado</option></select>';
      return div;
    };
    filterCtl.addTo(map);
    // Subir por encima del selector de capas
    var wrap = filterCtl.getContainer();
    var tr = map._controlCorners && map._controlCorners['topright'];
    if (tr && wrap){ wrap.classList.add('filter-ctl'); tr.insertBefore(wrap, tr.firstChild); }

    function populateFilters(geo){
      var selI = document.getElementById('identFilter');
      if(!selI) return;
      var keepI = currentIdent, keepT = currentTipo;
      selI.innerHTML = '<option value="Todos">Todos</option>';
      uniqueIdents(geo).forEach(function(v){
        var o=document.createElement('option'); o.value=v; o.textContent=v; selI.appendChild(o);
      });
      selI.value = (Array.from(selI.options).some(o => o.value===keepI)) ? keepI : 'Todos';
      selI.onchange = function(){ currentIdent = selI.value; renderReportes(); };

      var selT = document.getElementById('tipoFilter');
      if(selT){ selT.value = keepT; selT.onchange = function(){ currentTipo = selT.value; renderReportes(); }; }
    }

    function cargarReportes(){
      fetch(cfg.FEED_URL)
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(geo){ geoCache = geo; populateFilters(geo); renderReportes(); })
        .catch(function(err){ console.warn('No pude cargar reportes:', err); });
    }
    cargarReportes();

    // diálogo select reutilizable
    function showSelectDialog(title, options){
      return new Promise(function(resolve, reject){
        var overlay = document.createElement('div'); overlay.className='modal-overlay';
        var dialog  = document.createElement('div'); dialog.className='modal-dialog';
        var h3 = document.createElement('h3'); h3.textContent = title;
        var sel = document.createElement('select');
        options.forEach(function(opt){ var o=document.createElement('option'); o.value=opt; o.textContent=opt; sel.appendChild(o); });
        var actions = document.createElement('div'); actions.className='modal-actions';
        var cancel  = document.createElement('button'); cancel.textContent='Cancelar';
        var ok      = document.createElement('button'); ok.textContent='Aceptar'; ok.className='primary';
        actions.appendChild(cancel); actions.appendChild(ok);
        dialog.appendChild(h3); dialog.appendChild(sel); dialog.appendChild(actions);
        overlay.appendChild(dialog); document.body.appendChild(overlay);
        cancel.onclick = function(){ document.body.removeChild(overlay); reject(new Error('cancel')); };
        ok.onclick     = function(){ var v = sel.value; document.body.removeChild(overlay); resolve(v); };
      });
    }

    // 3) Botón Guardar (sólo última geometría visible)
    var btnSave = L.control({position:'bottomleft'});
    btnSave.onAdd = function(){
      var d = L.DomUtil.create('div','leaflet-bar');
      var a = L.DomUtil.create('a','primary',d); a.href='#'; a.title='Guardar'; a.textContent='Guardar';
      L.DomEvent.on(a,'click', function(ev){
        L.DomEvent.stop(ev);

        // Si quedó activo el modo borrar, apágalo (evita rarezas)
        if (map.pm.globalRemovalEnabled && map.pm.globalRemovalEnabled()) {
          map.pm.disableGlobalRemovalMode();
        }

       // === SOLO GUARDAR LA ÚLTIMA GEOMETRÍA (con longitud en properties) ===
      if (!lastDrawn || !map.hasLayer(lastDrawn)) {
        alert('Dibuja algo antes de guardar');
        return;
      }

      // GeoJSON de la capa
      var feat = lastDrawn.toGeoJSON();

      // Calcular longitud solo si es línea (para puntos quedará 0)
      var lenm = 0;
      if (typeof lastDrawn.getLatLngs === 'function') {
        lenm = Math.round(polylineLengthMeters(lastDrawn)); // usa la utilidad del PASO 1
      }

      // Adjuntar a properties sin romper lo existente
      feat.properties = Object.assign({}, feat.properties || {}, {
        length_m: lenm,
        length_km: +(lenm / 1000).toFixed(3)
      });

      var fc = {
        type: 'FeatureCollection',
        features: [ feat ]
      };
      // ======================================================================



        showSelectDialog('IDENTIFIQUESE', ['PDTI-Manio','PDT1-Nahuelbuta','PDTI-IMP_CEN_1','PDTI-IMP_CEN_2','PDTI-Boroa','PRODER','CAMINOS'])
        .then(function(quien){
          return showSelectDialog('TIPO', ['Planificado','Ejecutado']).then(function(tipo){
            return {quien:quien, tipo:tipo};
          });
        })
        .then(function(sel){
          return fetch(
            cfg.SCRIPT_URL + '?token=' + encodeURIComponent(cfg.TOKEN) + (idToken ? ('&id_token=' + encodeURIComponent(idToken)) : ''),
            {
              method:'POST',
              headers:{ 'Content-Type':'application/json' },
              body: JSON.stringify({
                featureCollection: fc,
                attributes: {
                  identificacion: sel.quien,
                  tipo: sel.tipo,
                  dispositivo: navigator.userAgent,
                  enviado_en: new Date().toISOString()
                }
              })
            }
          ).then(function(resp){
            return resp.text().then(function(text){ return {ok: resp.ok, text: text}; });
          });
        })
        .then(function(r){
          if(!r.ok) throw new Error(r.text || 'Error desconocido');
          alert('Enviado');
          drawn.clearLayers();
          lastDrawn = null;
          cargarReportes();
        })
        .catch(function(err){
          if(String(err).includes('cancel')) return;
          console.error('Fallo POST:', err);
          alert('Sin conexion o error. Se descargara el GeoJSON.');
          var a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([JSON.stringify({featureCollection:fc})],{type:'application/json'}));
          a.download = 'captura_terreno.geojson'; a.click(); URL.revokeObjectURL(a.href);
        });
      });
      return d;
    }; btnSave.addTo(map);

    // 4) Botón Refrescar
    var btnRef = L.control({position:'bottomleft'});
    btnRef.onAdd = function(){
      var d = L.DomUtil.create('div','leaflet-bar');
      var a = L.DomUtil.create('a','neutral',d); a.href='#'; a.title='Refrescar'; a.textContent='Refrescar';
      L.DomEvent.on(a,'click', function(ev){ L.DomEvent.stop(ev); cargarReportes(); });
      return d;
    }; btnRef.addTo(map);

    // 5) Botón Ver (mostrar/ocultar)
    var btnTog = L.control({position:'bottomleft'});
    btnTog.onAdd = function(){
      var d = L.DomUtil.create('div','leaflet-bar');
      var a = L.DomUtil.create('a','neutral',d); a.href='#'; a.title='Mostrar/Ocultar'; a.textContent='Ver';
      L.DomEvent.on(a,'click', function(ev){
        L.DomEvent.stop(ev);
        reportesVisible = !reportesVisible;
        if(reportesVisible) map.addLayer(reportesLayer); else map.removeLayer(reportesLayer);
      });
      return d;
    }; btnTog.addTo(map);

    // 6) Botón Borrar (toggle)
    var removeActive = false;
    var btnDel = L.control({position:'bottomleft'});
    btnDel.onAdd = function(){
      var d = L.DomUtil.create('div','leaflet-bar');
      var a = L.DomUtil.create('a','danger',d); a.href='#'; a.title='Borrar'; a.textContent='Borrar';
      L.DomEvent.on(a,'click', function(ev){
        L.DomEvent.stop(ev);
        removeActive = !removeActive;
        if(removeActive){ map.pm.enableGlobalRemovalMode(); a.style.boxShadow='inset 0 0 0 2px rgba(255,255,255,.6)'; }
        else            { map.pm.disableGlobalRemovalMode(); a.style.boxShadow='none'; }
      });
      return d;
    }; btnDel.addTo(map);

    // 7) Botón GPS
    var gpsMarker = null, gpsCircle = null;
    var btnGPS = L.control({position:'topleft'});
    btnGPS.onAdd = function(){
      var d = L.DomUtil.create('div','leaflet-bar');
      var a = L.DomUtil.create('a','neutral',d); a.href='#'; a.title='Ir a mi ubicacion'; a.textContent='GPS';
      L.DomEvent.on(a,'click', function(ev){
        L.DomEvent.stop(ev);
        if (!navigator.geolocation){ alert('Geolocalizacion no disponible'); return; }
        navigator.geolocation.getCurrentPosition(function(pos){
          var lat = pos.coords.latitude, lng = pos.coords.longitude, acc = pos.coords.accuracy || 30;
          map.setView([lat,lng], 17);
          if (gpsMarker){ map.removeLayer(gpsMarker); }
          if (gpsCircle){ map.removeLayer(gpsCircle); }
          gpsMarker = L.marker([lat,lng]).addTo(map);
          gpsCircle = L.circle([lat,lng], {radius: acc, color:'#0080ff', weight:1, fillOpacity:0.1}).addTo(map);
        }, function(err){
          alert('No se pudo obtener ubicacion ('+err.code+')');
        }, {enableHighAccuracy:true, timeout:10000, maximumAge:30000});
      });
      return d;
    }; btnGPS.addTo(map);

    // 8) Botón Entrar (login) - opcional, por si activas RESTRICT=true en el backend
    var btnLogin = L.control({position:'bottomleft'});
    btnLogin.onAdd = function(){
      var d = L.DomUtil.create('div','leaflet-bar');
      var a = L.DomUtil.create('a','neutral',d); a.href='#'; a.title='Entrar'; a.textContent='Entrar';
      L.DomEvent.on(a,'click', function(ev){
        L.DomEvent.stop(ev);
        if (!initGoogle()){
          alert('Cargando modulo de Google... intenta de nuevo en 2 segundos.');
          return;
        }
        google.accounts.id.prompt(); // abre el flujo; al terminar rellena idToken
      });
      return d;
    }; btnLogin.addTo(map);
  };
})();



