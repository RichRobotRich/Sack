<?php
/**
 * Nur für den eingebauten PHP-Server gedacht, zum Ausprobieren ohne Apache:
 *
 *   php -S localhost:8000 -t . router.php
 *
 * Auf einem richtigen Webserver macht diese Aufgabe die .htaccess.
 */
$pfad = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (preg_match('#^/api(?:/(.*))?$#', $pfad, $treffer)) {
    $_SERVER['PATH_INFO'] = isset($treffer[1]) ? '/' . $treffer[1] : '';
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require __DIR__ . '/api/index.php';
    return true;
}

if ($pfad === '/admin' || $pfad === '/admin/') {
    $_SERVER['SCRIPT_NAME'] = '/admin/index.php';
    require __DIR__ . '/admin/index.php';
    return true;
}

if ($pfad === '/' ) {
    readfile(__DIR__ . '/index.html');
    return true;
}

return false;   // alles andere liefert der eingebaute Server als Datei aus
