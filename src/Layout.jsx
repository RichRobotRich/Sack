import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from './utils';
import { api } from '@/api/client';
import RouteAnimationWrapper from './components/RouteAnimationWrapper';
import {
  Menu,
  LogOut,
  ChevronDown,
  ChevronLeft,
  XCircle,
  Calendar,
  Building2,
  FileText,
  Plane,
  Thermometer,
  Shirt,
  Settings,
} from 'lucide-react';
import { ALL_PAGES } from '@/lib/allPages';
import { LOGO_URL } from '@/lib/branding';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const navigationStacksRef = useRef({});
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    // Update active tab based on current page
    const currentPage = currentPageName || 'Dashboard';
    const bottomTabPages = ['CurrentPlan', 'ProjectList', 'WeeklyReports', 'LeaveRequests', 'SickReports', 'ClothingRequests'];
    
    if (bottomTabPages.includes(currentPage)) {
      setActiveTab(currentPage);
    }
  }, [currentPageName]);

  const handleTabClick = (tabPage) => {
    if (activeTab === tabPage) {
      // Reset stack for this tab
      navigationStacksRef.current[tabPage] = [];
      navigate(createPageUrl(tabPage));
    } else {
      setActiveTab(tabPage);
      navigate(createPageUrl(tabPage));
    }
  };

  const loadUser = async () => {
    try {
      const currentUser = await api.auth.me();
      setUser(currentUser);
      if (currentUser && !currentUser.full_name) {
        setShowNameDialog(true);
      }
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const [userRole, setUserRole] = useState(null);
  const [allowedPages, setAllowedPages] = useState([]);
  const [approvalRules, setApprovalRules] = useState([]);

  // Hell/Dunkel wird in App.jsx gesetzt, damit es auch vor der Anmeldung gilt.

  useEffect(() => {
    if (user?.role_id) {
      loadUserRole();
      loadApprovalRules();
    }
  }, [user]);

  const loadUserRole = async () => {
     try {
       const roles = await api.entities.Role.filter({ is_active: true });

       let userCurrentRole = user.role_id ? roles.find(r => r.id === user.role_id) : null;

       // Wenn Benutzer keine Rolle hat, passende Rolle zuweisen
       if (!userCurrentRole) {
         const defaultRole = user.role === 'admin' 
           ? roles.find(r => r.name === 'Admin')
           : roles.find(r => r.name === 'Standard');

         if (defaultRole) {
           userCurrentRole = defaultRole;
           // Rolle dem Benutzer zuweisen
           await api.auth.updateMe({ role_id: defaultRole.id });
         }
       }

       // WICHTIG: Wenn Benutzer eine Admin-Rolle hat, aber user.role nicht 'admin' ist, korrigieren
       if (userCurrentRole && userCurrentRole.is_admin && user.role !== 'admin') {
         await api.auth.updateMe({ role: 'admin' });
         // User-Objekt aktualisieren
         setUser({ ...user, role: 'admin' });
       }

       if (userCurrentRole) {
         setUserRole(userCurrentRole);
         setAllowedPages(userCurrentRole.is_admin ? 'all' : userCurrentRole.allowed_pages || []);
       }
     } catch (error) {
       console.error('Error loading role:', error);
     }
   };

   const loadApprovalRules = async () => {
     try {
       const rules = await api.entities.LeaveApprovalRule.filter({ is_active: true });
       setApprovalRules(rules);
     } catch (error) {
       console.error('Error loading approval rules:', error);
       setApprovalRules([]);
     }
   };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    
    setSaving(true);
    try {
      await api.auth.updateMe({ full_name: nameInput.trim() });
      setUser({ ...user, full_name: nameInput.trim() });
      setShowNameDialog(false);
    } catch (error) {
      console.error('Error saving name:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    api.auth.logout();
  };

  const isApproved = user?.is_approved || false;
  const isAdmin = user?.role === 'admin' || userRole?.is_admin || false;

  const hasPageAccess = (pageId) => {
    if (!isApproved) return false;
    if (allowedPages === 'all' || isAdmin) return true;

    // Special case: LeaveRequestManagement is accessible if user has approval rules
    if (pageId === 'LeaveRequestManagement') {
      const hasApprovalRules = approvalRules.some(rule => rule.user_email === user?.email && rule.is_active);
      if (hasApprovalRules) return true;
    }

    return allowedPages.includes(pageId);
  };

  // Menülisten direkt aus ALL_PAGES ableiten – nie mehr manuell doppelt pflegen
  const pagesByGroup = (group) => ALL_PAGES.filter(p => p.group === group).map(p => ({ name: p.name, icon: p.icon, page: p.id }));
  const standardMenuItems = pagesByGroup('Standard');
  const extendedMenuItems = pagesByGroup('Disposition');
  const workshopMenuItems = pagesByGroup('Produktion');
  const erfurtMenuItems = pagesByGroup('Disposition Erfurt');
  const adminMenuItems = pagesByGroup('Verwaltung');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#1e3a5f]/20 dark:bg-blue-500/20"></div>
          <div className="h-4 w-32 bg-[#1e3a5f]/20 dark:bg-blue-500/20 rounded"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f8f7f6] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <img 
            src={LOGO_URL} 
            alt="Leniger Logo" 
            className="h-16 w-auto mx-auto mb-6"
          />
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-2">Disposition</h1>
          <p className="text-gray-500 mb-6">Bitte melden Sie sich an, um fortzufahren.</p>
          <Button 
            onClick={() => api.auth.redirectToLogin()}
            className="w-full bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
          >
            Anmelden
          </Button>
        </div>
      </div>
    );
  }

  if (!isApproved) {
    return (
      <div className="min-h-screen bg-[#f8f7f6] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <img 
            src={LOGO_URL} 
            alt="Leniger Logo" 
            className="h-16 w-auto mx-auto mb-6"
          />
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-2">Freigabe ausstehend</h1>
          <p className="text-gray-500 mb-6">
            Ihr Konto wartet auf Freigabe durch einen Administrator. 
            Sie werden benachrichtigt, sobald Sie Zugang haben.
          </p>
          <p className="text-sm text-gray-400 mb-4">Angemeldet als: {user.email}</p>
          <Button 
            onClick={handleLogout}
            variant="outline"
            className="w-full"
          >
            Abmelden
          </Button>
        </div>
      </div>
    );
  }

  const NavLink = ({ item }) => (
    <Link
      to={createPageUrl(item.page)}
      onClick={() => setIsMenuOpen(false)}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
        currentPageName === item.page
          ? 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
      }`}
    >
      <item.icon className={`w-5 h-5 ${currentPageName === item.page ? 'text-blue-500' : ''}`} />
      <span className="font-normal text-[15px]">{item.name}</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-black">
      <style>{`
              @media print {
                .no-print { display: none !important; }
                .print-only { display: block !important; }
                body { background: white !important; }
              }
              .print-only { display: none; }
              main {
                overscroll-behavior-y: none;
              }
              * {
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }
            `}</style>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-20 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-white/10 z-50 px-4 flex items-center no-print" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        {currentPageName !== 'Dashboard' && (
          <button 
            onClick={() => navigate(-1)}
            className="mr-2 select-none"
            style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
          >
            <ChevronLeft className="w-6 h-6 text-[#1e3a5f] dark:text-white" />
          </button>
        )}
        {currentPageName === 'Dashboard' && <div className="w-8" />}
        <Link to={createPageUrl('Dashboard')} className="flex items-center gap-3 hover:opacity-70 transition-opacity select-none" style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>
          <img 
            src={LOGO_URL} 
            alt="Leniger Logo" 
            className="h-10 w-auto"
          />
          <span className="font-semibold text-xl text-gray-900 dark:text-white tracking-tight">Leniger</span>
        </Link>
      </header>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40 no-print"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-72 bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-2xl border-r border-gray-200/50 dark:border-white/10 z-50 
        transform transition-transform duration-300 ease-out no-print
        lg:translate-x-0 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col overflow-hidden">
          {/* Logo */}
          <Link to={createPageUrl('Dashboard')} className="block p-6 border-b border-gray-100/50 dark:border-white/5 hover:opacity-70 transition-opacity">
            <div className="flex items-center gap-3">
              <img 
                src={LOGO_URL} 
                alt="Leniger Logo" 
                className="h-12 w-auto"
              />
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-white text-xl tracking-tight">Leniger</h1>
              </div>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {/* Standard Menu */}
            <div className="space-y-1">
              {standardMenuItems.filter(item => hasPageAccess(item.page)).map((item) => (
                <NavLink key={item.page} item={item} />
              ))}
            </div>

            {/* Extended Menu */}
            {extendedMenuItems.some(item => hasPageAccess(item.page)) && (
              <>
                <div className="pt-4 pb-2">
                  <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Disposition
                  </p>
                </div>
                <div className="space-y-1">
                  {extendedMenuItems.filter(item => hasPageAccess(item.page)).map((item) => (
                    <NavLink key={item.page} item={item} />
                  ))}
                </div>
              </>
            )}

            {/* Workshop Menu */}
            {workshopMenuItems.some(item => hasPageAccess(item.page)) && (
              <>
                <div className="pt-4 pb-2">
                  <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Produktion
                  </p>
                </div>
                <div className="space-y-1">
                  {workshopMenuItems.filter(item => hasPageAccess(item.page)).map((item) => (
                    <NavLink key={item.page} item={item} />
                  ))}
                </div>
              </>
            )}

            {/* Disposition Erfurt Menu */}
            {erfurtMenuItems.some(item => hasPageAccess(item.page)) && (
              <>
                <div className="pt-4 pb-2">
                  <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Disposition Erfurt
                  </p>
                </div>
                <div className="space-y-1">
                  {erfurtMenuItems.filter(item => hasPageAccess(item.page)).map((item) => (
                    <NavLink key={item.page} item={item} />
                  ))}
                </div>
              </>
            )}

            {/* Admin Menu */}
            {adminMenuItems.some(item => hasPageAccess(item.page)) && (
              <>
                <div className="pt-4 pb-2">
                  <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Verwaltung
                  </p>
                </div>
                <div className="space-y-1">
                  {adminMenuItems.filter(item => hasPageAccess(item.page)).map((item) => (
                    <NavLink key={item.page} item={item} />
                  ))}
                </div>
              </>
            )}
          </nav>

          {/* User Section */}
          <div className="p-4 pb-24 lg:pb-4 border-t border-gray-100/50 dark:border-white/5 flex-shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <span className="text-white font-medium text-sm">
                      {user.full_name?.charAt(0) || user.email?.charAt(0)?.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-normal text-gray-900 dark:text-white truncate">
                      {user.full_name || user.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{userRole?.name || 'Keine Rolle'}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate(createPageUrl('AccountSettings'))}>
                  <Settings className="w-4 h-4 mr-2" />
                  Kontoeinstellungen
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Abmelden
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-72 pt-20 lg:pt-0 min-h-screen" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
        <div className={`p-4 lg:p-8 ${['WeeklyPlanning', 'WeeklyPlanningEF', 'TempWorkers', 'TempWorkersEF', 'EarlyShiftPage'].includes(currentPageName) ? 'w-full' : 'max-w-7xl mx-auto'}`}>
          <RouteAnimationWrapper currentPageName={currentPageName}>
            {!hasPageAccess(currentPageName) && currentPageName !== 'Dashboard' ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="max-w-md w-full text-center border-0 shadow-sm">
                  <CardContent className="pt-6">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                      <XCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">Zugriff verweigert</h2>
                    <p className="text-gray-600 mb-4">
                      Sie haben keine Berechtigung, diese Seite zu sehen.
                    </p>
                    <Button onClick={() => navigate(createPageUrl('Dashboard'))}>
                      Zurück zum Dashboard
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              children
            )}
          </RouteAnimationWrapper>
        </div>
      </main>

      {/* Bottom Navigation Bar - Mobile Only */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-2xl border-t border-gray-200/50 dark:border-white/10 z-50 no-print" style={{ WebkitUserSelect: 'none', userSelect: 'none', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-around px-2" style={{ height: 'calc(5rem + env(safe-area-inset-bottom))' }}>
          {hasPageAccess('CurrentPlan') && (
            <button
              onClick={() => handleTabClick('CurrentPlan')}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
                activeTab === 'CurrentPlan'
                  ? 'text-blue-500'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
            >
              <Calendar className="w-6 h-6" />
              <span className="text-[11px] font-normal">Plan</span>
            </button>
          )}

          {hasPageAccess('ProjectList') && (
            <button
              onClick={() => handleTabClick('ProjectList')}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
                activeTab === 'ProjectList'
                  ? 'text-blue-500'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
            >
              <Building2 className="w-6 h-6" />
              <span className="text-[11px] font-normal">Projekte</span>
            </button>
          )}

          {hasPageAccess('WeeklyReports') && (
            <button
              onClick={() => handleTabClick('WeeklyReports')}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
                activeTab === 'WeeklyReports'
                  ? 'text-blue-500'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
            >
              <FileText className="w-6 h-6" />
              <span className="text-[11px] font-normal">Berichte</span>
            </button>
          )}

          {hasPageAccess('LeaveRequests') && (
            <button
              onClick={() => handleTabClick('LeaveRequests')}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
                activeTab === 'LeaveRequests'
                  ? 'text-blue-500'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
            >
              <Plane className="w-6 h-6" />
              <span className="text-[11px] font-normal">Urlaub</span>
            </button>
          )}

          {hasPageAccess('SickReports') && (
            <button
              onClick={() => handleTabClick('SickReports')}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
                activeTab === 'SickReports'
                  ? 'text-blue-500'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
            >
              <Thermometer className="w-6 h-6" />
              <span className="text-[11px] font-normal">Krank</span>
            </button>
          )}

          {hasPageAccess('ClothingRequests') && (
            <button
              onClick={() => handleTabClick('ClothingRequests')}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
                activeTab === 'ClothingRequests'
                  ? 'text-blue-500'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
            >
              <Shirt className="w-6 h-6" />
              <span className="text-[11px] font-normal">Kleidung</span>
            </button>
          )}

          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex flex-col items-center justify-center flex-1 h-full gap-1 text-gray-500 dark:text-gray-400 transition-colors"
            style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
          >
            <Menu className="w-6 h-6" />
            <span className="text-[11px] font-normal">Menü</span>
          </button>
        </div>
      </nav>

      {/* Name Input Dialog */}
      <Dialog open={showNameDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Willkommen!</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-600">
              Bitte geben Sie Ihren Namen ein, damit Ihre Anfragen korrekt zugeordnet werden können.
            </p>
            <div className="space-y-2">
              <Label htmlFor="name">Vollständiger Name</Label>
              <Input
                id="name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="z.B. Max Mustermann"
                onKeyPress={(e) => e.key === 'Enter' && handleSaveName()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              onClick={handleSaveName}
              disabled={!nameInput.trim() || saving}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 w-full"
            >
              {saving ? 'Wird gespeichert...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
      );
      }