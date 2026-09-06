/**
 * Projektkarte - Deutschlandkarte mit unseren Projekten und Betriebssitzen.
 *
 * Die Seite kommt ohne Server aus: alle Daten liegen im localStorage des
 * Browsers, Bilder werden beim Hochladen verkleinert und als Data-URL
 * mitgespeichert. Über den Mitarbeiterbereich lässt sich alles pflegen und als
 * JSON sichern bzw. wieder einlesen.
 */
(function () {
  'use strict';

  var SPEICHER = 'projektkarte.v1';
  var SITZUNG = 'projektkarte.frei';
  var STANDARD_PASSWORT = 'leniger';
  var G = window.GEO_DE;

  /* ------------------------------------------------------------ Werkzeug */

  function $(auswahl) { return document.querySelector(auswahl); }

  function h(tag, attribute) {
    var e = document.createElement(tag);
    if (attribute) {
      Object.keys(attribute).forEach(function (k) {
        var w = attribute[k];
        if (w == null || w === false) return;
        if (k === 'class') e.className = w;
        else if (k === 'text') e.textContent = w;
        else if (k.slice(0, 2) === 'on') e[k.toLowerCase()] = w;
        else e.setAttribute(k, w);
      });
    }
    for (var i = 2; i < arguments.length; i++) anhaengen(e, arguments[i]);
    return e;
  }

  function anhaengen(eltern, kind) {
    if (kind == null || kind === false) return;
    if (Array.isArray(kind)) { kind.forEach(function (k) { anhaengen(eltern, k); }); return; }
    eltern.appendChild(kind.nodeType ? kind : document.createTextNode(String(kind)));
  }

  function svg(tag, attribute) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attribute) Object.keys(attribute).forEach(function (k) {
      if (attribute[k] != null) e.setAttribute(k, attribute[k]);
    });
    return e;
  }

  function neueId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function zahl(wert, ersatz) {
    var n = parseFloat(String(wert).replace(',', '.'));
    return isFinite(n) ? n : ersatz;
  }

  var meldungsUhr = null;
  function melde(text) {
    var m = $('#meldung');
    m.textContent = text;
    m.classList.add('sichtbar');
    clearTimeout(meldungsUhr);
    meldungsUhr = setTimeout(function () { m.classList.remove('sichtbar'); }, 2600);
  }

  /** Farbiger Platzhalter, solange kein Bild hinterlegt ist. */
  function platzhalter(text, dunkel) {
    var kuerzel = String(text || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
    var a = dunkel ? '#0f172a' : '#1d4ed8';
    var b = dunkel ? '#334155' : '#60a5fa';
    var quelle = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">' +
      '<defs><linearGradient id="v" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/>' +
      '</linearGradient></defs><rect width="640" height="360" fill="url(#v)"/>' +
      '<text x="320" y="200" font-family="Segoe UI,Arial,sans-serif" font-size="96" font-weight="700" ' +
      'fill="rgba(255,255,255,.85)" text-anchor="middle">' + kuerzel + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(quelle);
  }

  function bildQuelle(objekt) {
    return objekt.titelbild || platzhalter(objekt.name, objekt.art === 'sitz');
  }

  /* ------------------------------------------------------------ Kennwort */

  function einfacherHash(text) {
    var wert = 5381;
    for (var i = 0; i < text.length; i++) wert = ((wert * 33) ^ text.charCodeAt(i)) >>> 0;
    return wert.toString(16);
  }

  function hashe(text) {
    var gesalzen = 'projektkarte$' + text;
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(gesalzen))
        .then(function (puffer) {
          return Array.prototype.map.call(new Uint8Array(puffer), function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('');
        })
        .catch(function () { return 'e:' + einfacherHash(gesalzen); });
    }
    return Promise.resolve('e:' + einfacherHash(gesalzen));
  }

  function passwortStimmt(eingabe) {
    return hashe(eingabe).then(function (hash) {
      var hinterlegt = daten.einstellungen.passwortHash;
      if (!hinterlegt) return eingabe === STANDARD_PASSWORT;
      return hash === hinterlegt;
    });
  }

  function istFrei() {
    try { return sessionStorage.getItem(SITZUNG) === 'ja'; } catch (e) { return false; }
  }

  function schalteFrei(frei) {
    try {
      if (frei) sessionStorage.setItem(SITZUNG, 'ja');
      else sessionStorage.removeItem(SITZUNG);
    } catch (e) { /* privater Modus - dann gilt die Freigabe nur bis zum Neuladen */ }
    freigegeben = frei;
  }

  var freigegeben = istFrei();

  /* ------------------------------------------------------------ Daten */

  var STANDARD_FELDER_PROJEKT = ['Bauherr', 'Fertigstellung', 'Bauzeit', 'Gewerk'];
  var STANDARD_FELDER_SITZ = ['Grundstücksfläche', 'Lagerbereich', 'Mitarbeiterzahl',
    'Monteure', 'Kundendienst', 'Fahrzeuge'];

  function demodaten() {
    return {
      version: 1,
      einstellungen: {
        seitentitel: 'Unsere Projekte in Deutschland',
        passwortHash: null
      },
      sitze: [
        {
          id: neueId(), name: 'Betriebssitz Paderborn', ort: 'Paderborn, Nordrhein-Westfalen',
          lat: 51.7189, lon: 8.7575, titelbild: '',
          fakten: [
            { label: 'Grundstücksfläche', wert: '12.000 m²' },
            { label: 'Lagerbereich', wert: '2.400 m²' },
            { label: 'Mitarbeiterzahl', wert: '85' },
            { label: 'Monteure', wert: '54' },
            { label: 'Kundendienst', wert: '9 Teams' },
            { label: 'Fahrzeuge', wert: '46' }
          ],
          text: 'Der Stammsitz in Paderborn vereint Verwaltung, Lager und Werkstatt an einem ' +
            'Ort. Von hier aus werden die Baustellen in Nordrhein-Westfalen und Niedersachsen ' +
            'disponiert.\n\nDie Eckdaten sind Beispielwerte und lassen sich im ' +
            'Mitarbeiterbereich anpassen.',
          bilder: []
        },
        {
          id: neueId(), name: 'Betriebssitz Erfurt', ort: 'Erfurt, Thüringen',
          lat: 50.9787, lon: 11.0328, titelbild: '',
          fakten: [
            { label: 'Grundstücksfläche', wert: '7.500 m²' },
            { label: 'Lagerbereich', wert: '1.300 m²' },
            { label: 'Mitarbeiterzahl', wert: '42' },
            { label: 'Monteure', wert: '28' },
            { label: 'Kundendienst', wert: '5 Teams' },
            { label: 'Fahrzeuge', wert: '23' }
          ],
          text: 'Der Standort Erfurt betreut die Projekte in Thüringen, Sachsen und ' +
            'Sachsen-Anhalt.\n\nDie Eckdaten sind Beispielwerte und lassen sich im ' +
            'Mitarbeiterbereich anpassen.',
          bilder: []
        }
      ],
      projekte: [
        beispielProjekt('Wohnquartier Nordpark', 'Hamburg', 53.5511, 9.9937, '2024'),
        beispielProjekt('Verwaltungsgebäude Mitte', 'Berlin', 52.5200, 13.4050, '2023'),
        beispielProjekt('Logistikzentrum West', 'Köln', 50.9375, 6.9603, '2024'),
        beispielProjekt('Klinikerweiterung', 'Leipzig', 51.3397, 12.3731, '2022'),
        beispielProjekt('Produktionshalle Süd', 'München', 48.1372, 11.5755, '2025'),
        beispielProjekt('Schulzentrum am Wall', 'Kassel', 51.3127, 9.4797, '2023'),
        beispielProjekt('Rathaus-Sanierung', 'Bielefeld', 52.0302, 8.5325, '2024')
      ]
    };
  }

  function beispielProjekt(name, ort, lat, lon, jahr) {
    return {
      id: neueId(), name: name, ort: ort, lat: lat, lon: lon, titelbild: '',
      fakten: [
        { label: 'Bauherr', wert: 'Beispiel GmbH' },
        { label: 'Fertigstellung', wert: jahr },
        { label: 'Bauzeit', wert: '14 Monate' },
        { label: 'Gewerk', wert: 'Heizung, Lüftung, Sanitär' }
      ],
      text: 'Beispielprojekt. Beschreibung, Titelbild, Eckdaten und weitere Bilder werden ' +
        'im Mitarbeiterbereich gepflegt.',
      bilder: []
    };
  }

  /** Sorgt dafür, dass auch ältere oder eingelesene Daten vollständig sind. */
  function raeumeAuf(roh) {
    var d = roh && typeof roh === 'object' ? roh : {};
    var sauber = {
      version: 1,
      einstellungen: {
        seitentitel: (d.einstellungen && d.einstellungen.seitentitel) || 'Unsere Projekte in Deutschland',
        passwortHash: (d.einstellungen && d.einstellungen.passwortHash) || null
      },
      sitze: (Array.isArray(d.sitze) ? d.sitze : []).map(eintragAufraeumen),
      projekte: (Array.isArray(d.projekte) ? d.projekte : []).map(eintragAufraeumen)
    };
    return sauber;
  }

  function eintragAufraeumen(e) {
    e = e || {};
    return {
      id: e.id || neueId(),
      name: String(e.name || 'Ohne Namen'),
      ort: String(e.ort || ''),
      lat: zahl(e.lat, 51.2),
      lon: zahl(e.lon, 10.4),
      titelbild: String(e.titelbild || ''),
      fakten: (Array.isArray(e.fakten) ? e.fakten : [])
        .filter(function (f) { return f && (f.label || f.wert); })
        .map(function (f) { return { label: String(f.label || ''), wert: String(f.wert || '') }; }),
      text: String(e.text || ''),
      bilder: (Array.isArray(e.bilder) ? e.bilder : [])
        .filter(function (b) { return b && b.src; })
        .map(function (b) { return { src: String(b.src), text: String(b.text || '') }; })
    };
  }

  var daten = laden();

  function laden() {
    try {
      var roh = localStorage.getItem(SPEICHER);
      if (roh) return raeumeAuf(JSON.parse(roh));
    } catch (e) { /* beschädigt oder gesperrt - dann mit Demodaten starten */ }
    return demodaten();
  }

  function speichern() {
    try {
      localStorage.setItem(SPEICHER, JSON.stringify(daten));
      return true;
    } catch (e) {
      melde('Speicher voll - bitte Bilder verkleinern oder Einträge sichern und aufräumen.');
      return false;
    }
  }

  function speicherGroesse() {
    try { return (localStorage.getItem(SPEICHER) || '').length; } catch (e) { return 0; }
  }

  /** Alle Einträge mit Kennzeichnung ihrer Art, Sitze zuerst. */
  function alleOrte() {
    return daten.sitze.map(function (s) { return Object.assign({ art: 'sitz' }, s); })
      .concat(daten.projekte.map(function (p) { return Object.assign({ art: 'projekt' }, p); }));
  }

  function findeOrt(id) {
    return alleOrte().filter(function (o) { return o.id === id; })[0] || null;
  }

  /* ------------------------------------------------------------ Projektion */

  function projiziere(lat, lon) {
    var y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * 180 / Math.PI;
    return { x: (lon - G.minX) * G.scale, y: (G.maxY - y) * G.scale };
  }

  function entprojiziere(x, y) {
    var lon = x / G.scale + G.minX;
    var my = G.maxY - y / G.scale;
    var lat = (2 * Math.atan(Math.exp(my * Math.PI / 180)) - Math.PI / 2) * 180 / Math.PI;
    return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
  }

  /* ------------------------------------------------------------ Karte */

  var karte = $('#karte');
  var ebene = $('#ebene');
  var ebeneLaender = $('#ebeneLaender');
  var ebeneMarker = $('#ebeneMarker');

  var ansicht = { x: 0, y: 0, k: 1 };
  var K_MIN = 0.7, K_MAX = 16;
  var gewaehlteId = null;
  var setzeModus = null;   // Rückruf, wenn eine Position auf der Karte gewählt wird

  karte.setAttribute('viewBox', '0 0 ' + G.w + ' ' + G.h);

  function zeichneLaender() {
    G.states.forEach(function (land) {
      var pfad = svg('path', { d: land.d, class: 'land' });
      pfad.appendChild(svg('title')).textContent = land.n;
      ebeneLaender.appendChild(pfad);
    });
  }

  function markerForm(art) {
    var teile = [];
    teile.push(svg('ellipse', { cx: 0, cy: 1, rx: 5, ry: 1.8, class: 'schatten' }));
    if (art === 'sitz') {
      teile.push(svg('path', {
        class: 'stift',
        d: 'M0 0 L-5 -8 H-10 A4 4 0 0 1 -14 -12 V-24 A4 4 0 0 1 -10 -28 H10 A4 4 0 0 1 14 -24 ' +
          'V-12 A4 4 0 0 1 10 -8 H5 Z'
      }));
      teile.push(svg('path', { class: 'kern', d: 'M-7 -17 L0 -24 L7 -17 V-11 H-7 Z' }));
    } else {
      teile.push(svg('path', {
        class: 'stift',
        d: 'M0 0 C -3.2 -7.5 -9 -10.5 -9 -17 A 9 9 0 1 1 9 -17 C 9 -10.5 3.2 -7.5 0 0 Z'
      }));
      teile.push(svg('circle', { class: 'kern', cx: 0, cy: -17, r: 3.6 }));
    }
    teile.push(svg('circle', { class: 'treffer', cx: 0, cy: -15, r: 17 }));
    return teile;
  }

  function zeichneMarker() {
    ebeneMarker.textContent = '';
    alleOrte().forEach(function (ort) {
      var p = projiziere(ort.lat, ort.lon);
      var gruppe = svg('g', {
        class: 'marker' + (ort.art === 'sitz' ? ' sitz' : '') +
          (ort.id === gewaehlteId ? ' gewaehlt' : ''),
        'data-id': ort.id,
        'data-x': p.x,
        'data-y': p.y,
        tabindex: '0',
        role: 'button',
        'aria-label': ort.name
      });
      markerForm(ort.art).forEach(function (t) { gruppe.appendChild(t); });

      var beschriftung = svg('text', { class: 'name', x: 0, y: 14 });
      beschriftung.textContent = ort.name;
      gruppe.appendChild(beschriftung);

      gruppe.addEventListener('click', function (e) {
        e.stopPropagation();
        oeffneTafel(ort.id);
      });
      gruppe.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); oeffneTafel(ort.id); }
      });
      ebeneMarker.appendChild(gruppe);
    });
    setzeMarkerGroesse();
  }

  /** Marker sollen beim Zoomen gleich groß bleiben. */
  function setzeMarkerGroesse() {
    var faktor = 1 / ansicht.k;
    var namenZeigen = ansicht.k >= 2.4;
    Array.prototype.forEach.call(ebeneMarker.children, function (g) {
      g.setAttribute('transform',
        'translate(' + g.getAttribute('data-x') + ' ' + g.getAttribute('data-y') + ') scale(' + faktor + ')');
      var immer = g.classList.contains('sitz');
      g.classList.toggle('zeigt-namen', namenZeigen || immer);
    });
  }

  function wendeAn() {
    ebene.setAttribute('transform',
      'translate(' + ansicht.x + ' ' + ansicht.y + ') scale(' + ansicht.k + ')');
    setzeMarkerGroesse();
  }

  function begrenze() {
    ansicht.k = Math.min(K_MAX, Math.max(K_MIN, ansicht.k));
    // Die Karte darf den sichtbaren Bereich nicht ganz verlassen.
    var rand = 0.75;
    var minX = -(G.w * ansicht.k) + G.w * (1 - rand);
    var maxX = G.w * rand;
    var minY = -(G.h * ansicht.k) + G.h * (1 - rand);
    var maxY = G.h * rand;
    ansicht.x = Math.min(maxX, Math.max(minX, ansicht.x));
    ansicht.y = Math.min(maxY, Math.max(minY, ansicht.y));
  }

  /** Bildschirmpunkt in Kartenkoordinaten des viewBox umrechnen. */
  function zuKarte(clientX, clientY) {
    var ctm = karte.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var punkt = karte.createSVGPoint();
    punkt.x = clientX;
    punkt.y = clientY;
    return punkt.matrixTransform(ctm.inverse());
  }

  function zoomeAufPunkt(faktor, clientX, clientY) {
    var p = zuKarte(clientX, clientY);
    var vorher = ansicht.k;
    ansicht.k = Math.min(K_MAX, Math.max(K_MIN, ansicht.k * faktor));
    var echt = ansicht.k / vorher;
    ansicht.x = p.x - (p.x - ansicht.x) * echt;
    ansicht.y = p.y - (p.y - ansicht.y) * echt;
    begrenze();
    wendeAn();
  }

  function zoomeMittig(faktor) {
    var r = karte.getBoundingClientRect();
    zoomeAufPunkt(faktor, r.left + r.width / 2, r.top + r.height / 2);
  }

  var animation = null;
  function flieg(lat, lon, ziel_k) {
    var p = projiziere(lat, lon);
    var startX = ansicht.x, startY = ansicht.y, startK = ansicht.k;
    var zielK = Math.min(K_MAX, Math.max(K_MIN, ziel_k));
    // Der Punkt soll in der Mitte des sichtbaren Kartenfelds landen.
    var mitte = sichtbareMitte();
    var zielX = mitte.x - p.x * zielK;
    var zielY = mitte.y - p.y * zielK;
    var start = performance.now();
    cancelAnimationFrame(animation);

    (function schritt(jetzt) {
      var t = Math.min(1, (jetzt - start) / 520);
      var e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      ansicht.k = startK + (zielK - startK) * e;
      ansicht.x = startX + (zielX - startX) * e;
      ansicht.y = startY + (zielY - startY) * e;
      begrenze();
      wendeAn();
      if (t < 1) animation = requestAnimationFrame(schritt);
    })(start);
  }

  /**
   * Mitte des Kartenfelds in viewBox-Koordinaten - berücksichtigt die
   * Detailtafel, damit der gewählte Marker nicht darunter verschwindet.
   */
  function sichtbareMitte() {
    var r = karte.getBoundingClientRect();
    var tafelBreite = 0;
    var tafel = $('#tafel');
    if (tafel.classList.contains('offen') && window.innerWidth > 900) {
      tafelBreite = tafel.getBoundingClientRect().width;
    }
    var links = zuKarte(r.left, r.top);
    var rechts = zuKarte(r.right - tafelBreite, r.bottom);
    return { x: (links.x + rechts.x) / 2, y: (links.y + rechts.y) / 2 };
  }

  function ganzeKarte() {
    cancelAnimationFrame(animation);
    ansicht = { x: 0, y: 0, k: 1 };
    wendeAn();
  }

  /* ---- Ziehen, Rad und Zwei-Finger-Zoom */

  var zeiger = new Map();
  var zugStart = null;
  var kniffStart = null;
  var hatGezogen = false;

  // Der Zeiger wird erst eingefangen, wenn wirklich gezogen wird - sonst würde
  // der Browser den Klick auf einen Marker an das SVG umleiten.
  var eingefangen = null;

  function fangeEin(zeigerId) {
    if (eingefangen === zeigerId) return;
    try { karte.setPointerCapture(zeigerId); eingefangen = zeigerId; } catch (e) { /* egal */ }
  }

  karte.addEventListener('pointerdown', function (e) {
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    hatGezogen = false;
    if (zeiger.size === 1) {
      var p = zuKarte(e.clientX, e.clientY);
      zugStart = { p: p, x: ansicht.x, y: ansicht.y };
      karte.classList.add('zieht');
    } else if (zeiger.size === 2) {
      zeiger.forEach(function (_, id) { fangeEin(id); });
      kniffStart = kniffLage();
      kniffStart.k = ansicht.k;
      zugStart = null;
    }
  });

  karte.addEventListener('pointermove', function (e) {
    if (!zeiger.has(e.pointerId)) return;
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (zeiger.size === 2 && kniffStart) {
      var jetzt = kniffLage();
      if (kniffStart.abstand > 0) {
        var faktor = jetzt.abstand / kniffStart.abstand;
        ansicht.k = Math.min(K_MAX, Math.max(K_MIN, kniffStart.k * faktor));
        var echt = ansicht.k / kniffStart.k;
        ansicht.x = jetzt.p.x - (kniffStart.p.x - kniffStart.x0) * echt;
        ansicht.y = jetzt.p.y - (kniffStart.p.y - kniffStart.y0) * echt;
        begrenze();
        wendeAn();
      }
      hatGezogen = true;
      return;
    }

    if (zugStart) {
      var p = zuKarte(e.clientX, e.clientY);
      var dx = p.x - zugStart.p.x, dy = p.y - zugStart.p.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        hatGezogen = true;
        fangeEin(e.pointerId);
      }
      ansicht.x = zugStart.x + dx;
      ansicht.y = zugStart.y + dy;
      begrenze();
      wendeAn();
    }
  });

  function kniffLage() {
    var punkte = Array.from(zeiger.values());
    var mx = (punkte[0].x + punkte[1].x) / 2;
    var my = (punkte[0].y + punkte[1].y) / 2;
    var abstand = Math.hypot(punkte[0].x - punkte[1].x, punkte[0].y - punkte[1].y);
    var p = zuKarte(mx, my);
    return { p: p, abstand: abstand, x0: ansicht.x, y0: ansicht.y };
  }

  function zeigerEnde(e) {
    zeiger.delete(e.pointerId);
    if (eingefangen === e.pointerId) {
      try { karte.releasePointerCapture(e.pointerId); } catch (err) { /* egal */ }
      eingefangen = null;
    }
    if (zeiger.size < 2) kniffStart = null;
    if (zeiger.size === 0) {
      zugStart = null;
      karte.classList.remove('zieht');
    } else if (zeiger.size === 1) {
      var rest = Array.from(zeiger.values())[0];
      zugStart = { p: zuKarte(rest.x, rest.y), x: ansicht.x, y: ansicht.y };
    }
  }

  karte.addEventListener('pointerup', zeigerEnde);
  karte.addEventListener('pointercancel', zeigerEnde);

  karte.addEventListener('wheel', function (e) {
    e.preventDefault();
    var faktor = Math.pow(1.0016, -e.deltaY * (e.deltaMode === 1 ? 16 : 1));
    zoomeAufPunkt(faktor, e.clientX, e.clientY);
  }, { passive: false });

  karte.addEventListener('dblclick', function (e) {
    if (setzeModus) return;
    zoomeAufPunkt(1.8, e.clientX, e.clientY);
  });

  karte.addEventListener('click', function (e) {
    if (hatGezogen) return;
    var getroffen = e.target.closest ? e.target.closest('.marker') : null;
    if (getroffen && !setzeModus) { oeffneTafel(getroffen.getAttribute('data-id')); return; }
    if (setzeModus) {
      var p = zuKarte(e.clientX, e.clientY);
      var welt = { x: (p.x - ansicht.x) / ansicht.k, y: (p.y - ansicht.y) / ansicht.k };
      var koordinaten = entprojiziere(welt.x, welt.y);
      var rueckruf = setzeModus;
      beendeSetzen();
      rueckruf(koordinaten);
      return;
    }
    if (e.target === karte || e.target.classList.contains('land')) schliesseTafel();
  });

  $('#knopfPlus').onclick = function () { zoomeMittig(1.5); };
  $('#knopfMinus').onclick = function () { zoomeMittig(1 / 1.5); };
  $('#knopfHeim').onclick = ganzeKarte;

  /* ---- Position auf der Karte wählen */

  function starteSetzen(rueckruf, hinweis) {
    setzeModus = rueckruf;
    karte.classList.add('setzt');
    var leiste = h('div', { class: 'hinweisleiste', id: 'setzHinweis' },
      hinweis || 'Auf die Karte klicken, um die Position zu setzen',
      h('button', {
        class: 'knopf klein', onclick: function () {
          beendeSetzen();
          if (abbruchSetzen) abbruchSetzen();
        }
      }, 'Abbrechen'));
    $('#kartenfeld').appendChild(leiste);
  }

  var abbruchSetzen = null;

  function beendeSetzen() {
    setzeModus = null;
    karte.classList.remove('setzt');
    var leiste = $('#setzHinweis');
    if (leiste) leiste.remove();
  }

  /* ------------------------------------------------------------ Seitenleiste */

  var suchtext = '';

  function passt(ort) {
    if (!suchtext) return true;
    var s = suchtext.toLowerCase();
    return (ort.name + ' ' + ort.ort).toLowerCase().indexOf(s) >= 0;
  }

  function zeichneListe() {
    var behaelter = $('#liste');
    behaelter.textContent = '';

    var sitze = daten.sitze.filter(function (s) { return passt(s); });
    var projekte = daten.projekte.filter(function (p) { return passt(p); })
      .slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });

    if (!sitze.length && !projekte.length) {
      behaelter.appendChild(h('div', { class: 'leer', text: 'Nichts gefunden.' }));
      return;
    }

    if (sitze.length) {
      behaelter.appendChild(h('div', { class: 'listen-titel', text: 'Betriebssitze' }));
      sitze.forEach(function (s) { behaelter.appendChild(listenEintrag(s, 'sitz')); });
    }
    if (projekte.length) {
      behaelter.appendChild(h('div', {
        class: 'listen-titel',
        text: 'Projekte (' + projekte.length + ')'
      }));
      projekte.forEach(function (p) { behaelter.appendChild(listenEintrag(p, 'projekt')); });
    }
  }

  function listenEintrag(ort, art) {
    return h('button', {
      class: 'eintrag' + (art === 'sitz' ? ' sitz' : '') + (ort.id === gewaehlteId ? ' aktiv' : ''),
      onclick: function () {
        oeffneTafel(ort.id);
        if (window.innerWidth <= 900) $('#seitenleiste').classList.remove('offen');
      }
    },
      h('span', { class: 'punkt' }),
      h('span', { class: 'beschriftung' },
        h('span', { class: 'name', text: ort.name }),
        ort.ort ? h('span', { class: 'ort', text: ort.ort }) : null));
  }

  $('#suche').addEventListener('input', function (e) {
    suchtext = e.target.value.trim();
    zeichneListe();
  });

  $('#knopfListe').onclick = function () {
    $('#seitenleiste').classList.toggle('offen');
  };

  /* ------------------------------------------------------------ Detailtafel */

  function oeffneTafel(id) {
    var ort = findeOrt(id);
    if (!ort) return;
    gewaehlteId = id;

    var inhalt = $('#tafelInhalt');
    inhalt.textContent = '';
    inhalt.scrollTop = 0;

    inhalt.appendChild(h('img', {
      class: 'titelbild', src: bildQuelle(ort), alt: ort.name
    }));

    var text = h('div', { class: 'tafel-text' });
    text.appendChild(h('span', {
      class: 'tafel-marke' + (ort.art === 'sitz' ? ' sitz' : ''),
      text: ort.art === 'sitz' ? 'Betriebssitz' : 'Projekt'
    }));
    text.appendChild(h('h2', { text: ort.name }));
    if (ort.ort) text.appendChild(h('div', { class: 'unterzeile', text: ort.ort }));

    var fakten = ort.fakten.filter(function (f) { return f.label || f.wert; });
    if (fakten.length) {
      var raster = h('dl', { class: 'eckdaten' });
      fakten.forEach(function (f) {
        raster.appendChild(h('div', null,
          h('dt', { text: f.label }),
          h('dd', { text: f.wert || '—' })));
      });
      text.appendChild(raster);
    }

    if (ort.text) {
      var beschreibung = h('div', { class: 'beschreibung' });
      ort.text.split(/\n\s*\n/).forEach(function (absatz) {
        var p = h('p');
        absatz.split('\n').forEach(function (zeile, i) {
          if (i) p.appendChild(document.createElement('br'));
          p.appendChild(document.createTextNode(zeile));
        });
        beschreibung.appendChild(p);
      });
      text.appendChild(beschreibung);
    }

    if (ort.bilder.length) {
      text.appendChild(h('div', { class: 'abschnitt-titel', text: 'Bilder' }));
      var galerie = h('div', { class: 'galerie' });
      ort.bilder.forEach(function (bild, i) {
        galerie.appendChild(h('figure', null,
          h('img', {
            src: bild.src, alt: bild.text || ort.name, loading: 'lazy',
            onclick: function () { oeffneLichtkasten(ort.bilder, i); }
          }),
          bild.text ? h('figcaption', { text: bild.text }) : null));
      });
      text.appendChild(galerie);
    }

    if (freigegeben) {
      text.appendChild(h('div', { class: 'abschnitt-titel', text: 'Mitarbeiterbereich' }));
      text.appendChild(h('button', {
        class: 'knopf', onclick: function () {
          oeffneEditor(ort.art, JSON.parse(JSON.stringify(ort)), false);
        }
      }, 'Diesen Eintrag bearbeiten'));
    }

    inhalt.appendChild(text);

    var tafel = $('#tafel');
    tafel.classList.add('offen');
    tafel.setAttribute('aria-hidden', 'false');
    $('#kartenfeld').classList.add('tafel-offen');

    zeichneMarker();
    zeichneListe();
    flieg(ort.lat, ort.lon, Math.max(ansicht.k, 2.8));
  }

  function schliesseTafel() {
    var tafel = $('#tafel');
    tafel.classList.remove('offen');
    tafel.setAttribute('aria-hidden', 'true');
    $('#kartenfeld').classList.remove('tafel-offen');
    gewaehlteId = null;
    zeichneMarker();
    zeichneListe();
  }

  $('#tafelSchliessen').onclick = schliesseTafel;

  /* ------------------------------------------------------------ Bildansicht */

  var lkBilder = [], lkNummer = 0;

  function oeffneLichtkasten(bilder, nummer) {
    lkBilder = bilder;
    lkNummer = nummer;
    zeigeLichtkastenBild();
    $('#lichtkasten').classList.add('offen');
  }

  function zeigeLichtkastenBild() {
    var bild = lkBilder[lkNummer];
    if (!bild) return;
    $('#lkBild').src = bild.src;
    $('#lkText').textContent = bild.text || '';
    var mehrere = lkBilder.length > 1;
    $('#lkVor').style.display = mehrere ? '' : 'none';
    $('#lkZurueck').style.display = mehrere ? '' : 'none';
  }

  function blaettere(richtung) {
    if (!lkBilder.length) return;
    lkNummer = (lkNummer + richtung + lkBilder.length) % lkBilder.length;
    zeigeLichtkastenBild();
  }

  function schliesseLichtkasten() { $('#lichtkasten').classList.remove('offen'); }

  $('#lkZu').onclick = schliesseLichtkasten;
  $('#lkVor').onclick = function () { blaettere(1); };
  $('#lkZurueck').onclick = function () { blaettere(-1); };
  $('#lichtkasten').addEventListener('click', function (e) {
    if (e.target === this) schliesseLichtkasten();
  });

  document.addEventListener('keydown', function (e) {
    if ($('#lichtkasten').classList.contains('offen')) {
      if (e.key === 'Escape') schliesseLichtkasten();
      if (e.key === 'ArrowRight') blaettere(1);
      if (e.key === 'ArrowLeft') blaettere(-1);
      return;
    }
    if (e.key !== 'Escape') return;
    if ($('#schleier').classList.contains('offen')) schliesseDialog();
    else if (setzeModus) { beendeSetzen(); if (abbruchSetzen) abbruchSetzen(); }
    else schliesseTafel();
  });

  /* ------------------------------------------------------------ Dialog */

  function zeigeDialog(einstellung) {
    $('#dialogTitel').textContent = einstellung.titel || '';
    var koerper = $('#dialogKoerper');
    var fuss = $('#dialogFuss');
    koerper.textContent = '';
    fuss.textContent = '';
    koerper.scrollTop = 0;
    anhaengen(koerper, einstellung.inhalt);
    anhaengen(fuss, einstellung.knoepfe || []);
    $('#dialog').classList.toggle('breit', !!einstellung.breit);
    $('#schleier').classList.add('offen');
    var erstes = koerper.querySelector('input, textarea, select');
    if (erstes && einstellung.fokus !== false) setTimeout(function () { erstes.focus(); }, 60);
  }

  function schliesseDialog() {
    $('#schleier').classList.remove('offen');
  }

  $('#dialogSchliessen').onclick = schliesseDialog;
  $('#schleier').addEventListener('mousedown', function (e) {
    if (e.target === this) schliesseDialog();
  });

  function feld(beschriftung, eingabe, hilfe) {
    return h('div', { class: 'feld' },
      beschriftung ? h('label', { text: beschriftung }) : null,
      eingabe,
      hilfe ? h('div', { class: 'hilfe', text: hilfe }) : null);
  }

  /* ------------------------------------------------------------ Anmeldung */

  $('#knopfMitarbeiter').onclick = function () {
    if (freigegeben) oeffneVerwaltung('projekte');
    else frageKennwort();
  };

  function frageKennwort() {
    var eingabe = h('input', { type: 'password', id: 'kw', autocomplete: 'current-password' });
    var meldungsfeld = h('div');

    function pruefe() {
      passwortStimmt(eingabe.value).then(function (ok) {
        if (!ok) {
          meldungsfeld.textContent = '';
          meldungsfeld.appendChild(h('div', { class: 'fehler', text: 'Kennwort stimmt nicht.' }));
          eingabe.value = '';
          eingabe.focus();
          return;
        }
        schalteFrei(true);
        schliesseDialog();
        melde('Mitarbeiterbereich freigeschaltet');
        oeffneVerwaltung('projekte');
      });
    }

    eingabe.addEventListener('keydown', function (e) { if (e.key === 'Enter') pruefe(); });

    zeigeDialog({
      titel: 'Mitarbeiterbereich',
      inhalt: [
        meldungsfeld,
        feld('Kennwort', eingabe,
          daten.einstellungen.passwortHash
            ? null
            : 'Noch kein eigenes Kennwort gesetzt - es gilt „' + STANDARD_PASSWORT +
              '“. Bitte in den Einstellungen ändern.')
      ],
      knoepfe: [
        h('button', { class: 'knopf', onclick: schliesseDialog }, 'Abbrechen'),
        h('button', { class: 'knopf haupt', onclick: pruefe }, 'Anmelden')
      ]
    });
  }

  /* ------------------------------------------------------------ Verwaltung */

  function oeffneVerwaltung(reiter) {
    var inhalt = h('div');

    function baue() {
      inhalt.textContent = '';
      var leiste = h('div', { class: 'reiter', style: 'margin:-20px -20px 16px;padding:0 4px;' });
      [['projekte', 'Projekte'], ['sitze', 'Betriebssitze'], ['einstellungen', 'Einstellungen']]
        .forEach(function (r) {
          leiste.appendChild(h('button', {
            class: reiter === r[0] ? 'aktiv' : '',
            onclick: function () { reiter = r[0]; baue(); }
          }, r[1]));
        });
      inhalt.appendChild(leiste);

      if (reiter === 'einstellungen') inhalt.appendChild(baueEinstellungen());
      else inhalt.appendChild(baueEintragsliste(reiter === 'sitze' ? 'sitz' : 'projekt'));
    }

    baue();

    zeigeDialog({
      titel: 'Mitarbeiterbereich',
      breit: true,
      fokus: false,
      inhalt: inhalt,
      knoepfe: [
        h('button', {
          class: 'knopf leise', onclick: function () {
            schalteFrei(false);
            schliesseDialog();
            zeichneListe();
            if (gewaehlteId) oeffneTafel(gewaehlteId);
            melde('Abgemeldet');
          }
        }, 'Abmelden'),
        h('button', { class: 'knopf haupt', onclick: schliesseDialog }, 'Fertig')
      ]
    });
  }

  function baueEintragsliste(art) {
    var eintraege = art === 'sitz' ? daten.sitze : daten.projekte;
    var behaelter = h('div');

    behaelter.appendChild(h('div', {
      style: 'display:flex;align-items:center;gap:12px;margin-bottom:14px;'
    },
      h('div', { style: 'flex:1;color:var(--text-leise);font-size:13px;' },
        eintraege.length + (art === 'sitz' ? ' Betriebssitze' : ' Projekte')),
      h('button', {
        class: 'knopf haupt', onclick: function () { oeffneEditor(art, leererEintrag(art), true); }
      }, art === 'sitz' ? '+ Betriebssitz' : '+ Projekt')));

    if (!eintraege.length) {
      behaelter.appendChild(h('div', { class: 'leer', text: 'Noch nichts angelegt.' }));
      return behaelter;
    }

    var liste = h('div', { class: 'verwaltung-liste' });
    eintraege.forEach(function (e, i) {
      liste.appendChild(h('div', { class: 'verwaltung-zeile' },
        h('img', { src: bildQuelle(Object.assign({ art: art }, e)), alt: '' }),
        h('div', { class: 'beschriftung' },
          h('div', { class: 'name', text: e.name }),
          h('div', {
            class: 'ort',
            text: (e.ort ? e.ort + ' · ' : '') + e.lat.toFixed(4) + ', ' + e.lon.toFixed(4) +
              ' · ' + e.bilder.length + ' Bilder'
          })),
        h('button', {
          class: 'knopf klein', onclick: function () {
            oeffneEditor(art, JSON.parse(JSON.stringify(e)), false);
          }
        }, 'Bearbeiten'),
        h('button', {
          class: 'knopf klein gefahr', onclick: function () { frageLoeschen(art, i); }
        }, 'Löschen')));
    });
    behaelter.appendChild(liste);
    return behaelter;
  }

  function leererEintrag(art) {
    var felder = art === 'sitz' ? STANDARD_FELDER_SITZ : STANDARD_FELDER_PROJEKT;
    return {
      id: neueId(), name: '', ort: '', lat: 51.2, lon: 10.4, titelbild: '',
      fakten: felder.map(function (f) { return { label: f, wert: '' }; }),
      text: '', bilder: []
    };
  }

  function frageLoeschen(art, nummer) {
    var liste = art === 'sitz' ? daten.sitze : daten.projekte;
    var eintrag = liste[nummer];
    zeigeDialog({
      titel: 'Wirklich löschen?',
      inhalt: h('p', {
        text: '„' + eintrag.name + '“ wird mit allen Bildern und Eckdaten entfernt. ' +
          'Das lässt sich nicht rückgängig machen.'
      }),
      knoepfe: [
        h('button', { class: 'knopf', onclick: function () { oeffneVerwaltung(art === 'sitz' ? 'sitze' : 'projekte'); } }, 'Abbrechen'),
        h('button', {
          class: 'knopf gefahr', onclick: function () {
            liste.splice(nummer, 1);
            if (gewaehlteId === eintrag.id) schliesseTafel();
            speichern();
            zeichneMarker();
            zeichneListe();
            melde('Gelöscht');
            oeffneVerwaltung(art === 'sitz' ? 'sitze' : 'projekte');
          }
        }, 'Endgültig löschen')
      ]
    });
  }

  /* ------------------------------------------------------------ Bilder */

  /** Datei einlesen, auf Kantenlänge begrenzen und als Data-URL zurückgeben. */
  function leseBild(datei, maxKante) {
    return new Promise(function (fertig, fehler) {
      if (!/^image\//.test(datei.type)) return fehler(new Error('Keine Bilddatei'));
      var leser = new FileReader();
      leser.onerror = function () { fehler(new Error('Datei nicht lesbar')); };
      leser.onload = function () {
        var bild = new Image();
        bild.onerror = function () { fehler(new Error('Bild nicht lesbar')); };
        bild.onload = function () {
          var faktor = Math.min(1, maxKante / Math.max(bild.width, bild.height));
          var breite = Math.max(1, Math.round(bild.width * faktor));
          var hoehe = Math.max(1, Math.round(bild.height * faktor));
          var flaeche = document.createElement('canvas');
          flaeche.width = breite;
          flaeche.height = hoehe;
          var stift = flaeche.getContext('2d');
          stift.fillStyle = '#fff';
          stift.fillRect(0, 0, breite, hoehe);
          stift.drawImage(bild, 0, 0, breite, hoehe);
          fertig(flaeche.toDataURL('image/jpeg', 0.82));
        };
        bild.src = leser.result;
      };
      leser.readAsDataURL(datei);
    });
  }

  function dateiWaehler(mehrere, beiAuswahl) {
    var eingabe = h('input', {
      type: 'file', accept: 'image/*', style: 'display:none', multiple: mehrere || null
    });
    eingabe.addEventListener('change', function () {
      var dateien = Array.prototype.slice.call(eingabe.files);
      eingabe.value = '';
      if (dateien.length) beiAuswahl(dateien);
    });
    return eingabe;
  }

  /* ------------------------------------------------------------ Editor */

  function oeffneEditor(art, entwurf, istNeu) {
    var zurueckReiter = art === 'sitz' ? 'sitze' : 'projekte';

    var nameFeld = h('input', { type: 'text', value: entwurf.name, placeholder: 'z. B. Wohnquartier Nordpark' });
    var ortFeld = h('input', { type: 'text', value: entwurf.ort, placeholder: 'z. B. Hamburg, Hamburg' });
    var latFeld = h('input', { type: 'text', value: entwurf.lat, inputmode: 'decimal' });
    var lonFeld = h('input', { type: 'text', value: entwurf.lon, inputmode: 'decimal' });

    function uebernehmen() {
      entwurf.name = nameFeld.value.trim();
      entwurf.ort = ortFeld.value.trim();
      entwurf.lat = zahl(latFeld.value, entwurf.lat);
      entwurf.lon = zahl(lonFeld.value, entwurf.lon);
      entwurf.text = textFeld.value;
      entwurf.fakten = faktenAuslesen();
    }

    /* Titelbild */
    var titelVorschau = h('img', {
      class: 'vorschau-titelbild', alt: '',
      src: entwurf.titelbild || platzhalter(entwurf.name || '?', art === 'sitz')
    });
    var titelWaehler = dateiWaehler(false, function (dateien) {
      leseBild(dateien[0], 1600).then(function (quelle) {
        entwurf.titelbild = quelle;
        titelVorschau.src = quelle;
      }).catch(function () { melde('Bild konnte nicht gelesen werden.'); });
    });

    /* Eckdaten */
    var faktenListe = h('div');

    function faktenZeile(fakt) {
      var label = h('input', { type: 'text', value: fakt.label, placeholder: 'Bezeichnung' });
      var wert = h('input', { type: 'text', value: fakt.wert, placeholder: 'Wert' });
      var zeile = h('div', { class: 'daten-reihe' },
        label, wert,
        h('button', {
          class: 'knopf klein', title: 'Nach oben', onclick: function () {
            var vorher = zeile.previousElementSibling;
            if (vorher) faktenListe.insertBefore(zeile, vorher);
          }
        }, '↑'),
        h('button', {
          class: 'knopf klein', title: 'Nach unten', onclick: function () {
            var danach = zeile.nextElementSibling;
            if (danach) faktenListe.insertBefore(danach, zeile);
          }
        }, '↓'),
        h('button', {
          class: 'knopf klein gefahr', title: 'Zeile entfernen',
          onclick: function () { zeile.remove(); }
        }, '×'));
      zeile._label = label;
      zeile._wert = wert;
      return zeile;
    }

    function faktenAuslesen() {
      return Array.prototype.map.call(faktenListe.children, function (zeile) {
        return { label: zeile._label.value.trim(), wert: zeile._wert.value.trim() };
      }).filter(function (f) { return f.label || f.wert; });
    }

    entwurf.fakten.forEach(function (f) { faktenListe.appendChild(faktenZeile(f)); });

    /* Beschreibung */
    var textFeld = h('textarea', {
      placeholder: 'Beschreibung des Projekts. Leerzeile trennt Absätze.'
    });
    textFeld.value = entwurf.text;

    /* Weitere Bilder */
    var bilderListe = h('div');

    function bildZeile(bild) {
      var beschriftung = h('input', { type: 'text', value: bild.text, placeholder: 'Bildunterschrift (optional)' });
      var zeile = h('div', { class: 'bild-reihe' },
        h('img', { src: bild.src, alt: '' }),
        beschriftung,
        h('button', {
          class: 'knopf klein', title: 'Nach vorn', onclick: function () {
            var vorher = zeile.previousElementSibling;
            if (vorher) bilderListe.insertBefore(zeile, vorher);
          }
        }, '↑'),
        h('button', {
          class: 'knopf klein gefahr', onclick: function () { zeile.remove(); }
        }, 'Entfernen'));
      zeile._src = bild.src;
      zeile._text = beschriftung;
      return zeile;
    }

    function bilderAuslesen() {
      return Array.prototype.map.call(bilderListe.children, function (zeile) {
        return { src: zeile._src, text: zeile._text.value.trim() };
      });
    }

    entwurf.bilder.forEach(function (b) { bilderListe.appendChild(bildZeile(b)); });

    var bilderWaehler = dateiWaehler(true, function (dateien) {
      Promise.all(dateien.map(function (d) { return leseBild(d, 1400).catch(function () { return null; }); }))
        .then(function (quellen) {
          quellen.filter(Boolean).forEach(function (q) {
            bilderListe.appendChild(bildZeile({ src: q, text: '' }));
          });
          melde(quellen.filter(Boolean).length + ' Bild(er) hinzugefügt');
        });
    });

    /* Speichern */
    function speichereEintrag() {
      uebernehmen();
      entwurf.bilder = bilderAuslesen();
      if (!entwurf.name) { melde('Bitte einen Namen eintragen.'); nameFeld.focus(); return; }

      var liste = art === 'sitz' ? daten.sitze : daten.projekte;
      var nummer = -1;
      liste.forEach(function (e, i) { if (e.id === entwurf.id) nummer = i; });
      if (nummer >= 0) liste[nummer] = eintragAufraeumen(entwurf);
      else liste.push(eintragAufraeumen(entwurf));

      if (!speichern()) return;
      zeichneMarker();
      zeichneListe();
      if (gewaehlteId === entwurf.id) oeffneTafel(entwurf.id);
      melde(istNeu ? 'Angelegt' : 'Gespeichert');
      oeffneVerwaltung(zurueckReiter);
    }

    zeigeDialog({
      titel: (istNeu ? 'Neu anlegen: ' : 'Bearbeiten: ') +
        (art === 'sitz' ? 'Betriebssitz' : 'Projekt'),
      breit: true,
      inhalt: [
        h('div', { class: 'reihe' },
          feld('Name', nameFeld),
          feld('Ort / Untertitel', ortFeld)),

        h('div', { class: 'abschnitt-titel', text: 'Position auf der Karte' }),
        h('div', { class: 'reihe' },
          feld('Breitengrad', latFeld),
          feld('Längengrad', lonFeld)),
        h('div', { style: 'margin:-4px 0 18px;' },
          h('button', {
            class: 'knopf', onclick: function () {
              uebernehmen();
              entwurf.bilder = bilderAuslesen();
              schliesseDialog();
              abbruchSetzen = function () { oeffneEditor(art, entwurf, istNeu); };
              starteSetzen(function (koordinaten) {
                entwurf.lat = koordinaten.lat;
                entwurf.lon = koordinaten.lon;
                oeffneEditor(art, entwurf, istNeu);
                melde('Position übernommen');
              }, 'Auf die Karte klicken, um „' + (entwurf.name || 'den Eintrag') + '“ zu setzen');
            }
          }, '📍 Position auf der Karte wählen')),

        h('div', { class: 'abschnitt-titel', text: 'Titelbild' }),
        titelVorschau,
        h('div', { style: 'display:flex;gap:8px;margin-bottom:6px;' },
          h('button', { class: 'knopf', onclick: function () { titelWaehler.click(); } }, 'Bild auswählen'),
          h('button', {
            class: 'knopf leise', onclick: function () {
              entwurf.titelbild = '';
              titelVorschau.src = platzhalter(nameFeld.value || '?', art === 'sitz');
            }
          }, 'Entfernen')),
        titelWaehler,
        h('div', { class: 'hilfe', text: 'Bilder werden automatisch auf 1600 px verkleinert.' }),

        h('div', { class: 'abschnitt-titel', text: 'Eckdaten' }),
        faktenListe,
        h('button', {
          class: 'knopf klein', onclick: function () {
            faktenListe.appendChild(faktenZeile({ label: '', wert: '' }));
          }
        }, '+ Zeile hinzufügen'),
        h('div', { class: 'hilfe', text: 'Bezeichnung und Wert sind frei wählbar - so lassen sich später beliebige Kennzahlen ergänzen.' }),

        h('div', { class: 'abschnitt-titel', text: 'Beschreibung' }),
        textFeld,

        h('div', { class: 'abschnitt-titel', text: 'Weitere Bilder' }),
        bilderListe,
        h('button', { class: 'knopf klein', onclick: function () { bilderWaehler.click(); } },
          '+ Bilder hinzufügen'),
        bilderWaehler
      ],
      knoepfe: [
        h('button', {
          class: 'knopf', onclick: function () { oeffneVerwaltung(zurueckReiter); }
        }, 'Abbrechen'),
        h('button', { class: 'knopf haupt', onclick: speichereEintrag }, 'Speichern')
      ]
    });
  }

  /* ------------------------------------------------------------ Einstellungen */

  function baueEinstellungen() {
    var behaelter = h('div');

    /* Seitentitel */
    var titelFeld = h('input', { type: 'text', value: daten.einstellungen.seitentitel });
    behaelter.appendChild(h('div', { class: 'abschnitt-titel', text: 'Überschrift der Seite' }));
    behaelter.appendChild(feld(null, titelFeld));
    behaelter.appendChild(h('button', {
      class: 'knopf klein', onclick: function () {
        daten.einstellungen.seitentitel = titelFeld.value.trim() || 'Unsere Projekte in Deutschland';
        if (speichern()) {
          $('#seitentitel').textContent = daten.einstellungen.seitentitel;
          document.title = daten.einstellungen.seitentitel;
          melde('Überschrift gespeichert');
        }
      }
    }, 'Überschrift speichern'));

    /* Kennwort */
    var altFeld = h('input', { type: 'password', autocomplete: 'current-password' });
    var neuFeld = h('input', { type: 'password', autocomplete: 'new-password' });
    var wiederFeld = h('input', { type: 'password', autocomplete: 'new-password' });
    var kwMeldung = h('div');

    function kwHinweis(klasse, text) {
      kwMeldung.textContent = '';
      kwMeldung.appendChild(h('div', { class: klasse, text: text }));
    }

    behaelter.appendChild(h('div', { class: 'abschnitt-titel', text: 'Kennwort für den Mitarbeiterbereich' }));
    behaelter.appendChild(kwMeldung);
    behaelter.appendChild(feld('Bisheriges Kennwort', altFeld,
      daten.einstellungen.passwortHash ? null : 'Zurzeit gilt das Standardkennwort „' + STANDARD_PASSWORT + '“.'));
    behaelter.appendChild(h('div', { class: 'reihe' },
      feld('Neues Kennwort', neuFeld),
      feld('Neues Kennwort wiederholen', wiederFeld)));
    behaelter.appendChild(h('button', {
      class: 'knopf klein', onclick: function () {
        if (neuFeld.value.length < 4) return kwHinweis('fehler', 'Das neue Kennwort ist zu kurz (mindestens 4 Zeichen).');
        if (neuFeld.value !== wiederFeld.value) return kwHinweis('fehler', 'Die beiden neuen Kennwörter stimmen nicht überein.');
        passwortStimmt(altFeld.value).then(function (ok) {
          if (!ok) return kwHinweis('fehler', 'Das bisherige Kennwort stimmt nicht.');
          hashe(neuFeld.value).then(function (hash) {
            daten.einstellungen.passwortHash = hash;
            if (speichern()) {
              altFeld.value = neuFeld.value = wiederFeld.value = '';
              kwHinweis('erfolg', 'Kennwort geändert.');
              melde('Kennwort geändert');
            }
          });
        });
      }
    }, 'Kennwort ändern'));

    behaelter.appendChild(h('div', {
      class: 'hilfe',
      style: 'margin-top:8px;',
      text: 'Hinweis: Der Schutz läuft im Browser und hält Unbeteiligte fern. ' +
        'Wer die Daten wirklich absichern will, betreibt die Seite hinter einer ' +
        'echten Anmeldung auf dem Server.'
    }));

    /* Sicherung */
    behaelter.appendChild(h('div', { class: 'abschnitt-titel', text: 'Daten sichern und übertragen' }));
    behaelter.appendChild(h('div', {
      class: 'hilfe', style: 'margin-bottom:10px;',
      text: 'Alle Einträge liegen nur in diesem Browser. Für eine Sicherung oder den ' +
        'Wechsel auf einen anderen Rechner die Daten als Datei exportieren.'
    }));

    var einleseWaehler = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    einleseWaehler.addEventListener('change', function () {
      var datei = einleseWaehler.files[0];
      einleseWaehler.value = '';
      if (!datei) return;
      var leser = new FileReader();
      leser.onload = function () {
        try {
          var eingelesen = raeumeAuf(JSON.parse(leser.result));
        } catch (e) {
          melde('Datei konnte nicht gelesen werden.');
          return;
        }
        zeigeDialog({
          titel: 'Daten einlesen',
          inhalt: h('p', {
            text: 'Die Datei enthält ' + eingelesen.sitze.length + ' Betriebssitze und ' +
              eingelesen.projekte.length + ' Projekte. Der jetzige Stand wird dabei ersetzt.'
          }),
          knoepfe: [
            h('button', { class: 'knopf', onclick: function () { oeffneVerwaltung('einstellungen'); } }, 'Abbrechen'),
            h('button', {
              class: 'knopf haupt', onclick: function () {
                // Ein bereits gesetztes Kennwort bleibt erhalten.
                eingelesen.einstellungen.passwortHash =
                  eingelesen.einstellungen.passwortHash || daten.einstellungen.passwortHash;
                daten = eingelesen;
                speichern();
                schliesseTafel();
                $('#seitentitel').textContent = daten.einstellungen.seitentitel;
                zeichneMarker();
                zeichneListe();
                ganzeKarte();
                melde('Daten eingelesen');
                oeffneVerwaltung('einstellungen');
              }
            }, 'Jetzt ersetzen')
          ]
        });
      };
      leser.readAsText(datei);
    });

    behaelter.appendChild(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' },
      h('button', { class: 'knopf klein', onclick: exportiere }, '⬇ Daten exportieren (JSON)'),
      h('button', { class: 'knopf klein', onclick: function () { einleseWaehler.click(); } },
        '⬆ Daten einlesen'),
      einleseWaehler,
      h('button', {
        class: 'knopf klein gefahr', onclick: function () {
          zeigeDialog({
            titel: 'Auf Demodaten zurücksetzen?',
            inhalt: h('p', {
              text: 'Alle Projekte, Betriebssitze und Bilder werden gelöscht und durch die ' +
                'Beispieldaten ersetzt. Vorher am besten exportieren.'
            }),
            knoepfe: [
              h('button', { class: 'knopf', onclick: function () { oeffneVerwaltung('einstellungen'); } }, 'Abbrechen'),
              h('button', {
                class: 'knopf gefahr', onclick: function () {
                  var altesKennwort = daten.einstellungen.passwortHash;
                  daten = demodaten();
                  daten.einstellungen.passwortHash = altesKennwort;
                  speichern();
                  schliesseTafel();
                  zeichneMarker();
                  zeichneListe();
                  ganzeKarte();
                  melde('Zurückgesetzt');
                  oeffneVerwaltung('einstellungen');
                }
              }, 'Zurücksetzen')
            ]
          });
        }
      }, 'Auf Demodaten zurücksetzen')));

    /* Speicherbedarf */
    var bytes = speicherGroesse();
    var anteil = Math.min(100, Math.round(bytes / 5e6 * 100));
    behaelter.appendChild(h('div', { class: 'abschnitt-titel', text: 'Speicherbedarf' }));
    behaelter.appendChild(h('div', { class: 'speicher-balken' },
      h('i', { style: 'width:' + anteil + '%' })));
    behaelter.appendChild(h('div', {
      class: 'hilfe',
      text: (bytes / 1048576).toFixed(2) + ' MB von etwa 5 MB, die ein Browser je Seite ' +
        'freigibt. Wird es eng, hilft ein Export und weniger große Bilder.'
    }));

    return behaelter;
  }

  function exportiere() {
    var text = JSON.stringify(daten, null, 2);
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var heute = new Date().toISOString().slice(0, 10);
    var verweis = h('a', { href: url, download: 'projektkarte-' + heute + '.json' });
    document.body.appendChild(verweis);
    verweis.click();
    verweis.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    melde('Export gestartet');
  }

  /* ------------------------------------------------------------ Start */

  $('#seitentitel').textContent = daten.einstellungen.seitentitel;
  document.title = daten.einstellungen.seitentitel;
  zeichneLaender();
  zeichneMarker();
  zeichneListe();
  wendeAn();

  window.addEventListener('resize', setzeMarkerGroesse);
})();
