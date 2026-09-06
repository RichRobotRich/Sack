// ============================================================
// ZENTRALE SEITEN-KONFIGURATION
// ============================================================
// Diese Datei ist die EINZIGE Quelle für alle Seiten der App.
// Sidebar-Navigation UND Rollenverwaltung lesen hieraus.
// Neue Seite hinzufügen? NUR HIER eintragen – fertig.
// ============================================================

import {
  Home, Calendar, Building2, FileText, Plane, Thermometer, Shirt,
  CalendarDays, ClipboardList, UserPlus, Wrench, Briefcase,
  Users, Car, HardHat, BarChart2, Sun, UserCog, Mail, Newspaper,
  Shield, Settings, GraduationCap
} from 'lucide-react';

export const ALL_PAGES = [
  // Standard
  { id: 'Dashboard',         name: 'Dashboard',              group: 'Standard',            icon: Home },
  { id: 'CurrentPlan',       name: 'Aktueller Plan',         group: 'Standard',            icon: Calendar },
  { id: 'ProjectList',       name: 'Bauvorhaben',            group: 'Standard',            icon: Building2 },
  { id: 'WeeklyReports',     name: 'Wochenberichte',         group: 'Standard',            icon: FileText },
  { id: 'LeaveRequests',     name: 'Urlaubsantrag',          group: 'Standard',            icon: Plane },
  { id: 'SickReports',       name: 'Krankmeldung',           group: 'Standard',            icon: Thermometer },
  { id: 'ClothingRequests',  name: 'Arbeitskleidung',        group: 'Standard',            icon: Shirt },

  // Disposition
  { id: 'WeeklyPlanning',    name: 'Wocheneinteilung',       group: 'Disposition',         icon: CalendarDays },
  { id: 'DailyView',         name: 'Tagesansicht',           group: 'Disposition',         icon: ClipboardList },
  { id: 'TempWorkers',       name: 'Zusatzpersonal',         group: 'Disposition',         icon: UserPlus },

  // Produktion
  { id: 'Workshop',          name: 'Werkstatt',              group: 'Produktion',          icon: Wrench },

  // Disposition Erfurt
  { id: 'WeeklyPlanningEF',  name: 'Wocheneinteilung EF',   group: 'Disposition Erfurt',  icon: CalendarDays },
  { id: 'TempWorkersEF',     name: 'Zusatzpersonal EF',     group: 'Disposition Erfurt',  icon: UserPlus },
  { id: 'DailyViewEF',       name: 'Aushang EF',            group: 'Disposition Erfurt',  icon: ClipboardList },
  { id: 'OfficeOverviewEF',  name: 'Büroübersicht EF',      group: 'Disposition Erfurt',  icon: Briefcase },

  // Verwaltung
  { id: 'EmployeeManagement',       name: 'Mitarbeiter',                    group: 'Verwaltung', icon: Users },
  { id: 'AzubiManagement',          name: 'Mitarbeiter Zuordnung',         group: 'Verwaltung', icon: GraduationCap },
  { id: 'VehicleManagement',        name: 'Fahrzeuge',                      group: 'Verwaltung', icon: Car },
  { id: 'ProjectManagement',        name: 'Baustellen',                     group: 'Verwaltung', icon: HardHat },
  { id: 'DailyAbsences',            name: 'Tagesübersicht',                 group: 'Verwaltung', icon: Calendar },
  { id: 'ClothingInventory',        name: 'Arbeitskleidung Verwaltung',     group: 'Verwaltung', icon: Shirt },
  { id: 'LeaveManagement',          name: 'Urlaubsverwaltung',              group: 'Verwaltung', icon: Plane },
  { id: 'SickLeaveManagement',      name: 'Krankmeldungsverwaltung',        group: 'Verwaltung', icon: Thermometer },
  { id: 'AnnualLeaveOverviewPage',  name: 'Jahresübersicht',                group: 'Verwaltung', icon: BarChart2 },
  { id: 'EarlyShiftPage',           name: 'Frühschicht',                    group: 'Verwaltung', icon: Sun },
  { id: 'LeaveRequestManagement',   name: 'Urlaubsgenehmigung',             group: 'Verwaltung', icon: Plane },
  { id: 'WeeklyReportManagement',   name: 'Montageberichte',                group: 'Verwaltung', icon: FileText },
  { id: 'UserManagement',           name: 'Benutzer',                       group: 'Verwaltung', icon: UserCog },
  { id: 'EmailRecipients',          name: 'E-Mail-Empfänger',               group: 'Verwaltung', icon: Mail },
  { id: 'NewsManagement',           name: 'News',                           group: 'Verwaltung', icon: Newspaper },
  { id: 'RoleManagement',           name: 'Rollen',                         group: 'Verwaltung', icon: Shield },

  // Sonstiges
  { id: 'AccountSettings',  name: 'Kontoeinstellungen',    group: 'Sonstiges',           icon: Settings },
];