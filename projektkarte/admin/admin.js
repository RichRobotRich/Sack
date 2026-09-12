/**
 * Verwaltung der Projektkarte.
 *
 * Spricht dieselbe REST-Schnittstelle wie die Karte, nur eben auch schreibend.
 * Jeder ändernde Aufruf trägt den Sitzungsschlüssel im Kopf; ohne den lehnt
 * der Server ab, selbst wenn das Sitzungscookie mitkäme.
 */
(function () {
  'use strict';

  var API = '../api/';
  var G = window.GEO_DE;

  var ARTEN = {
    projekt: {
      mehrzahl: 'Projekte', einzahl: 'Projekt', ton: 'blau',
      felder: ['Bauherr', 'Fertigstellung', 'Bauzeit', 'Gewerk']
    },
    sitz: {
      mehrzahl: 'Betriebssitze', einzahl: 'Betriebssitz', ton: 'dunkel',
      felder: ['Grundstücksfläche', 'Lagerbereich', 'Mitarbeiterzahl',
        'Monteure', 'Kundendienst', 'Fahrzeuge']
    },
    fernaufschaltung: {
      mehrzahl: 'Fernaufschaltungen', einzahl: 'Fernaufschaltung', ton: 'rot',
      felder: ['Anlagenart', 'Aufgeschaltet seit', 'Verbindung', 'Leitsystem',
        'Störmeldung an', 'Wartungsvertrag']
    }
  };

  var TOENE = {
    blau: ['#1d4ed8', '#60a5fa'],
    dunkel: ['#0f172a', '#334155'],
    rot: ['#991b1b', '#f87171']
  };

  var schluessel = null;
  var standorte = [];
  var einstellungen = {};
  var kennwortStandard = false;
  var reiter = 'projekt';

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

  function svgEl(tag, attribute) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attribute) Object.keys(attribute).forEach(function (k) {
      if (attribute[k] != null) e.setAttribute(k, attribute[k]);
    });
    return e;
  }

  var meldungsUhr = null;
  function melde(text) {
    var m = $('#meldung');
    m.textContent = text;
    m.classList.add('sichtbar');
    clearTimeout(meldungsUhr);
    meldungsUhr = setTimeout(function () { m.classList.remove('sichtbar'); }, 3200);
  }

  function zahl(wert, ersatz) {
    var n = parseFloat(String(wert).replace(',', '.'));
    return isFinite(n) ? n : ersatz;
  }

  function platzhalter(text, ton) {
    var kuerzel = String(text || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
    var farben = TOENE[ton] || TOENE.blau;
    var quelle = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">' +
      '<defs><linearGradient id="v" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + farben[0] + '"/>' +
      '<stop offset="1" stop-color="' + farben[1] + '"/></linearGradient></defs>' +
      '<rect width="640" height="360" fill="url(#v)"/>' +
      '<text x="320" y="200" font-family="Segoe UI,Arial,sans-serif" font-size="96" ' +
      'font-weight="700" fill="rgba(255,255,255,.85)" text-anchor="middle">' + kuerzel + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(quelle);
  }

  function bildUrl(id) { return API + 'bilder/' + id; }

  function titelbildQuelle(standort) {
    return standort.titelbildId
      ? bildUrl(standort.titelbildId)
      : platzhalter(standort.name, ARTEN[standort.art].ton);
  }

  /* ------------------------------------------------------------ Schnittstelle */

  function ruf(pfad, einstellung) {
    einstellung = einstellung || {};
    var kopf = einstellung.headers || {};
    kopf.Accept = 'application/json';
    if (schluessel && einstellung.method && einstellung.method !== 'GET') {
      kopf['X-Sitzungsschluessel'] = schluessel;
    }
    if (schluessel && pfad === 'sicherung') kopf['X-Sitzungsschluessel'] = schluessel;
    einstellung.headers = kopf;

    return fetch(API + pfad, einstellung).then(function (antwort) {
      return antwort.text().then(function (rohtext) {
        var daten = null;
        try { daten = rohtext ? JSON.parse(rohtext) : null; } catch (e) { /* kein JSON */ }
        if (!antwort.ok) {
          // 401 heißt: die Sitzung ist weg. Beim Anmelden selbst gibt es noch
          // keine, da bleibt die Anmeldemaske einfach stehen.
          if (antwort.status === 401 && schluessel) abmeldenAnzeigen();
          throw new Error((daten && daten.fehler) || ('Fehler ' + antwort.status));
        }
        return daten;
      });
    });
  }

  function sende(pfad, verb, koerper) {
    return ruf(pfad, {
      method: verb,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(koerper || {})
    });
  }

  /* ------------------------------------------------------------ Anmeldung */

  $('#anmeldeform').addEventListener('submit', function (e) {
    e.preventDefault();
    var feld = $('#kennwort');
    var meldungsfeld = $('#anmeldefehler');
    meldungsfeld.textContent = '';

    sende('sitzung', 'POST', { kennwort: feld.value })
      .then(function (antwort) {
        schluessel = antwort.schluessel;
        kennwortStandard = antwort.kennwortStandard;
        feld.value = '';
        werkbankZeigen();
      })
      .catch(function (fehler) {
        meldungsfeld.appendChild(h('div', { class: 'fehler', text: fehler.message }));
        feld.value = '';
        feld.focus();
      });
  });

  $('#knopfAbmelden').onclick = function () {
    ruf('sitzung', { method: 'DELETE' }).then(abmeldenAnzeigen).catch(abmeldenAnzeigen);
  };

  function abmeldenAnzeigen() {
    schluessel = null;
    $('#werkbank').hidden = true;
    $('#anmeldung').hidden = false;
    $('#kennwort').focus();
  }

  function werkbankZeigen() {
    $('#anmeldung').hidden = true;
    $('#werkbank').hidden = false;
    zeichneReiter();
    neuLaden().then(datenbankSchutzPruefen);
  }

  function neuLaden() {
    $('#werkflaeche').textContent = '';
    $('#werkflaeche').appendChild(h('div', { class: 'lade', text: 'Wird geladen …' }));
    return Promise.all([ruf('standorte'), ruf('einstellungen')])
      .then(function (ergebnis) {
        standorte = ergebnis[0];
        einstellungen = ergebnis[1];
        zeichneWerkflaeche();
      })
      .catch(function (fehler) {
        $('#werkflaeche').textContent = '';
        $('#werkflaeche').appendChild(h('div', { class: 'fehler', text: fehler.message }));
      });
  }

  /* ------------------------------------------------------------ Reiter */

  function zeichneReiter() {
    var leiste = $('#reiter');
    leiste.textContent = '';
    ['projekt', 'sitz', 'fernaufschaltung', 'einstellungen'].forEach(function (r) {
      leiste.appendChild(h('button', {
        class: reiter === r ? 'aktiv' : '',
        onclick: function () { reiter = r; zeichneReiter(); zeichneWerkflaeche(); }
      }, r === 'einstellungen' ? 'Einstellungen' : ARTEN[r].mehrzahl));
    });
  }

  function zeichneWerkflaeche() {
    var flaeche = $('#werkflaeche');
    flaeche.textContent = '';

    if (kennwortStandard) {
      flaeche.appendChild(h('div', { class: 'warnung' },
        'Es gilt noch das Standardkennwort. Bitte in den Einstellungen ändern.',
        h('button', {
          class: 'knopf klein', onclick: function () {
            reiter = 'einstellungen';
            zeichneReiter();
            zeichneWerkflaeche();
          }
        }, 'Jetzt ändern')));
    }

    if (reiter === 'einstellungen') flaeche.appendChild(baueEinstellungen());
    else flaeche.appendChild(baueListe(reiter));
  }

  /**
   * Prüft, ob die Datenbankdatei über den Webserver abrufbar ist. Auf Apache
   * verhindert das die .htaccess in daten/ - andere Server brauchen eine
   * eigene Regel, und dann soll das hier auffallen statt unbemerkt zu bleiben.
   */
  function datenbankSchutzPruefen() {
    fetch('../daten/projektkarte.sqlite', { method: 'HEAD' })
      .then(function (antwort) {
        if (!antwort.ok) return;
        var flaeche = $('#werkflaeche');
        flaeche.insertBefore(h('div', { class: 'fehler' },
          'Achtung: Die Datenbank ist unter daten/projektkarte.sqlite offen über das Netz ' +
          'abrufbar – damit kommt jeder an alle Daten und an den Kennwort-Hash. Der ' +
          'Webserver muss den Ordner daten/ sperren (siehe README).'), flaeche.firstChild);
      })
      .catch(function () { /* nicht erreichbar - genau so soll es sein */ });
  }

  /* ------------------------------------------------------------ Liste */

  function baueListe(art) {
    var behaelter = h('div');
    var eintraege = standorte.filter(function (s) { return s.art === art; });

    behaelter.appendChild(h('div', { class: 'kopfreihe' },
      h('h2', { text: ARTEN[art].mehrzahl }),
      h('div', { style: 'color:var(--text-leise);font-size:13px;' },
        eintraege.length + ' ' + (eintraege.length === 1 ? 'Eintrag' : 'Einträge')),
      h('button', {
        class: 'knopf haupt',
        onclick: function () { zeigeEditor(art, null); }
      }, '+ ' + ARTEN[art].einzahl)));

    if (!eintraege.length) {
      behaelter.appendChild(h('div', { class: 'leer', text: 'Noch nichts angelegt.' }));
      return behaelter;
    }

    var liste = h('div', { class: 'verwaltung-liste' });
    eintraege.forEach(function (s) {
      liste.appendChild(h('div', { class: 'verwaltung-zeile' },
        h('img', { src: titelbildQuelle(s), alt: '' }),
        h('div', { class: 'beschriftung' },
          h('div', { class: 'name', text: s.name }),
          h('div', {
            class: 'ort',
            text: (s.ort ? s.ort + ' · ' : '') + s.lat.toFixed(4) + ', ' + s.lon.toFixed(4) +
              ' · ' + s.bilder.length + ' Bilder · ' + s.eckdaten.length + ' Eckdaten'
          })),
        h('button', { class: 'knopf klein', onclick: function () { zeigeEditor(art, s); } },
          'Bearbeiten'),
        h('button', { class: 'knopf klein gefahr', onclick: function () { frageLoeschen(s); } },
          'Löschen')));
    });
    behaelter.appendChild(liste);
    return behaelter;
  }

  function frageLoeschen(standort) {
    if (!window.confirm('„' + standort.name + '“ mit allen Bildern und Eckdaten löschen? ' +
        'Das lässt sich nicht rückgängig machen.')) {
      return;
    }
    ruf('standorte/' + standort.id, { method: 'DELETE' })
      .then(function () { melde('Gelöscht'); return neuLaden(); })
      .catch(function (fehler) { melde(fehler.message); });
  }

  /* ------------------------------------------------------------ Editor */

  function leererStandort(art) {
    return {
      id: null, art: art, name: '', ort: '', lat: 51.2, lon: 10.4,
      beschreibung: '', titelbildId: null,
      eckdaten: ARTEN[art].felder.map(function (f) { return { bezeichnung: f, wert: '' }; }),
      bilder: []
    };
  }

  function zeigeEditor(art, vorhanden) {
    // Mit einer Kopie arbeiten, damit ein Abbruch die Liste unberührt lässt.
    var entwurf = vorhanden
      ? JSON.parse(JSON.stringify(vorhanden))
      : leererStandort(art);

    var flaeche = $('#werkflaeche');
    flaeche.textContent = '';

    var nameFeld = h('input', { type: 'text', value: entwurf.name,
      placeholder: 'z. B. Wohnquartier Nordpark' });
    var ortFeld = h('input', { type: 'text', value: entwurf.ort,
      placeholder: 'z. B. Hamburg' });
    var latFeld = h('input', { type: 'text', value: entwurf.lat, inputmode: 'decimal' });
    var lonFeld = h('input', { type: 'text', value: entwurf.lon, inputmode: 'decimal' });
    var textFeld = h('textarea', {
      placeholder: 'Beschreibung. Eine Leerzeile trennt Absätze.'
    });
    textFeld.value = entwurf.beschreibung;

    var artFeld = h('select');
    Object.keys(ARTEN).forEach(function (a) {
      artFeld.appendChild(h('option', { value: a, selected: a === entwurf.art || null },
        ARTEN[a].einzahl));
    });

    /* ---- Eckdaten */
    var eckListe = h('div');

    function eckZeile(eck) {
      var bezeichnung = h('input', { type: 'text', value: eck.bezeichnung, placeholder: 'Bezeichnung' });
      var wert = h('input', { type: 'text', value: eck.wert, placeholder: 'Wert' });
      var zeile = h('div', { class: 'daten-reihe' }, bezeichnung, wert,
        h('button', { type: 'button', class: 'knopf klein', title: 'Nach oben',
          onclick: function () {
            var vor = zeile.previousElementSibling;
            if (vor) eckListe.insertBefore(zeile, vor);
          } }, '↑'),
        h('button', { type: 'button', class: 'knopf klein', title: 'Nach unten',
          onclick: function () {
            var nach = zeile.nextElementSibling;
            if (nach) eckListe.insertBefore(nach, zeile);
          } }, '↓'),
        h('button', { type: 'button', class: 'knopf klein gefahr', title: 'Zeile entfernen',
          onclick: function () { zeile.remove(); } }, '×'));
      zeile._bezeichnung = bezeichnung;
      zeile._wert = wert;
      return zeile;
    }

    entwurf.eckdaten.forEach(function (e) { eckListe.appendChild(eckZeile(e)); });

    function eckdatenLesen() {
      return Array.prototype.map.call(eckListe.children, function (zeile) {
        return {
          bezeichnung: zeile._bezeichnung.value.trim(),
          wert: zeile._wert.value.trim()
        };
      }).filter(function (e) { return e.bezeichnung || e.wert; });
    }

    /* ---- Bilder */
    var bildListe = h('div');

    function bildKachel(bild) {
      var unterschrift = h('input', { type: 'text', value: bild.unterschrift || '',
        placeholder: 'Bildunterschrift (optional)' });
      var marke = h('span', { class: 'istTitelbild' });

      var kachel = h('div', { class: 'bildkachel' },
        h('img', { src: bildUrl(bild.id), alt: '' }),
        h('div', { class: 'spalte' },
          unterschrift,
          h('div', { class: 'knopfzeile' },
            marke,
            h('button', { type: 'button', class: 'knopf klein',
              onclick: function () { entwurf.titelbildId = bild.id; titelbildMarkieren(); } },
              'Als Titelbild'),
            h('button', { type: 'button', class: 'knopf klein', title: 'Nach vorn',
              onclick: function () {
                var vor = kachel.previousElementSibling;
                if (vor) bildListe.insertBefore(kachel, vor);
              } }, '↑'),
            h('button', { type: 'button', class: 'knopf klein gefahr',
              onclick: function () {
                if (entwurf.titelbildId === bild.id) entwurf.titelbildId = null;
                kachel.remove();
                titelbildMarkieren();
              } }, 'Entfernen'))));

      kachel._id = bild.id;
      kachel._unterschrift = unterschrift;
      kachel._marke = marke;
      return kachel;
    }

    function titelbildMarkieren() {
      var gefunden = false;
      Array.prototype.forEach.call(bildListe.children, function (kachel) {
        var ist = kachel._id === entwurf.titelbildId;
        kachel._marke.textContent = ist ? 'Titelbild' : '';
        if (ist) gefunden = true;
      });
      // Ohne ausdrückliche Wahl dient das erste Bild als Titelbild.
      if (!gefunden && bildListe.children.length) {
        entwurf.titelbildId = bildListe.children[0]._id;
        bildListe.children[0]._marke.textContent = 'Titelbild';
      }
    }

    entwurf.bilder.forEach(function (b) { bildListe.appendChild(bildKachel(b)); });
    titelbildMarkieren();

    function bilderLesen() {
      return Array.prototype.map.call(bildListe.children, function (kachel) {
        return { id: kachel._id, unterschrift: kachel._unterschrift.value.trim() };
      });
    }

    /* ---- Hochladen */
    var dateiFeld = h('input', { type: 'file', accept: 'image/*', multiple: 'multiple',
      style: 'display:none' });
    var ablage = h('div', { class: 'ablage', onclick: function () { dateiFeld.click(); } },
      'Bilder hierher ziehen oder klicken zum Auswählen');

    dateiFeld.addEventListener('change', function () {
      var dateien = Array.prototype.slice.call(dateiFeld.files);
      dateiFeld.value = '';
      hochladen(dateien);
    });

    ['dragenter', 'dragover'].forEach(function (art) {
      ablage.addEventListener(art, function (e) {
        e.preventDefault();
        ablage.classList.add('drueber');
      });
    });
    ['dragleave', 'drop'].forEach(function (art) {
      ablage.addEventListener(art, function (e) {
        e.preventDefault();
        ablage.classList.remove('drueber');
      });
    });
    ablage.addEventListener('drop', function (e) {
      hochladen(Array.prototype.slice.call(e.dataTransfer.files));
    });

    function hochladen(dateien) {
      var bilder = dateien.filter(function (d) { return /^image\//.test(d.type); });
      if (!bilder.length) return;
      ablage.textContent = 'Wird hochgeladen …';

      // Nacheinander, damit die Reihenfolge stimmt und der Server Luft behält.
      bilder.reduce(function (kette, datei) {
        return kette
          .then(function () { return verkleinern(datei); })
          .then(function (klecks) {
            var formular = new FormData();
            formular.append('bild', klecks, 'bild.jpg');
            return ruf('bilder', { method: 'POST', body: formular });
          })
          .then(function (neu) {
            bildListe.appendChild(bildKachel({ id: neu.id, unterschrift: '' }));
            titelbildMarkieren();
          });
      }, Promise.resolve())
        .then(function () {
          ablage.textContent = 'Bilder hierher ziehen oder klicken zum Auswählen';
          melde(bilder.length + ' Bild(er) hochgeladen');
        })
        .catch(function (fehler) {
          ablage.textContent = 'Bilder hierher ziehen oder klicken zum Auswählen';
          melde('Hochladen fehlgeschlagen: ' + fehler.message);
        });
    }

    /* ---- Karte zum Setzen der Position */
    var kartenfeld = baueWahlkarte(entwurf, function (koordinaten) {
      latFeld.value = koordinaten.lat;
      lonFeld.value = koordinaten.lon;
    });

    function koordinatenUebernehmen() {
      kartenfeld.setze(zahl(latFeld.value, entwurf.lat), zahl(lonFeld.value, entwurf.lon));
    }
    latFeld.addEventListener('change', koordinatenUebernehmen);
    lonFeld.addEventListener('change', koordinatenUebernehmen);

    /* ---- Speichern */
    function speichern() {
      var werte = {
        art: artFeld.value,
        name: nameFeld.value.trim(),
        ort: ortFeld.value.trim(),
        lat: zahl(latFeld.value, 0),
        lon: zahl(lonFeld.value, 0),
        beschreibung: textFeld.value,
        eckdaten: eckdatenLesen(),
        bilder: bilderLesen(),
        titelbildId: entwurf.titelbildId
      };
      if (!werte.name) {
        melde('Bitte einen Namen eintragen.');
        nameFeld.focus();
        return;
      }
      var versprechen = entwurf.id
        ? sende('standorte/' + entwurf.id, 'PUT', werte)
        : sende('standorte', 'POST', werte);

      versprechen
        .then(function () {
          melde(entwurf.id ? 'Gespeichert' : 'Angelegt');
          reiter = werte.art;
          zeichneReiter();
          return neuLaden();
        })
        .catch(function (fehler) { melde(fehler.message); });
    }

    flaeche.appendChild(h('div', { class: 'kopfreihe' },
      h('h2', { text: (entwurf.id ? 'Bearbeiten: ' : 'Neu anlegen: ') + ARTEN[art].einzahl }),
      h('button', { class: 'knopf', onclick: function () { zeichneWerkflaeche(); } }, 'Abbrechen'),
      h('button', { class: 'knopf haupt', onclick: speichern }, 'Speichern')));

    flaeche.appendChild(h('div', { class: 'editor-spalten' },
      h('div', null,
        h('div', { class: 'tafelkasten' },
          h('h3', { text: 'Angaben' }),
          h('div', { class: 'reihe' },
            h('div', { class: 'feld' }, h('label', { text: 'Name' }), nameFeld),
            h('div', { class: 'feld' }, h('label', { text: 'Ort / Untertitel' }), ortFeld)),
          h('div', { class: 'feld' }, h('label', { text: 'Art' }), artFeld),
          h('div', { class: 'feld' },
            h('label', { text: 'Beschreibung' }), textFeld)),

        h('div', { class: 'tafelkasten' },
          h('h3', { text: 'Eckdaten' }),
          eckListe,
          h('button', {
            class: 'knopf klein', onclick: function () {
              eckListe.appendChild(eckZeile({ bezeichnung: '', wert: '' }));
            }
          }, '+ Zeile hinzufügen'),
          h('div', { class: 'hilfe',
            text: 'Bezeichnung und Wert sind frei wählbar – so lassen sich jederzeit weitere ' +
              'Kennzahlen ergänzen.' })),

        h('div', { class: 'tafelkasten' },
          h('h3', { text: 'Bilder' }),
          bildListe,
          ablage,
          dateiFeld,
          h('div', { class: 'hilfe',
            text: 'Bilder werden vor dem Hochladen auf 1600 Pixel verkleinert und liegen ' +
              'anschließend in der Datenbank.' }))),

      h('div', null,
        h('div', { class: 'tafelkasten' },
          h('h3', { text: 'Position' }),
          kartenfeld.element,
          h('div', { class: 'reihe', style: 'margin-top:12px;' },
            h('div', { class: 'feld' }, h('label', { text: 'Breitengrad' }), latFeld),
            h('div', { class: 'feld' }, h('label', { text: 'Längengrad' }), lonFeld))))));

    window.scrollTo(0, 0);
    nameFeld.focus();
  }

  /**
   * Kleine Karte im Editor: klicken setzt die Position. Verwendet dieselbe
   * Mercator-Projektion wie die große Karte.
   */
  function baueWahlkarte(entwurf, beiWahl) {
    var karte = svgEl('svg', { viewBox: '0 0 ' + G.w + ' ' + G.h });
    G.states.forEach(function (land) {
      karte.appendChild(svgEl('path', { d: land.d, class: 'land' }));
    });

    var stift = svgEl('g', { class: 'marker ' + entwurf.art });
    stift.appendChild(svgEl('path', {
      class: 'stift',
      d: 'M0 0 C -3.2 -7.5 -9 -10.5 -9 -17 A 9 9 0 1 1 9 -17 C 9 -10.5 3.2 -7.5 0 0 Z'
    }));
    stift.appendChild(svgEl('circle', { class: 'kern', cx: 0, cy: -17, r: 3.6 }));
    karte.appendChild(stift);

    function projiziere(lat, lon) {
      var y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * 180 / Math.PI;
      return { x: (lon - G.minX) * G.scale, y: (G.maxY - y) * G.scale };
    }

    function entprojiziere(x, y) {
      var lon = x / G.scale + G.minX;
      var merc = G.maxY - y / G.scale;
      var lat = (2 * Math.atan(Math.exp(merc * Math.PI / 180)) - Math.PI / 2) * 180 / Math.PI;
      return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
    }

    function setze(lat, lon) {
      var p = projiziere(lat, lon);
      stift.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ') scale(2.2)');
    }

    setze(entwurf.lat, entwurf.lon);

    karte.addEventListener('click', function (e) {
      var ctm = karte.getScreenCTM();
      if (!ctm) return;
      var punkt = karte.createSVGPoint();
      punkt.x = e.clientX;
      punkt.y = e.clientY;
      var k = punkt.matrixTransform(ctm.inverse());
      var koordinaten = entprojiziere(k.x, k.y);
      setze(koordinaten.lat, koordinaten.lon);
      beiWahl(koordinaten);
    });

    return {
      element: h('div', { class: 'kartenwahl' }, karte,
        h('div', { class: 'hinweis', text: 'Klicken setzt die Position' })),
      setze: setze
    };
  }

  /* ------------------------------------------------------------ Bilder verkleinern */

  /**
   * Vor dem Hochladen auf 1600 Pixel bringen. Das spart Übertragung und hält
   * die Datenbank klein; der Server prüft anschließend trotzdem noch einmal.
   */
  function verkleinern(datei) {
    return new Promise(function (fertig, fehlgeschlagen) {
      var leser = new FileReader();
      leser.onerror = function () { fehlgeschlagen(new Error('Datei nicht lesbar')); };
      leser.onload = function () {
        var bild = new Image();
        bild.onerror = function () { fehlgeschlagen(new Error('Bild nicht lesbar')); };
        bild.onload = function () {
          var faktor = Math.min(1, 1600 / Math.max(bild.width, bild.height));
          var breite = Math.max(1, Math.round(bild.width * faktor));
          var hoehe = Math.max(1, Math.round(bild.height * faktor));
          var flaeche = document.createElement('canvas');
          flaeche.width = breite;
          flaeche.height = hoehe;
          var stift = flaeche.getContext('2d');
          stift.fillStyle = '#fff';
          stift.fillRect(0, 0, breite, hoehe);
          stift.drawImage(bild, 0, 0, breite, hoehe);
          flaeche.toBlob(function (klecks) {
            if (klecks) fertig(klecks);
            else fehlgeschlagen(new Error('Das Bild ließ sich nicht umwandeln'));
          }, 'image/jpeg', 0.82);
        };
        bild.src = leser.result;
      };
      leser.readAsDataURL(datei);
    });
  }

  /* ------------------------------------------------------------ Einstellungen */

  function baueEinstellungen() {
    var behaelter = h('div');
    behaelter.appendChild(h('div', { class: 'kopfreihe' }, h('h2', { text: 'Einstellungen' })));

    /* ---- Darstellung */
    var titelFeld = h('input', { type: 'text', value: einstellungen.seitentitel });
    var ruheFeld = h('input', { type: 'number', min: '0', max: '3600', step: '5',
      value: einstellungen.ruheSekunden });
    var kachelFeld = h('input', { type: 'text', value: einstellungen.kachelQuelle,
      placeholder: 'https://…/{z}/{x}/{y}.png' });

    behaelter.appendChild(h('div', { class: 'tafelkasten' },
      h('h3', { text: 'Karte und Darstellung' }),
      h('div', { class: 'feld' }, h('label', { text: 'Überschrift der Seite' }), titelFeld),
      h('div', { class: 'feld' },
        h('label', { text: 'Zurück zur Gesamtansicht nach (Sekunden)' }), ruheFeld,
        h('div', { class: 'hilfe',
          text: 'Wird die Karte so lange nicht bedient, schließt sie Suche und Detailtafel ' +
            'und stellt sich wieder auf ganz Deutschland. 0 schaltet das ab.' })),
      h('div', { class: 'feld' },
        h('label', { text: 'Adresse der Kartenkacheln' }), kachelFeld,
        h('div', { class: 'hilfe',
          text: 'Liefert die Straßenkarte ab mittlerer Zoomstufe. Leer lassen heißt: nur die ' +
            'weiße Karte. Bei dauerhaft öffentlichem Betrieb gehört hier ein eigener Anbieter ' +
            'hinein, die Kacheln von OpenStreetMap sind nur für leichte Nutzung gedacht.' })),
      h('button', {
        class: 'knopf klein', onclick: function () {
          sende('einstellungen', 'PUT', {
            seitentitel: titelFeld.value,
            ruheSekunden: ruheFeld.value,
            kachelQuelle: kachelFeld.value
          })
            .then(function () { melde('Einstellungen gespeichert'); return neuLaden(); })
            .catch(function (fehler) { melde(fehler.message); });
        }
      }, 'Übernehmen')));

    /* ---- Kennwort */
    var altFeld = h('input', { type: 'password', autocomplete: 'current-password' });
    var neuFeld = h('input', { type: 'password', autocomplete: 'new-password' });
    var wiederFeld = h('input', { type: 'password', autocomplete: 'new-password' });
    var kwMeldung = h('div');

    function kwHinweis(klasse, text) {
      kwMeldung.textContent = '';
      kwMeldung.appendChild(h('div', { class: klasse, text: text }));
    }

    behaelter.appendChild(h('div', { class: 'tafelkasten' },
      h('h3', { text: 'Kennwort des Adminbereichs' }),
      kwMeldung,
      h('div', { class: 'feld' }, h('label', { text: 'Bisheriges Kennwort' }), altFeld),
      h('div', { class: 'reihe' },
        h('div', { class: 'feld' }, h('label', { text: 'Neues Kennwort' }), neuFeld),
        h('div', { class: 'feld' }, h('label', { text: 'Neues Kennwort wiederholen' }), wiederFeld)),
      h('div', { class: 'hilfe', style: 'margin-bottom:12px;',
        text: 'Mindestens 8 Zeichen. Das Kennwort liegt als Hash in der Datenbank und wird ' +
          'auf dem Server geprüft.' }),
      h('button', {
        class: 'knopf klein', onclick: function () {
          if (neuFeld.value !== wiederFeld.value) {
            kwHinweis('fehler', 'Die beiden neuen Kennwörter stimmen nicht überein.');
            return;
          }
          sende('kennwort', 'PUT', { alt: altFeld.value, neu: neuFeld.value })
            .then(function () {
              altFeld.value = neuFeld.value = wiederFeld.value = '';
              kennwortStandard = false;
              // Die Warnung gezielt entfernen statt alles neu zu zeichnen -
              // sonst verschwände die Bestätigung im selben Moment wieder.
              var warnung = $('#werkflaeche .warnung');
              if (warnung) warnung.remove();
              kwHinweis('erfolg', 'Kennwort geändert.');
              melde('Kennwort geändert');
            })
            .catch(function (fehler) { kwHinweis('fehler', fehler.message); });
        }
      }, 'Kennwort ändern')));

    /* ---- Sicherung */
    var einleseFeld = h('input', { type: 'file', accept: 'application/json,.json',
      style: 'display:none' });

    einleseFeld.addEventListener('change', function () {
      var datei = einleseFeld.files[0];
      einleseFeld.value = '';
      if (!datei) return;
      if (!window.confirm('Beim Einlesen wird der jetzige Stand vollständig ersetzt. ' +
          'Vorher am besten eine Sicherung herunterladen. Fortfahren?')) {
        return;
      }
      var leser = new FileReader();
      leser.onload = function () {
        var inhalt;
        try {
          inhalt = JSON.parse(leser.result);
        } catch (e) {
          melde('Die Datei ist kein gültiges JSON.');
          return;
        }
        sende('sicherung', 'POST', inhalt)
          .then(function (antwort) {
            melde(antwort.eingelesen + ' Standorte eingelesen');
            return neuLaden();
          })
          .catch(function (fehler) { melde(fehler.message); });
      };
      leser.readAsText(datei);
    });

    behaelter.appendChild(h('div', { class: 'tafelkasten' },
      h('h3', { text: 'Sicherung' }),
      h('div', { class: 'hilfe', style: 'margin-bottom:12px;' },
        'Die Sicherung enthält alle Standorte einschließlich der Bilder. Eingelesen werden ' +
        'sowohl diese Sicherungen als auch die Ausgabe der früheren Fassung, die noch im ' +
        'Browser gespeichert hat.'),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' },
        h('button', { class: 'knopf klein', onclick: sicherungHolen },
          '⬇ Sicherung herunterladen'),
        h('button', { class: 'knopf klein', onclick: function () { einleseFeld.click(); } },
          '⬆ Sicherung einlesen'),
        einleseFeld)));

    /* ---- Auskunft */
    behaelter.appendChild(h('div', { class: 'tafelkasten' },
      h('h3', { text: 'Bestand' }),
      h('div', { class: 'eckdaten' },
        Object.keys(ARTEN).map(function (art) {
          return h('div', null,
            h('dt', { text: ARTEN[art].mehrzahl }),
            h('dd', { text: String(standorte.filter(function (s) {
              return s.art === art;
            }).length) }));
        }),
        h('div', null,
          h('dt', { text: 'Bilder' }),
          h('dd', { text: String(standorte.reduce(function (summe, s) {
            return summe + s.bilder.length;
          }, 0)) })))));

    return behaelter;
  }

  function sicherungHolen() {
    ruf('sicherung')
      .then(function (daten) {
        var text = JSON.stringify(daten, null, 2);
        var klecks = new Blob([text], { type: 'application/json' });
        var url = URL.createObjectURL(klecks);
        var verweis = h('a', { href: url,
          download: 'projektkarte-' + new Date().toISOString().slice(0, 10) + '.json' });
        document.body.appendChild(verweis);
        verweis.click();
        verweis.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        melde('Sicherung wird heruntergeladen');
      })
      .catch(function (fehler) { melde(fehler.message); });
  }

  /* ------------------------------------------------------------ Start */

  // Beim Laden prüfen, ob noch eine Sitzung läuft - dann direkt weiterarbeiten.
  ruf('sitzung')
    .then(function (antwort) {
      if (antwort.angemeldet) {
        schluessel = antwort.schluessel;
        kennwortStandard = antwort.kennwortStandard;
        werkbankZeigen();
      } else {
        $('#kennwort').focus();
      }
    })
    .catch(function () { $('#kennwort').focus(); });
})();
