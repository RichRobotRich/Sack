/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AccountSettings from './pages/AccountSettings';
import ClothingInventory from './pages/ClothingInventory';
import ClothingRequests from './pages/ClothingRequests';
import CurrentPlan from './pages/CurrentPlan';
import DailyAbsences from './pages/DailyAbsences';
import DailyView from './pages/DailyView';
import DailyViewEF from './pages/DailyViewEF';
import Dashboard from './pages/Dashboard';
import EmailRecipients from './pages/EmailRecipients';
import AzubiManagement from './pages/AzubiManagement.jsx';
import EmployeeManagement from './pages/EmployeeManagement';
import LeaveRequestManagement from './pages/LeaveRequestManagement';
import LeaveRequests from './pages/LeaveRequests';
import NewsManagement from './pages/NewsManagement';
import ProjectList from './pages/ProjectList';
import ProjectManagement from './pages/ProjectManagement';
import RoleManagement from './pages/RoleManagement';
import SickReports from './pages/SickReports';
import TempWorkers from './pages/TempWorkers';
import TempWorkersEF from './pages/TempWorkersEF';
import UserManagement from './pages/UserManagement';
import VehicleManagement from './pages/VehicleManagement';
import WeeklyPlanning from './pages/WeeklyPlanning';
import WeeklyPlanningEF from './pages/WeeklyPlanningEF';
import WeeklyReportManagement from './pages/WeeklyReportManagement';
import WeeklyReports from './pages/WeeklyReports';
import Workshop from './pages/Workshop';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AccountSettings": AccountSettings,
    "ClothingInventory": ClothingInventory,
    "ClothingRequests": ClothingRequests,
    "CurrentPlan": CurrentPlan,
    "DailyAbsences": DailyAbsences,
    "DailyView": DailyView,
    "DailyViewEF": DailyViewEF,
    "Dashboard": Dashboard,
    "EmailRecipients": EmailRecipients,
    "AzubiManagement": AzubiManagement,
    "EmployeeManagement": EmployeeManagement,
    "LeaveRequestManagement": LeaveRequestManagement,
    "LeaveRequests": LeaveRequests,
    "NewsManagement": NewsManagement,
    "ProjectList": ProjectList,
    "ProjectManagement": ProjectManagement,
    "RoleManagement": RoleManagement,
    "SickReports": SickReports,
    "TempWorkers": TempWorkers,
    "TempWorkersEF": TempWorkersEF,
    "UserManagement": UserManagement,
    "VehicleManagement": VehicleManagement,
    "WeeklyPlanning": WeeklyPlanning,
    "WeeklyPlanningEF": WeeklyPlanningEF,
    "WeeklyReportManagement": WeeklyReportManagement,
    "WeeklyReports": WeeklyReports,
    "Workshop": Workshop,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};