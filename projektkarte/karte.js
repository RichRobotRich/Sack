/**
 * Projektkarte - die öffentliche Kartenanwendung.
 *
 * Liest ausschließlich: Standorte, Einstellungen und Bilder kommen über die
 * REST-Schnittstelle unter api/ aus der SQLite-Datenbank. Gepflegt wird alles
 * im getrennten Adminbereich unter /admin, zu dem es von hier aus bewusst
 * keinen Weg gibt.
 */
(function () {
  'use strict';
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

  var TOENE = {
    blau: ['#1d4ed8', '#60a5fa'],
    dunkel: ['#0f172a', '#334155'],
    rot: ['#991b1b', '#f87171']
  };

  /** Farbiger Platzhalter, solange kein Bild hinterlegt ist. */
  function platzhalter(text, ton) {
    var kuerzel = String(text || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
    var farben = TOENE[ton] || TOENE.blau;
    var a = farben[0];
    var b = farben[1];
    var quelle = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">' +
      '<defs><linearGradient id="v" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/>' +
      '</linearGradient></defs><rect width="640" height="360" fill="url(#v)"/>' +
      '<text x="320" y="200" font-family="Segoe UI,Arial,sans-serif" font-size="96" font-weight="700" ' +
      'fill="rgba(255,255,255,.85)" text-anchor="middle">' + kuerzel + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(quelle);
  }

  function bildQuelle(objekt) {
    return objekt.titelbild || platzhalter(objekt.name, (ARTEN[objekt.art] || ARTEN.projekt).ton);
  }

  /* ------------------------------------------------------------ Daten */

  var G = window.GEO_DE;

  // Relativ, damit die Anwendung auch in einem Unterordner des Webservers läuft.
  var API = 'api/';

  var ARTEN = {
    sitz:            { einzahl: 'Betriebssitz',    mehrzahl: 'Betriebssitze',    ton: 'dunkel' },
    projekt:         { einzahl: 'Projekt',         mehrzahl: 'Projekte',         ton: 'blau' },
    fernaufschaltung:{ einzahl: 'Fernaufschaltung',mehrzahl: 'Fernaufschaltungen',ton: 'rot' }
  };

  var einstellungen = {
    seitentitel: 'Unsere Projekte in Deutschland',
    ruheSekunden: 20,
    kachelQuelle: ''
  };

  var standorte = [];

  function hole(pfad) {
    return fetch(API + pfad, { headers: { Accept: 'application/json' } })
      .then(function (antwort) {
        if (!antwort.ok) throw new Error('Die Schnittstelle antwortet mit ' + antwort.status);
        return antwort.json();
      });
  }

  function listeFuer(art) {
    return standorte.filter(function (s) { return s.art === art; });
  }

  /**
   * Alle Standorte in Zeichenreihenfolge - was zuletzt kommt, liegt auf der
   * Karte obenauf, deshalb die Betriebssitze am Ende.
   */
  function alleOrte() {
    return listeFuer('fernaufschaltung')
      .concat(listeFuer('projekt'))
      .concat(listeFuer('sitz'));
  }

  function findeOrt(id) {
    for (var i = 0; i < standorte.length; i++) {
      if (String(standorte[i].id) === String(id)) return standorte[i];
    }
    return null;
  }

  function bildUrl(id) { return API + 'bilder/' + id; }

  function bildQuelle(ort) {
    return ort.titelbildId
      ? bildUrl(ort.titelbildId)
      : platzhalter(ort.name, (ARTEN[ort.art] || ARTEN.projekt).ton);
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
  var ebeneKacheln = $('#ebeneKacheln');
  var ebeneLaender = $('#ebeneLaender');
  var ebeneMarker = $('#ebeneMarker');

  var ansicht = { x: 0, y: 0, k: 1 };
  var K_MIN = 0.7, K_MAX = 4000;
  var gewaehlteId = null;

  karte.setAttribute('viewBox', '0 0 ' + G.w + ' ' + G.h);

  /* ---- Straßenkarte
   *
   * Die Umrisse sind mercator-projiziert und damit dasselbe Koordinatensystem,
   * das auch Kartenkacheln benutzen - die Kacheln passen deshalb ohne Umrechnung
   * darüber. Sie liegen in derselben verschobenen Ebene wie alles andere, also
   * muss beim Zoomen nichts nachgeführt werden.
   *
   * Ab KACHEL_AB wird umgeschaltet: darunter die weiße Karte, darüber die
   * Straßen. Lässt sich keine Kachel laden - kein Netz, oder die Seite läuft
   * in einer Umgebung, die fremde Bilder blockiert -, bleibt es bei der weißen
   * Karte, und der Zoom funktioniert trotzdem.
   */
  var KACHEL_AB = 9;          // Kachel-Zoomstufe, ab der Straßen erscheinen
  var KACHEL_MAX = 19;
  var kachelnMoeglich = true;
  var kachelnAn = false;
  var kachelGeladen = false;
  var kachelFehlschlaege = 0;
  var kachelLauf = null;

  /** Bildpunkte je Karteneinheit - abhängig von der Größe des Kartenfelds. */
  function punkteJeEinheit() {
    var r = karte.getBoundingClientRect();
    if (!r.width || !r.height) return 1;
    return Math.min(r.width / G.w, r.height / G.h);
  }

  /** Die Kachel-Zoomstufe, bei der eine Kachel etwa 256 Bildpunkte groß ist. */
  function kachelZoom() {
    var z = Math.log(360 * G.scale * punkteJeEinheit() * ansicht.k / 256) / Math.LN2;
    return Math.max(0, Math.min(KACHEL_MAX, Math.round(z)));
  }

  /** Der sichtbare Ausschnitt in Karteneinheiten, ohne Verschiebung. */
  function sichtbarerBereich() {
    var r = karte.getBoundingClientRect();
    var a = zuKarte(r.left, r.top);
    var b = zuKarte(r.right, r.bottom);
    return {
      x0: (a.x - ansicht.x) / ansicht.k,
      y0: (a.y - ansicht.y) / ansicht.k,
      x1: (b.x - ansicht.x) / ansicht.k,
      y1: (b.y - ansicht.y) / ansicht.k
    };
  }

  /** Waagerechte Kachelnummer zu einer Karteneinheit und umgekehrt. */
  function xZuKachel(x, teile) {
    return ((x / G.scale + G.minX) + 180) / 360 * teile;
  }

  function kachelZuX(tx, teile) {
    return (tx / teile * 360 - 180 - G.minX) * G.scale;
  }

  function yZuKachel(y, teile) {
    var merc = G.maxY - y / G.scale;
    return (1 - merc / 180) / 2 * teile;
  }

  function kachelZuY(ty, teile) {
    return (G.maxY - 180 * (1 - 2 * ty / teile)) * G.scale;
  }

  function zeichneKacheln() {
    if (!einstellungen.kachelQuelle) return;
    var z = kachelZoom();

    if (!kachelnMoeglich) {
      // Ohne Kacheln bleibt die weiße Karte - beim Hineinzoomen erklärt ein
      // Hinweis, warum hier keine Straßen kommen.
      $('#kartenhinweis').hidden = z < KACHEL_AB;
      return;
    }

    var anZeigen = z >= KACHEL_AB;
    if (anZeigen !== kachelnAn) {
      kachelnAn = anZeigen;
      karte.classList.toggle('mit-strassen', anZeigen);
      $('#kartenherkunft').hidden = !anZeigen;
      $('#kartenhinweis').hidden = true;
    }
    if (!anZeigen) { ebeneKacheln.textContent = ''; return; }

    var teile = Math.pow(2, z);
    var kante = 360 * G.scale / teile;
    var b = sichtbarerBereich();

    var von_x = Math.max(0, Math.floor(xZuKachel(b.x0, teile)));
    var bis_x = Math.min(teile - 1, Math.floor(xZuKachel(b.x1, teile)));
    var von_y = Math.max(0, Math.floor(yZuKachel(b.y0, teile)));
    var bis_y = Math.min(teile - 1, Math.floor(yZuKachel(b.y1, teile)));
    if (bis_x < von_x || bis_y < von_y) return;
    // Notbremse, falls die Rechnung durch eine seltsame Fenstergröße entgleist.
    if ((bis_x - von_x + 1) * (bis_y - von_y + 1) > 240) return;

    // Je Zoomstufe eine eigene Gruppe: die alte bleibt stehen, bis die neue
    // geladen ist, sonst blitzt beim Zoomen der weiße Untergrund durch.
    var gruppe = ebeneKacheln.querySelector('[data-z="' + z + '"]');
    if (!gruppe) {
      gruppe = svg('g', { 'data-z': z });
      ebeneKacheln.appendChild(gruppe);
    }

    var gebraucht = {};
    for (var tx = von_x; tx <= bis_x; tx++) {
      for (var ty = von_y; ty <= bis_y; ty++) {
        var schluessel = tx + '_' + ty;
        gebraucht[schluessel] = true;
        if (gruppe.querySelector('[data-k="' + schluessel + '"]')) continue;

        var bild = svg('image', {
          'data-k': schluessel,
          class: 'kachel',
          x: kachelZuX(tx, teile),
          y: kachelZuY(ty, teile),
          // Winzige Überlappung, sonst blitzen die Fugen zwischen den Kacheln.
          width: kante * 1.002,
          height: kante * 1.002
        });
        bild.addEventListener('load', function () { kachelGeladen = true; });
        bild.addEventListener('error', kachelFehler);
        bild.setAttributeNS('http://www.w3.org/1999/xlink', 'href', kachelUrl(z, tx, ty));
        bild.setAttribute('href', kachelUrl(z, tx, ty));
        gruppe.appendChild(bild);
      }
    }

    // Kacheln außerhalb des Ausschnitts wieder freigeben.
    Array.prototype.slice.call(gruppe.children).forEach(function (bild) {
      if (!gebraucht[bild.getAttribute('data-k')]) bild.remove();
    });

    clearTimeout(kachelLauf);
    kachelLauf = setTimeout(function () {
      Array.prototype.slice.call(ebeneKacheln.children).forEach(function (g) {
        if (g.getAttribute('data-z') !== String(z)) g.remove();
      });
    }, 400);
  }

  function kachelUrl(z, x, y) {
    return einstellungen.kachelQuelle
      .replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }

  /**
   * Einzelne Aussetzer kommen vor - dann verschwindet nur diese Kachel. Kam
   * dagegen noch nie eine an, gibt es keine Straßenkarte (kein Netz, oder die
   * Umgebung lässt keine fremden Bilder zu) und die weiße Karte bleibt.
   */
  function kachelFehler(e) {
    if (kachelGeladen) { e.target.remove(); return; }
    if (++kachelFehlschlaege < 3) { e.target.remove(); return; }

    kachelnMoeglich = false;
    kachelnAn = false;
    ebeneKacheln.textContent = '';
    karte.classList.remove('mit-strassen');
    $('#kartenherkunft').hidden = true;
    $('#kartenhinweis').hidden = kachelZoom() < KACHEL_AB;
  }

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
      if (art === 'fernaufschaltung') {
        // Funkwellen - die Anlage wird aus der Ferne erreicht.
        teile.push(svg('circle', { class: 'kern', cx: 0, cy: -14.6, r: 1.7 }));
        teile.push(svg('path', { class: 'welle', d: 'M-2.7 -17.4 A 3.6 3.6 0 0 1 2.7 -17.4' }));
        teile.push(svg('path', { class: 'welle', d: 'M-5 -19.4 A 6.6 6.6 0 0 1 5 -19.4' }));
      } else {
        teile.push(svg('circle', { class: 'kern', cx: 0, cy: -17, r: 3.6 }));
      }
    }
    teile.push(svg('circle', { class: 'treffer', cx: 0, cy: -15, r: 17 }));
    return teile;
  }

  // In der Kartenanwendung wird nichts gesetzt - die Weiche bleibt leer, damit
  // die gemeinsamen Teile mit dem Adminbereich gleich aussehen.
  var setzeModus = null;

  function zeichneMarker() {
    ebeneMarker.textContent = '';
    alleOrte().forEach(function (ort) {
      var p = projiziere(ort.lat, ort.lon);
      var gruppe = svg('g', {
        class: 'marker ' + ort.art + (ort.id === gewaehlteId ? ' gewaehlt' : ''),
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

  var kachelBild = 0;

  function wendeAn() {
    ebene.setAttribute('transform',
      'translate(' + ansicht.x + ' ' + ansicht.y + ') scale(' + ansicht.k + ')');
    setzeMarkerGroesse();

    if (!kachelBild) {
      kachelBild = requestAnimationFrame(function () {
        kachelBild = 0;
        zeichneKacheln();
      });
    }
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

  /** Weicher Übergang zu einer Ansicht. */
  function animiereZu(zielX, zielY, zielK, dauer) {
    var startX = ansicht.x, startY = ansicht.y, startK = ansicht.k;
    var start = performance.now();
    var lauf = dauer || 520;
    cancelAnimationFrame(animation);

    (function schritt(jetzt) {
      var t = Math.min(1, (jetzt - start) / lauf);
      var e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      ansicht.k = startK + (zielK - startK) * e;
      ansicht.x = startX + (zielX - startX) * e;
      ansicht.y = startY + (zielY - startY) * e;
      begrenze();
      wendeAn();
      if (t < 1) animation = requestAnimationFrame(schritt);
    })(start);
  }

  function flieg(lat, lon, ziel_k) {
    var p = projiziere(lat, lon);
    var zielK = Math.min(K_MAX, Math.max(K_MIN, ziel_k));
    // Der Punkt soll in der Mitte des sichtbaren Kartenfelds landen.
    var mitte = sichtbareMitte();
    animiereZu(mitte.x - p.x * zielK, mitte.y - p.y * zielK, zielK);
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

  /* ---- Zurück zur Gesamtansicht, wenn niemand die Karte benutzt
   *
   * Gedacht für einen Bildschirm, an dem Leute vorbeikommen, etwas anschauen
   * und weitergehen: nach einer Weile ohne Bedienung stellt sich die Karte
   * wieder auf ganz Deutschland. Wer gerade im Mitarbeiterbereich etwas
   * einträgt, wird dabei nicht unterbrochen.
   */
  var ruheUhr = null;

  function istUebersicht() {
    return Math.abs(ansicht.k - 1) < 0.01 &&
      Math.abs(ansicht.x) < 0.5 && Math.abs(ansicht.y) < 0.5;
  }

  function ruheNeuStarten() {
    clearTimeout(ruheUhr);
    var sekunden = einstellungen.ruheSekunden;
    if (!sekunden) return;
    ruheUhr = setTimeout(ruheAbgelaufen, sekunden * 1000);
  }

  function ruheAbgelaufen() {
    // Ein offener Dialog, ein groß betrachtetes Bild oder das Setzen einer
    // Position heißt: da schaut jemand hin. Dann wird nichts zurückgestellt,
    // sondern später noch einmal geschaut.
    var beschaeftigt = $('#lichtkasten').classList.contains('offen');
    var schonRuhig = istUebersicht() && !sucheOffen &&
      !$('#tafel').classList.contains('offen');

    if (!beschaeftigt && !schonRuhig) {
      schliesseSuche();
      schliesseTafel();
      animiereZu(0, 0, 1, 900);
    }
    ruheNeuStarten();
  }

  ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(function (art) {
    document.addEventListener(art, ruheNeuStarten, { passive: true });
  });

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
    var faktor = Math.pow(1.0025, -e.deltaY * (e.deltaMode === 1 ? 16 : 1));
    zoomeAufPunkt(faktor, e.clientX, e.clientY);
  }, { passive: false });

  karte.addEventListener('dblclick', function (e) {
    if (setzeModus) return;
    zoomeAufPunkt(2.2, e.clientX, e.clientY);
  });

  karte.addEventListener('click', function (e) {
    if (hatGezogen) return;
    var getroffen = e.target.closest ? e.target.closest('.marker') : null;
    if (getroffen && !setzeModus) { oeffneTafel(getroffen.getAttribute('data-id')); return; }
    if (e.target === karte || e.target.classList.contains('land')) schliesseTafel();
  });

  $('#knopfPlus').onclick = function () { zoomeMittig(2); };
  $('#knopfMinus').onclick = function () { zoomeMittig(0.5); };
  $('#knopfHeim').onclick = ganzeKarte;

  /* ------------------------------------------------------------ Suche */

  var suchtext = '';

  function passt(ort) {
    if (!suchtext) return true;
    var s = suchtext.toLowerCase();
    return (ort.name + ' ' + ort.ort).toLowerCase().indexOf(s) >= 0;
  }

  function zeichneListe() {
    var behaelter = $('#liste');
    behaelter.textContent = '';
    var etwasGefunden = false;

    ['sitz', 'projekt', 'fernaufschaltung'].forEach(function (art) {
      var treffer = listeFuer(art).filter(passt).slice().sort(function (a, b) {
        return a.name.localeCompare(b.name, 'de');
      });
      if (!treffer.length) return;
      etwasGefunden = true;

      behaelter.appendChild(h('div', {
        class: 'listen-titel',
        text: ARTEN[art].mehrzahl + (art === 'sitz' ? '' : ' (' + treffer.length + ')')
      }));
      treffer.forEach(function (e) { behaelter.appendChild(listenEintrag(e, art)); });
    });

    if (!etwasGefunden) {
      behaelter.appendChild(h('div', { class: 'leer', text: 'Nichts gefunden.' }));
    }
  }

  function listenEintrag(ort, art) {
    return h('button', {
      class: 'eintrag ' + art + (ort.id === gewaehlteId ? ' aktiv' : ''),
      onclick: function () {
        schliesseSuche();
        oeffneTafel(ort.id);
      }
    },
      h('span', { class: 'punkt' }),
      h('span', { class: 'beschriftung' },
        h('span', { class: 'name', text: ort.name }),
        ort.ort ? h('span', { class: 'ort', text: ort.ort }) : null));
  }

  var sucheOffen = false;

  function oeffneSuche() {
    sucheOffen = true;
    $('#suchtafel').classList.add('offen');
    $('#knopfSuche').setAttribute('aria-expanded', 'true');
    var eingabe = $('#suche');
    eingabe.focus();
    eingabe.select();
  }

  function schliesseSuche() {
    if (!sucheOffen) return;
    sucheOffen = false;
    $('#suchtafel').classList.remove('offen');
    $('#knopfSuche').setAttribute('aria-expanded', 'false');
  }

  $('#knopfSuche').onclick = function () {
    if (sucheOffen) schliesseSuche();
    else oeffneSuche();
  };

  $('#suche').addEventListener('input', function (e) {
    suchtext = e.target.value.trim();
    zeichneListe();
  });

  /** Mit Pfeiltasten durch die Treffer, mit Enter öffnen. */
  $('#suche').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { schliesseSuche(); return; }

    var treffer = Array.prototype.slice.call($('#liste').querySelectorAll('.eintrag'));
    if (!treffer.length) return;
    var jetzt = treffer.indexOf($('#liste').querySelector('.eintrag.markiert'));

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var naechster = e.key === 'ArrowDown'
        ? (jetzt + 1) % treffer.length
        : (jetzt <= 0 ? treffer.length - 1 : jetzt - 1);
      treffer.forEach(function (t) { t.classList.remove('markiert'); });
      treffer[naechster].classList.add('markiert');
      treffer[naechster].scrollIntoView({ block: 'nearest' });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      (treffer[jetzt >= 0 ? jetzt : 0]).click();
    }
  });

  // Ein Klick neben die Tafel schließt sie.
  document.addEventListener('pointerdown', function (e) {
    if (!sucheOffen) return;
    if ($('#suchtafel').contains(e.target) || $('#knopfSuche').contains(e.target)) return;
    schliesseSuche();
  });
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
      class: 'tafel-marke ' + ort.art,
      text: ARTEN[ort.art].einzahl
    }));
    text.appendChild(h('h2', { text: ort.name }));
    if (ort.ort) text.appendChild(h('div', { class: 'unterzeile', text: ort.ort }));

    var eckdaten = (ort.eckdaten || []).filter(function (e) {
      return e.bezeichnung || e.wert;
    });
    if (eckdaten.length) {
      var raster = h('dl', { class: 'eckdaten' });
      eckdaten.forEach(function (e) {
        raster.appendChild(h('div', null,
          h('dt', { text: e.bezeichnung }),
          h('dd', { text: e.wert || '—' })));
      });
      text.appendChild(raster);
    }

    if (ort.beschreibung) {
      var beschreibung = h('div', { class: 'beschreibung' });
      ort.beschreibung.split(/\n\s*\n/).forEach(function (absatz) {
        var p = h('p');
        absatz.split('\n').forEach(function (zeile, i) {
          if (i) p.appendChild(document.createElement('br'));
          p.appendChild(document.createTextNode(zeile));
        });
        beschreibung.appendChild(p);
      });
      text.appendChild(beschreibung);
    }

    if (ort.bilder && ort.bilder.length) {
      text.appendChild(h('div', { class: 'abschnitt-titel', text: 'Bilder' }));
      var galerie = h('div', { class: 'galerie' });
      var grossbilder = ort.bilder.map(function (b) {
        return { src: bildUrl(b.id), text: b.unterschrift };
      });
      ort.bilder.forEach(function (bild, i) {
        galerie.appendChild(h('figure', null,
          h('img', {
            src: bildUrl(bild.id), alt: bild.unterschrift || ort.name, loading: 'lazy',
            onclick: function () { oeffneLichtkasten(grossbilder, i); }
          }),
          bild.unterschrift ? h('figcaption', { text: bild.unterschrift }) : null));
      });
      text.appendChild(galerie);
    }

    inhalt.appendChild(text);

    var tafel = $('#tafel');
    tafel.classList.add('offen');
    tafel.setAttribute('aria-hidden', 'false');
    $('#kartenfeld').classList.add('tafel-offen');

    zeichneMarker();
    zeichneListe();
    flieg(ort.lat, ort.lon, Math.max(ansicht.k, 24));
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
    if (sucheOffen) schliesseSuche();
    else schliesseTafel();
  });

  /* ------------------------------------------------------------ Start */

  zeichneLaender();
  wendeAn();

  Promise.all([hole('einstellungen'), hole('standorte')])
    .then(function (ergebnis) {
      einstellungen = ergebnis[0];
      standorte = ergebnis[1];
      $('#seitentitel').textContent = einstellungen.seitentitel;
      document.title = einstellungen.seitentitel;
      zeichneMarker();
      zeichneListe();
      zeichneKacheln();
      ruheNeuStarten();
    })
    .catch(function (fehler) {
      $('#liste').textContent = '';
      $('#liste').appendChild(h('div', {
        class: 'leer',
        text: 'Die Standorte lassen sich gerade nicht laden.'
      }));
      melde('Keine Verbindung zur Datenbank: ' + fehler.message);
    });

  window.addEventListener('resize', setzeMarkerGroesse);
})();
