import { useState, useEffect, useRef } from 'react';
import { api } from '@/api/client';
import { Shirt, FileText, User, TrendingUp, Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ClothingIssueHistory from '../components/ClothingIssueHistory';
import ClothingInventoryPanel from '../components/ClothingInventoryPanel';

export default function ClothingInventory() {
  const [items, setItems] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [requests, setRequests] = useState([]);
  const [returns, setReturns] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [issues, setIssues] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('neu'); // 'neu' | 'gebraucht'
  const [issueHistoryDialogOpen, setIssueHistoryDialogOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsData, deliveriesData, requestsData, returnsData, employeesData, issuesData] = await Promise.all([
        api.entities.ClothingItem.filter({ is_active: true }),
        api.entities.ClothingDelivery.list('-delivery_date'),
        api.entities.ClothingRequest.list('-created_date'),
        api.entities.ClothingReturn.list('-created_date'),
        api.entities.Employee.list(),
        api.entities.ClothingIssue.list('-issue_date')
      ]);
      setItems(itemsData);
      setDeliveries(deliveriesData);
      setRequests(requestsData);
      setReturns(returnsData);
      setEmployees(employeesData);
      setIssues(issuesData);

      try {
        const [usersData, me] = await Promise.all([api.entities.User.list(), api.auth.me()]);
        setUsers(usersData);
        setCurrentUser(me);
      } catch {
        try { const me = await api.auth.me(); setCurrentUser(me); } catch {}
        setUsers([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'neu', label: 'Neue Kleidung' },
    { key: 'gebraucht', label: 'Gebrauchte Kleidung' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] flex items-center gap-3">
            <Shirt className="w-8 h-8" />
            Arbeitskleidung Verwaltung
          </h1>
          <p className="text-gray-500 mt-1">Artikelverwaltung und Bestandsübersicht</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => panelRef.current?.openManualIssue()} variant="outline" className="border-green-300 text-green-700 hover:bg-green-50">
            <User className="w-4 h-4 mr-2" />
            <span>Manuelle Ausgabe</span>
          </Button>
          <Button onClick={() => panelRef.current?.openDelivery()} variant="outline">
            <TrendingUp className="w-4 h-4 mr-2" />
            <span>Lieferung erfassen</span>
          </Button>
          <Button onClick={() => panelRef.current?.openNewItem()} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
            <Plus className="w-4 h-4 mr-2" />
            <span>Artikel anlegen</span>
          </Button>
          <Button onClick={() => setIssueHistoryDialogOpen(true)} variant="outline">
            <FileText className="w-4 h-4 mr-2" />
            <span>Ausgabehistorie</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <ClothingInventoryPanel
        key={activeTab}
        ref={panelRef}
        isUsed={activeTab === 'gebraucht'}
        items={items}
        deliveries={deliveries}
        requests={requests}
        returns={returns}
        employees={employees}
        issues={issues}
        users={users}
        currentUser={currentUser}
        onRefresh={loadData}
      />

      {/* Issue History Dialog */}
      <Dialog open={issueHistoryDialogOpen} onOpenChange={setIssueHistoryDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ausgabehistorie</DialogTitle></DialogHeader>
          <ClothingIssueHistory issues={issues} deliveries={deliveries} items={items} users={users} currentUser={currentUser} isUsed={activeTab === 'gebraucht'} onRefresh={loadData} />
        </DialogContent>
      </Dialog>
    </div>
  );
}