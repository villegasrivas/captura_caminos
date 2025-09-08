// Cargar Google Identity Services
(function loadGIS(){
  var s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
  document.head.appendChild(s);
})();

var idToken = null; // se llenara al iniciar sesion
var GOOGLE_CLIENT_ID = 'TU_CLIENT_ID.apps.googleusercontent.com';

function initGoogle(){
  if (!window.google || !google.accounts || !google.accounts.id) return false;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: function (resp) { idToken = resp.credential || null; }
  });
  return true;
}


// ================= captura_app.js (ASCII) =================
(function(){
  function getCfg(){ return (window.CAPTURA_CFG||{}); }
  function getBase(){
    var tag = document.getElementById('base-geojson');
    if(!tag) return null;
    try { return JSON.parse(tag.textContent || tag.innerText || "{}"); }
    catch(e){ return null; }
  }
  function norm(s){ return (s||"").toString().trim().toLowerCase(); }

  // API publica: R llama window.capturaAppInit(this);
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

    // 1) Geoman minimo
    var drawn = L.featureGroup().addTo(map);
    map.pm.addControls({
      position:'topleft',
      drawMarker:true, drawPolyline:true,
      drawPolygon:false, drawRectangle:false,
      drawCircle:false, drawCircleMarker:false,
      editMode:true, removalMode:true
    });
    map.pm.setGlobalOptions({ snappable:true, snapDistance:15, allowSelfIntersection:false });
    // Solo una geometría a la vez: al crear, borra lo anterior
    map.on('pm:create', function(e){
      drawn.clearLayers();      // ← limpia dibujos previos
      drawn.addLayer(e.layer);  // ← agrega el nuevo
    });

    // Cuando borres con la papelera, elimina también del grupo "drawn"
    map.on('pm:remove', function(e){
      if (drawn.hasLayer(e.layer)) {
        drawn.removeLayer(e.layer);
      }
    });


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
      var p  = l.feature.properties || {};
      var ts = p.ts ? new Date(p.ts).toLocaleString() : '';
      return '<b>Fecha creacion:</b> '+ ts +
             '<br/><b>Identificador:</b> ' + (p.identificacion||'(vacio)') +
             '<br/><b>Tipo:</b> ' + (p.tipo||'(vacio)');
    }
    function renderReportes(){
      reportesLayer.clearLayers();
      if(!geoCache) return;
      var filtered = JSON.parse(JSON.stringify(geoCache));
      filtered.features = (filtered.features||[]).filter(function(ft){
        var okIdent = (currentIdent==='Todos') || ((ft.properties&&ft.properties.identificacion)||'' )=== currentIdent;
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
    // control de filtro
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
    // lo subimos arriba del selector de capas
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

    // dialogo select reutilizable
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

    // 3) Boton Guardar
    var btnSave = L.control({position:'bottomleft'});
    btnSave.onAdd = function(){
      var d = L.DomUtil.create('div','leaflet-bar');
      var a = L.DomUtil.create('a','primary',d); a.href='#'; a.title='Guardar'; a.textContent='Guardar';
      L.DomEvent.on(a,'click', function(ev){
        L.DomEvent.stop(ev);

        var layers = [];
        drawn.eachLayer(function(l){
          if (map.hasLayer(l)) layers.push(l); // evita “fantasmas” borrados
        });
        var fc = { type:'FeatureCollection', features: layers.map(function(l){ return l.toGeoJSON(); }) };
        
        if(!fc.features.length){ alert('Dibuja algo antes de guardar'); return; }
        showSelectDialog('IDENTIFIQUESE', ['PDTI-Manio','PDT1-Nahuelbuta','PDTI-IMP_CEN_1','PDTI-IMP_CEN_2','PDTI-Boroa','PRODER','CAMINOS'])
        .then(function(quien){
          return showSelectDialog('TIPO', ['Planificado','Ejecutado']).then(function(tipo){
            return {quien:quien, tipo:tipo};
          });
        })
        .then(function(sel){
          return fetch(
  cfg.SCRIPT_URL + (idToken ? ('&id_token=' + encodeURIComponent(idToken)) : ''),
  {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
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

    // 4) Boton Refrescar
    var btnRef = L.control({position:'bottomleft'});
    btnRef.onAdd = function(){
      var d = L.DomUtil.create('div','leaflet-bar');
      var a = L.DomUtil.create('a','neutral',d); a.href='#'; a.title='Refrescar'; a.textContent='Refrescar';
      L.DomEvent.on(a,'click', function(ev){ L.DomEvent.stop(ev); cargarReportes(); });
      return d;
    }; btnRef.addTo(map);

    // 5) Boton Ver (mostrar/ocultar)
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

    // 6) Boton Borrar (toggle)
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

    // 7) Boton GPS
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
  };
})();

// Boton Entrar (login) - opcional, aparece por si el servidor lo exige
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
    // muestra el prompt de Google (one-tap/popup)
    google.accounts.id.prompt(); // esto abre el flujo de login; al terminar rellena idToken
  });
  return d;
}; btnLogin.addTo(map);



