import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Users,
  Building2,
  Plane,
  Thermometer,
  Shirt,
  ArrowRight,
  Clock,
  ChevronLeft,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import PullToRefresh from '@/components/PullToRefresh';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [news, setNews] = useState([]);
  const [polls, setPolls] = useState([]);
  const [currentNewsIndex, setCurrentNewsIndex] = useState(0);
  const [currentPollIndex, setCurrentPollIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [currentUser, projects, newsData, pollsData] = await Promise.all([
        base44.auth.me(),
        base44.entities.Project.filter({ status: 'aktiv' }),
        base44.entities.News.filter({ is_active: true }, '-created_date'),
        base44.entities.Poll.filter({ is_active: true }, '-created_date')
      ]);

      // User-Anzahl über Backend-Funktion laden (für alle verfügbar)
      let usersCount = 0;
      try {
        const { data } = await base44.functions.invoke('getUserCount');
        usersCount = data.count;
      } catch (error) {
        console.error('Could not load user count:', error);
      }

      setUser(currentUser);
      setStats({
        users: usersCount,
        activeProjects: projects.length
      });
      setNews(newsData);
      setPolls(pollsData);
      setCurrentNewsIndex(0);
      setCurrentPollIndex(0);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (pollId, optionId) => {
    if (!user) return;
    
    setVoting(true);
    try {
      const poll = polls.find(p => p.id === pollId);
      if (!poll) return;

      // Check if user already voted
      const existingVote = poll.votes?.find(v => v.user_email === user.email);
      
      let updatedVotes;
      if (existingVote) {
        // Update existing vote
        updatedVotes = poll.votes.map(v => 
          v.user_email === user.email 
            ? { ...v, user_name: user.full_name || user.email, option_id: optionId, voted_at: new Date().toISOString() }
            : v
        );
      } else {
        // Add new vote
        updatedVotes = [
          ...(poll.votes || []),
          {
            user_email: user.email,
            user_name: user.full_name || user.email,
            option_id: optionId,
            voted_at: new Date().toISOString()
          }
        ];
      }

      await base44.entities.Poll.update(pollId, { votes: updatedVotes });
      await loadDashboard();
    } catch (error) {
      console.error('Error voting:', error);
      alert('Fehler beim Abstimmen');
    } finally {
      setVoting(false);
    }
  };

  const getPollResults = (poll) => {
    const totalVotes = poll.votes?.length || 0;
    return poll.options?.map(option => {
      const votes = poll.votes?.filter(v => v.option_id === option.id).length || 0;
      const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
      return { ...option, votes, percentage };
    }) || [];
  };

  const getUserVote = (poll) => {
    if (!user) return null;
    return poll.votes?.find(v => v.user_email === user.email)?.option_id || null;
  };

  const getStatusBadge = (status) => {
    const styles = {
      eingereicht: 'bg-blue-100 text-blue-700 border-blue-200',
      in_pruefung: 'bg-amber-100 text-amber-700 border-amber-200',
      in_bearbeitung: 'bg-amber-100 text-amber-700 border-amber-200',
      genehmigt: 'bg-green-100 text-green-700 border-green-200',
      bestellt: 'bg-purple-100 text-purple-700 border-purple-200',
      geliefert: 'bg-green-100 text-green-700 border-green-200',
      abgelehnt: 'bg-red-100 text-red-700 border-red-200'
    };
    const labels = {
      eingereicht: 'Eingereicht',
      in_pruefung: 'In Prüfung',
      in_bearbeitung: 'In Bearbeitung',
      genehmigt: 'Genehmigt',
      bestellt: 'Bestellt',
      geliefert: 'Geliefert',
      abgelehnt: 'Abgelehnt'
    };
    return (
      <Badge variant="outline" className={styles[status] || 'bg-gray-100'}>
        {labels[status] || status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6 dark:text-white">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadDashboard}>
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white">
          Guten {new Date().getHours() < 12 ? 'Morgen' : new Date().getHours() < 18 ? 'Tag' : 'Abend'}, {user?.full_name?.split(' ')[0] || 'Benutzer'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {format(new Date(), "EEEE, d. MMMM yyyy", { locale: de })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-[#1e3a5f] to-[#2d4a6f] text-white">
          <CardContent className="p-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <p className="text-2xl font-semibold">{stats?.users || 0}</p>
              </div>
              <p className="text-xs text-white/80">Mitarbeiter nutzen die App</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <CardContent className="p-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <p className="text-2xl font-semibold">{stats?.activeProjects || 0}</p>
              </div>
              <p className="text-xs text-white/80">Aktive Baustellen</p>
            </div>
          </CardContent>
        </Card>
      </div>

          {/* News Section */}
          {news.length > 0 && (
          <Card className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-2">
           <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
             News
           </CardTitle>
          </CardHeader>
          <CardContent>
           <div className="space-y-4">
             {news.length > 0 && (
               <div className="bg-gray-50 dark:bg-gray-700 rounded-xl overflow-hidden">
                 <div className="relative">
                   {/* Title above image */}
                   <div className="px-4 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                     <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{news[currentNewsIndex].title}</h2>
                   </div>

                   {/* Images Carousel */}
                   {news[currentNewsIndex].images && news[currentNewsIndex].images.length > 0 && (
                     <div className="relative">
                       <a 
                         href={news[currentNewsIndex].images[0].link || '#'} 
                         target={news[currentNewsIndex].images[0].link ? '_blank' : '_self'}
                         rel={news[currentNewsIndex].images[0].link ? 'noopener noreferrer' : ''}
                         className="block w-full"
                       >
                         <img 
                           src={news[currentNewsIndex].images[0].url} 
                           alt={news[currentNewsIndex].title}
                           className="w-full h-auto object-contain hover:opacity-90 transition-opacity"
                         />
                       </a>

                       {news[currentNewsIndex].images[0].caption && (
                         <div className="px-4 py-2 bg-white dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 border-t dark:border-gray-700">
                           {news[currentNewsIndex].images[0].caption}
                         </div>
                       )}

                       {news[currentNewsIndex].images.length > 1 && (
                         <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                           {news[currentNewsIndex].images.map((_, idx) => (
                             <div 
                               key={idx}
                               className={`h-2 w-2 rounded-full ${idx === 0 ? 'bg-white' : 'bg-white/50'}`}
                             />
                           ))}
                         </div>
                       )}
                     </div>
                   )}
                 </div>

                 <div className="p-4">
                   {news[currentNewsIndex].content && (
                     <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 line-clamp-3">
                       {news[currentNewsIndex].content}
                     </p>
                   )}

                   {news[currentNewsIndex].link && news[currentNewsIndex].link_text && (
                     <div className="mb-4">
                       <a 
                         href={news[currentNewsIndex].link} 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="inline-block"
                       >
                         <Button className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
                           {news[currentNewsIndex].link_text}
                           <ExternalLink className="w-4 h-4 ml-2" />
                         </Button>
                       </a>
                     </div>
                   )}

                   {news.length > 1 && (
                     <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
                       <Button
                         variant="ghost"
                         size="icon"
                         onClick={() => setCurrentNewsIndex(Math.max(0, currentNewsIndex - 1))}
                         disabled={currentNewsIndex === 0}
                         className="h-8 w-8"
                         style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                       >
                         <ChevronLeft className="w-4 h-4" />
                       </Button>
                       <span className="text-xs text-gray-500 dark:text-gray-400">
                         {currentNewsIndex + 1} / {news.length}
                       </span>
                       <Button
                         variant="ghost"
                         size="icon"
                         onClick={() => setCurrentNewsIndex(Math.min(news.length - 1, currentNewsIndex + 1))}
                         disabled={currentNewsIndex === news.length - 1}
                         className="h-8 w-8"
                         style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                       >
                         <ChevronRight className="w-4 h-4" />
                       </Button>
                     </div>
                   )}
                 </div>
               </div>
             )}
           </div>
          </CardContent>
          </Card>
          )}

          {/* Polls Section */}
          {polls.length > 0 && (
          <Card className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                Abstimmung
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {polls.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-xl overflow-hidden">
                    <div className="relative">
                      <div className="px-4 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{polls[currentPollIndex].title}</h2>
                      </div>

                      {polls[currentPollIndex].image_url && (
                        <img 
                          src={polls[currentPollIndex].image_url} 
                          alt={polls[currentPollIndex].title}
                          className="w-full h-auto object-contain"
                        />
                      )}
                    </div>

                    <div className="p-4">
                      {polls[currentPollIndex].description && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                          {polls[currentPollIndex].description}
                        </p>
                      )}

                      {polls[currentPollIndex].show_results ? (
                        <div className="space-y-3 mb-4">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ergebnisse</div>
                          {getPollResults(polls[currentPollIndex]).map((option) => (
                            <div key={option.id} className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium text-gray-900 dark:text-white">{option.label}</span>
                                <span className="text-gray-600 dark:text-gray-400">{option.votes} Stimmen ({option.percentage}%)</span>
                              </div>
                              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                <div 
                                  className="bg-[#1e3a5f] h-2 rounded-full transition-all"
                                  style={{ width: `${option.percentage}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2 mb-4">
                          {getPollResults(polls[currentPollIndex]).map((option) => {
                            const userVote = getUserVote(polls[currentPollIndex]);
                            const isSelected = userVote === option.id;
                            
                            return (
                              <button
                                key={option.id}
                                onClick={() => handleVote(polls[currentPollIndex].id, option.id)}
                                disabled={voting}
                                className={`w-full p-3 rounded-lg border-2 transition-all ${
                                  isSelected 
                                    ? 'border-[#1e3a5f] bg-[#1e3a5f]/10 dark:bg-[#1e3a5f]/20' 
                                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium text-sm text-gray-900 dark:text-white">{option.label}</span>
                                  <span className="text-sm text-gray-600 dark:text-gray-400">{option.percentage}%</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                  <div 
                                    className="bg-[#1e3a5f] h-2 rounded-full transition-all"
                                    style={{ width: `${option.percentage}%` }}
                                  />
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {option.votes} Stimme{option.votes !== 1 ? 'n' : ''}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-3">
                        Gesamt: {polls[currentPollIndex].votes?.length || 0} Stimmen
                      </div>

                      {polls.length > 1 && (
                        <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCurrentPollIndex(Math.max(0, currentPollIndex - 1))}
                            disabled={currentPollIndex === 0}
                            className="h-8 w-8"
                            style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {currentPollIndex + 1} / {polls.length}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCurrentPollIndex(Math.min(polls.length - 1, currentPollIndex + 1))}
                            disabled={currentPollIndex === polls.length - 1}
                            className="h-8 w-8"
                            style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          )}
      </div>
    </PullToRefresh>
  );
}