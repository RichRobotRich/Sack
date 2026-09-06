/**
 * Berechnet deutsche Feiertage für ein gegebenes Jahr und Bundesland.
 * Unterstützte Bundesländer: 'NRW', 'TH' (Thüringen)
 */

// Osterformel nach Gauß
function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDaysToDate(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Gibt ein Set von Feiertags-Datumsstrings (yyyy-MM-dd) zurück
 * @param {number} year
 * @param {'NRW'|'TH'} state
 * @returns {Set<string>}
 */
export function getPublicHolidays(year, state) {
  const easter = getEasterSunday(year);
  const holidays = new Set();

  // Bundesweite Feiertage
  holidays.add(`${year}-01-01`); // Neujahr
  holidays.add(toDateStr(addDaysToDate(easter, -2))); // Karfreitag
  holidays.add(toDateStr(addDaysToDate(easter, 1)));  // Ostermontag
  holidays.add(`${year}-05-01`); // Tag der Arbeit
  holidays.add(toDateStr(addDaysToDate(easter, 39))); // Christi Himmelfahrt
  holidays.add(toDateStr(addDaysToDate(easter, 50))); // Pfingstmontag
  holidays.add(`${year}-10-03`); // Tag der Deutschen Einheit
  holidays.add(`${year}-12-25`); // 1. Weihnachtstag
  holidays.add(`${year}-12-26`); // 2. Weihnachtstag

  if (state === 'NRW') {
    holidays.add(toDateStr(addDaysToDate(easter, 60))); // Fronleichnam
    holidays.add(`${year}-11-01`); // Allerheiligen
  }

  if (state === 'TH') {
    holidays.add(`${year}-09-20`); // Weltkindertag (Thüringen)
    holidays.add(`${year}-10-31`); // Reformationstag
    // Fronleichnam ist in Thüringen KEIN gesetzlicher Feiertag (nur in einzelnen Gemeinden)
  }

  return holidays;
}

/**
 * Prüft ob ein Datum ein Feiertag ist
 * @param {Date} date
 * @param {'NRW'|'TH'} state
 * @returns {boolean}
 */
export function isPublicHoliday(date, state) {
  const year = date.getFullYear();
  const holidays = getPublicHolidays(year, state);
  const dateStr = toDateStr(date);
  return holidays.has(dateStr);
}

/**
 * Gibt den Namen des Feiertags zurück (oder null wenn kein Feiertag)
 * @param {Date} date
 * @param {'NRW'|'TH'} state
 * @returns {string|null}
 */
export function getPublicHolidayName(date, state) {
  const year = date.getFullYear();
  const easter = getEasterSunday(year);
  const dateStr = toDateStr(date);

  const named = [
    { date: `${year}-01-01`, name: 'Neujahr' },
    { date: toDateStr(addDaysToDate(easter, -2)), name: 'Karfreitag' },
    { date: toDateStr(addDaysToDate(easter, 1)), name: 'Ostermontag' },
    { date: `${year}-05-01`, name: 'Tag der Arbeit' },
    { date: toDateStr(addDaysToDate(easter, 39)), name: 'Christi Himmelfahrt' },
    { date: toDateStr(addDaysToDate(easter, 50)), name: 'Pfingstmontag' },
    { date: `${year}-10-03`, name: 'Tag der Deutschen Einheit' },
    { date: `${year}-12-25`, name: '1. Weihnachtstag' },
    { date: `${year}-12-26`, name: '2. Weihnachtstag' },
  ];

  if (state === 'NRW') {
    named.push({ date: toDateStr(addDaysToDate(easter, 60)), name: 'Fronleichnam' });
    named.push({ date: `${year}-11-01`, name: 'Allerheiligen' });
  }
  if (state === 'TH') {
    named.push({ date: `${year}-09-20`, name: 'Weltkindertag' });
    named.push({ date: `${year}-10-31`, name: 'Reformationstag' });
  }

  const found = named.find(h => h.date === dateStr);
  return found ? found.name : null;
}

/**
 * Gibt den nächsten Arbeitstag (kein Wochenende, kein Feiertag) ab einem Datum zurück.
 * @param {Date} date
 * @param {'NRW'|'TH'} state
 * @returns {Date}
 */
export function getNextWorkday(date, state) {
  let current = new Date(date);
  while (true) {
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (!isWeekend && !isPublicHoliday(current, state)) {
      return current;
    }
    current = addDaysToDate(current, 1);
  }
}