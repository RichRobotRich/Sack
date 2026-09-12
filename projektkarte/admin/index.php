<?php
/**
 * Adminbereich der Projektkarte.
 *
 * Erreichbar nur direkt über /admin - aus der Kartenanwendung führt bewusst
 * kein Weg hierher. Diese Datei liefert nur das Grundgerüst aus; angemeldet
 * wird über die Schnittstelle, und die prüft bei jedem schreibenden Aufruf
 * erneut.
 */
declare(strict_types=1);

// Ohne Schrägstrich am Ende zeigen die relativen Verweise (admin.js, ../api/)
// eine Ebene zu hoch - deshalb einmal sauber umleiten.
$pfad = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if (preg_match('#/admin$#', $pfad)) {
    header('Location: ' . $pfad . '/', true, 301);
    exit;
}

header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Projektkarte &ndash; Verwaltung</title>
<link rel="icon" href="../favicon-32.png">
<link rel="stylesheet" href="../karte.css">
<link rel="stylesheet" href="admin.css">
</head>
<body class="admin">

<div class="anmeldung" id="anmeldung">
  <form class="anmeldekasten" id="anmeldeform" autocomplete="on">
    <img src="../logo.png" alt="" class="anmeldelogo">
    <h1>Verwaltung der Projektkarte</h1>
    <p class="leise">Bitte mit dem Kennwort des Adminbereichs anmelden.</p>
    <div id="anmeldefehler"></div>
    <div class="feld">
      <label for="kennwort">Kennwort</label>
      <input type="password" id="kennwort" name="password" autocomplete="current-password" required>
    </div>
    <button type="submit" class="knopf haupt breit">Anmelden</button>
  </form>
</div>

<div class="werkbank" id="werkbank" hidden>
  <header class="kopfzeile">
    <div class="marke">
      <img src="../logo.png" alt="">
      <div class="titel">Verwaltung</div>
    </div>
    <div class="kopf-luecke"></div>
    <a class="knopf" href="../" target="_blank" rel="noopener">Karte ansehen</a>
    <button class="knopf leise" id="knopfAbmelden">Abmelden</button>
  </header>

  <div class="reiter" id="reiter"></div>
  <main class="werkflaeche" id="werkflaeche"></main>
</div>

<div class="meldung" id="meldung"></div>

<script src="../geo-deutschland.js"></script>
<script src="admin.js"></script>
</body>
</html>
