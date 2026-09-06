import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Building2,
  MapPin,
  User,
  Calendar,
  Search,
  Filter
} from 'lucide-react';
import PullToRefresh from '@/components/PullToRefresh';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ProjectList() {
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('aktiv');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [projectsData, employeesData] = await Promise.all([
        base44.entities.Project.list(),
        base44.entities.Employee.list()
      ]);
      setProjects(projectsData);
      setEmployees(employeesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProjectLeader = (id) => employees.find(e => e.id === id);

  const filteredProjects = projects
    .filter(project => {
      const matchesSearch = 
        project.name?.toLowerCase().includes(search.toLowerCase()) ||
        project.address?.toLowerCase().includes(search.toLowerCase()) ||
        project.city?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'alle' || project.status === statusFilter;
      const isNotTsProject = !project.is_ts_project;
      return matchesSearch && matchesStatus && isNotTsProject;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));

  const getStatusBadge = (status) => {
    const styles = {
      aktiv: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
      abgeschlossen: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700/30 dark:text-gray-300 dark:border-gray-600',
      pausiert: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
    };
     const labels = {
       aktiv: 'Aktiv',
       abgeschlossen: 'Abgeschlossen',
       pausiert: 'Pausiert'
     };
     return (
       <Badge variant="outline" className={styles[status] || 'bg-gray-100'}>
         {labels[status] || status}
       </Badge>
     );
   };

   const openNavigation = (address, city) => {
     const fullAddress = `${address || ''}${address && city ? ', ' : ''}${city || ''}`.trim();
     if (!fullAddress) return;

     const encodedAddress = encodeURIComponent(fullAddress);
     const googleMapsUrl = `https://www.google.com/maps/search/${encodedAddress}`;
     window.open(googleMapsUrl, '_blank');
   };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
          <Building2 className="w-8 h-8" />
          Bauvorhaben
        </h1>
        <p className="text-gray-500 dark:text-gray-300 mt-1">
          {filteredProjects.length} Projekt{filteredProjects.length !== 1 ? 'e' : ''}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Suchen nach Name, Adresse..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm rounded-lg border-gray-200"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9 text-sm rounded-lg border-gray-200">
            <Filter className="w-3.5 h-3.5 mr-2 text-gray-400" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Status</SelectItem>
            <SelectItem value="aktiv">Aktiv</SelectItem>
            <SelectItem value="pausiert">Pausiert</SelectItem>
            <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Project Grid */}
      {filteredProjects.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">Keine Projekte gefunden</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => {
            const leader = getProjectLeader(project.project_leader_id);
            
            return (
               <Card 
                 key={project.id} 
                 className="border-0 shadow-sm hover:shadow-lg transition-shadow duration-300 cursor-pointer"
                 onClick={() => openNavigation(project.address, project.city)}
               >
                 <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-9 h-9 bg-[#1e3a5f]/10 dark:bg-blue-600/30 rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-[#1e3a5f] dark:text-blue-300" />
                    </div>
                    {getStatusBadge(project.status)}
                  </div>
                  
                  <h3 className="font-bold text-base text-gray-900 dark:text-white mb-2 line-clamp-2">
                    {project.name}
                  </h3>

                  {(project.address || project.city) && (
                    <p className="text-gray-500 dark:text-gray-300 text-xs flex items-start gap-1.5 mb-2">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">
                        {project.address}{project.address && project.city ? ', ' : ''}{project.city}
                      </span>
                    </p>
                  )}

                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
                    {leader && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <User className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                        <span className="text-gray-600 dark:text-gray-400">Projektleiter:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {leader.abbreviation || leader.full_name}
                        </span>
                      </div>
                    )}

                    {project.completion_date && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                        <span className="text-gray-600 dark:text-gray-400">Fertigstellung:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {format(new Date(project.completion_date), 'd. MMM yyyy', { locale: de })}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </PullToRefresh>
  );
}