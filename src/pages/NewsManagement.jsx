import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import {
  Newspaper,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Upload,
  Loader,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

export default function NewsManagement() {
  const [activeTab, setActiveTab] = useState('news');
  const [news, setNews] = useState([]);
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pollDialogOpen, setPollDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingNews, setEditingNews] = useState(null);
  const [editingPoll, setEditingPoll] = useState(null);
  const [newsToDelete, setNewsToDelete] = useState(null);
  const [pollToDelete, setPollToDelete] = useState(null);

  const [form, setForm] = useState({
    title: '',
    images: [],
    content: '',
    link: '',
    link_text: '',
    is_active: true
  });

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageForm, setImageForm] = useState({
    url: '',
    link: '',
    caption: ''
  });
  const [uploadingImage, setUploadingImage] = useState(false);

  const [pollForm, setPollForm] = useState({
    title: '',
    image_url: '',
    description: '',
    options: [],
    is_active: true,
    show_results: false
  });
  const [newOption, setNewOption] = useState('');
  const [uploadingPollImage, setUploadingPollImage] = useState(false);

  useEffect(() => {
    loadNews();
  }, []);

  const loadNews = async () => {
    setLoading(true);
    try {
      const [newsData, pollsData] = await Promise.all([
        base44.entities.News.list('-created_date'),
        base44.entities.Poll.list('-created_date')
      ]);
      setNews(newsData);
      setPolls(pollsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    
    setSubmitting(true);
    try {
      const newsData = {
        title: form.title.trim(),
        images: form.images,
        content: form.content.trim(),
        link: form.link.trim() || null,
        link_text: form.link_text.trim() || null,
        is_active: form.is_active
      };

      if (editingNews) {
        await base44.entities.News.update(editingNews.id, newsData);
      } else {
        await base44.entities.News.create(newsData);
      }
      
      setDialogOpen(false);
      await loadNews();
    } catch (error) {
      console.error('Error saving news:', error);
      alert('Fehler beim Speichern: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNews = async () => {
    if (!newsToDelete) return;
    
    try {
      await base44.entities.News.delete(newsToDelete.id);
      setDeleteDialogOpen(false);
      setNewsToDelete(null);
      await loadNews();
    } catch (error) {
      console.error('Error deleting news:', error);
      alert('Fehler beim Löschen: ' + error.message);
    }
  };

  const handleToggleActive = async (newsItem) => {
    try {
      await base44.entities.News.update(newsItem.id, {
        is_active: !newsItem.is_active
      });
      await loadNews();
    } catch (error) {
      console.error('Error updating news:', error);
    }
  };

  const openEditDialog = (newsItem) => {
    setEditingNews(newsItem);
    setForm({
      title: newsItem.title,
      images: newsItem.images || [],
      content: newsItem.content || '',
      link: newsItem.link || '',
      link_text: newsItem.link_text || '',
      is_active: newsItem.is_active
    });
    setCurrentImageIndex(0);
    setDialogOpen(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setImageForm({ ...imageForm, url: file_url });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Fehler beim Hochladen: ' + error.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const addImage = () => {
    if (!imageForm.url.trim()) return;
    const newImages = [...form.images, {
      url: imageForm.url.trim(),
      link: imageForm.link.trim(),
      caption: imageForm.caption.trim()
    }];
    setForm({ ...form, images: newImages });
    setImageForm({ url: '', link: '', caption: '' });
  };

  const removeImage = (index) => {
    const newImages = form.images.filter((_, i) => i !== index);
    setForm({ ...form, images: newImages });
    if (currentImageIndex >= newImages.length && currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  };

  // Poll functions
  const handlePollImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPollImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPollForm({ ...pollForm, image_url: file_url });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Fehler beim Hochladen: ' + error.message);
    } finally {
      setUploadingPollImage(false);
    }
  };

  const addPollOption = () => {
    if (!newOption.trim()) return;
    const newOptions = [...pollForm.options, {
      id: Date.now().toString(),
      label: newOption.trim()
    }];
    setPollForm({ ...pollForm, options: newOptions });
    setNewOption('');
  };

  const removePollOption = (id) => {
    setPollForm({
      ...pollForm,
      options: pollForm.options.filter(opt => opt.id !== id)
    });
  };

  const handleSubmitPoll = async () => {
    if (!pollForm.title.trim() || pollForm.options.length === 0) return;
    
    setSubmitting(true);
    try {
      const pollData = {
        title: pollForm.title.trim(),
        image_url: pollForm.image_url.trim() || null,
        description: pollForm.description.trim() || null,
        options: pollForm.options,
        is_active: pollForm.is_active,
        show_results: pollForm.show_results,
        votes: editingPoll ? editingPoll.votes : []
      };

      if (editingPoll) {
        await base44.entities.Poll.update(editingPoll.id, pollData);
      } else {
        await base44.entities.Poll.create(pollData);
      }
      
      setPollDialogOpen(false);
      await loadNews();
    } catch (error) {
      console.error('Error saving poll:', error);
      alert('Fehler beim Speichern: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePoll = async () => {
    if (!pollToDelete) return;
    
    try {
      await base44.entities.Poll.delete(pollToDelete.id);
      setDeleteDialogOpen(false);
      setPollToDelete(null);
      await loadNews();
    } catch (error) {
      console.error('Error deleting poll:', error);
      alert('Fehler beim Löschen: ' + error.message);
    }
  };

  const handleTogglePollActive = async (poll) => {
    try {
      await base44.entities.Poll.update(poll.id, {
        is_active: !poll.is_active
      });
      await loadNews();
    } catch (error) {
      console.error('Error updating poll:', error);
    }
  };

  const openEditPollDialog = (poll) => {
    setEditingPoll(poll);
    setPollForm({
      title: poll.title,
      image_url: poll.image_url || '',
      description: poll.description || '',
      options: poll.options || [],
      is_active: poll.is_active,
      show_results: poll.show_results || false
    });
    setPollDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const currentImage = form.images[currentImageIndex];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] flex items-center gap-3">
          <Newspaper className="w-8 h-8" />
          News Verwaltung
        </h1>
        <p className="text-gray-500 mt-1">
          {news.length} Beiträge • {polls.length} Abstimmungen
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="news">
              <Newspaper className="w-4 h-4 mr-2" />
              Beiträge
            </TabsTrigger>
            <TabsTrigger value="polls">
              <BarChart3 className="w-4 h-4 mr-2" />
              Abstimmungen
            </TabsTrigger>
          </TabsList>

          {activeTab === 'news' ? (
            <Button 
              onClick={() => {
                setEditingNews(null);
                setForm({ title: '', images: [], content: '', link: '', link_text: '', is_active: true });
                setImageForm({ url: '', link: '', caption: '' });
                setCurrentImageIndex(0);
                setDialogOpen(true);
              }}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Neuer Beitrag
            </Button>
          ) : (
            <Button 
              onClick={() => {
                setEditingPoll(null);
                setPollForm({ title: '', image_url: '', description: '', options: [], is_active: true, show_results: false });
                setNewOption('');
                setPollDialogOpen(true);
              }}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Neue Abstimmung
            </Button>
          )}
        </div>

        <TabsContent value="news" className="space-y-4">

      {/* News List */}
      <div className="space-y-4">
        {news.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-8 text-center text-gray-500">
              <Newspaper className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Keine News vorhanden</p>
            </CardContent>
          </Card>
        ) : (
          news.map((item) => (
            <Card key={item.id} className={`border-0 shadow-sm ${!item.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                        <Badge variant="outline" className={item.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600'}>
                          {item.is_active ? 'Aktiv' : 'Inaktiv'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">
                        Erstellt: {format(new Date(item.created_date), 'd.M.yyyy H:mm')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(item)}
                        className="text-blue-600 hover:bg-blue-50"
                      >
                        {item.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(item)}
                        className="text-gray-600 hover:bg-gray-100"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setNewsToDelete(item);
                          setDeleteDialogOpen(true);
                        }}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {item.images?.length > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <img 
                        src={item.images[0].url} 
                        alt="Preview" 
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1 text-sm text-gray-600">
                        {item.images.length} Bild{item.images.length > 1 ? 'er' : ''}
                      </div>
                    </div>
                  )}

                  {item.content && (
                    <p className="text-sm text-gray-700 line-clamp-2">{item.content}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
        </TabsContent>

        <TabsContent value="polls" className="space-y-4">
          {polls.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-8 text-center text-gray-500">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Keine Abstimmungen vorhanden</p>
              </CardContent>
            </Card>
          ) : (
            polls.map((poll) => (
              <Card key={poll.id} className={`border-0 shadow-sm ${!poll.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">{poll.title}</h3>
                          <Badge variant="outline" className={poll.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600'}>
                            {poll.is_active ? 'Aktiv' : 'Inaktiv'}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500">
                          {poll.options?.length || 0} Optionen • {poll.votes?.length || 0} Stimmen
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTogglePollActive(poll)}
                          className="text-blue-600 hover:bg-blue-50"
                        >
                          {poll.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditPollDialog(poll)}
                          className="text-gray-600 hover:bg-gray-100"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setPollToDelete(poll);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {poll.image_url && (
                      <img src={poll.image_url} alt={poll.title} className="w-full h-32 object-cover rounded-lg" />
                    )}

                    {poll.description && (
                      <p className="text-sm text-gray-700 line-clamp-2">{poll.description}</p>
                    )}

                    {/* Poll Results */}
                    <div className="border-t pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900">Ergebnisse</h4>
                        <Badge variant={poll.show_results ? 'default' : 'outline'}>
                          {poll.show_results ? 'Sichtbar auf Dashboard' : 'Nur hier sichtbar'}
                        </Badge>
                      </div>
                      
                      {poll.options?.map((option) => {
                        const optionVotes = (poll.votes || []).filter(v => v.option_id === option.id);
                        const percentage = poll.votes?.length > 0 
                          ? Math.round((optionVotes.length / poll.votes.length) * 100)
                          : 0;
                        
                        return (
                          <div key={option.id} className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{option.label}</span>
                              <span className="text-gray-600">{optionVotes.length} Stimmen ({percentage}%)</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-500 h-2 rounded-full transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            {optionVotes.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {optionVotes.map((vote, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {vote.user_name || vote.user_email}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingNews ? 'Beitrag bearbeiten' : 'Neuer Beitrag'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label>Überschrift</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({...form, title: e.target.value})}
                placeholder="z.B. Wichtige Mitteilung"
              />
            </div>

            {/* Images */}
            <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
              <Label>Bilder</Label>
              
              {form.images.length > 0 && (
                <div className="space-y-3">
                  <div className="bg-white rounded-lg overflow-hidden">
                    <img 
                      src={currentImage.url} 
                      alt="Current" 
                      className="w-full h-48 object-cover"
                    />
                  </div>

                  {currentImage.link && (
                    <div className="text-sm text-blue-600 truncate">
                      Link: {currentImage.link}
                    </div>
                  )}

                  {currentImage.caption && (
                    <div className="text-sm text-gray-700">
                      Unterschrift: {currentImage.caption}
                    </div>
                  )}

                  {form.images.length > 1 && (
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentImageIndex(Math.max(0, currentImageIndex - 1))}
                        disabled={currentImageIndex === 0}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-gray-600">
                        {currentImageIndex + 1} / {form.images.length}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentImageIndex(Math.min(form.images.length - 1, currentImageIndex + 1))}
                        disabled={currentImageIndex === form.images.length - 1}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-red-600 border-red-200"
                    onClick={() => removeImage(currentImageIndex)}
                  >
                    Bild löschen
                  </Button>
                </div>
              )}

              <div className="space-y-2 pt-3 border-t">
                <div className="text-sm font-medium">Bild hochladen</div>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                    id="image-upload"
                  />
                  <label htmlFor="image-upload">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="w-full cursor-pointer"
                      disabled={uploadingImage}
                    >
                      <span>
                        {uploadingImage ? (
                          <>
                            <Loader className="w-4 h-4 mr-2 animate-spin" />
                            Wird hochgeladen...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Bild hochladen
                          </>
                        )}
                      </span>
                    </Button>
                  </label>
                </div>
                
                {imageForm.url && (
                  <div className="space-y-2">
                    <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center overflow-hidden">
                      <img src={imageForm.url} alt="Preview" className="h-full object-cover" />
                    </div>
                    <Input
                      value={imageForm.link}
                      onChange={(e) => setImageForm({...imageForm, link: e.target.value})}
                      placeholder="Link (optional)"
                    />
                    <Input
                      value={imageForm.caption}
                      onChange={(e) => setImageForm({...imageForm, caption: e.target.value})}
                      placeholder="Bildunterschrift (optional)"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={addImage}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Bild hinzufügen
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label>Text</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({...form, content: e.target.value})}
                placeholder="Beitragstext..."
                rows={4}
              />
            </div>

            {/* Link Section */}
            <div className="space-y-2 border rounded-lg p-4 bg-blue-50">
              <Label>Button-Link (optional)</Label>
              <Input
                value={form.link}
                onChange={(e) => setForm({...form, link: e.target.value})}
                placeholder="https://beispiel.de"
                type="url"
              />
              <Input
                value={form.link_text}
                onChange={(e) => setForm({...form, link_text: e.target.value})}
                placeholder="z.B. Mehr erfahren"
              />
            </div>

            {/* Active Toggle */}
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({...form, is_active: e.target.checked})}
                id="is_active"
                className="rounded"
              />
              <Label htmlFor="is_active" className="cursor-pointer flex-1">
                Beitrag aktiv (auf Dashboard anzeigen)
              </Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!form.title.trim() || submitting}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              {submitting ? 'Wird gespeichert...' : editingNews ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Poll Dialog */}
      <Dialog open={pollDialogOpen} onOpenChange={setPollDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPoll ? 'Abstimmung bearbeiten' : 'Neue Abstimmung'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Überschrift</Label>
              <Input
                value={pollForm.title}
                onChange={(e) => setPollForm({...pollForm, title: e.target.value})}
                placeholder="z.B. Welche Farbe soll das neue Logo haben?"
              />
            </div>

            <div className="space-y-2">
              <Label>Bild (optional)</Label>
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePollImageUpload}
                  disabled={uploadingPollImage}
                  className="hidden"
                  id="poll-image-upload"
                />
                <label htmlFor="poll-image-upload">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full cursor-pointer"
                    disabled={uploadingPollImage}
                  >
                    <span>
                      {uploadingPollImage ? (
                        <>
                          <Loader className="w-4 h-4 mr-2 animate-spin" />
                          Wird hochgeladen...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Bild hochladen
                        </>
                      )}
                    </span>
                  </Button>
                </label>
                {pollForm.image_url && (
                  <div className="relative">
                    <img src={pollForm.image_url} alt="Preview" className="w-full h-32 object-cover rounded" />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPollForm({...pollForm, image_url: ''})}
                      className="absolute top-2 right-2 bg-white hover:bg-gray-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Beschreibung (optional)</Label>
              <Textarea
                value={pollForm.description}
                onChange={(e) => setPollForm({...pollForm, description: e.target.value})}
                placeholder="Zusätzlicher Text zur Abstimmung..."
                rows={3}
              />
            </div>

            <div className="space-y-2 border rounded-lg p-4 bg-gray-50">
              <Label>Auswahloptionen</Label>
              
              {pollForm.options.length > 0 && (
                <div className="space-y-2 mb-3">
                  {pollForm.options.map((option) => (
                    <div key={option.id} className="flex items-center gap-2 bg-white p-2 rounded">
                      <span className="flex-1 text-sm">{option.label}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePollOption(option.id)}
                        className="h-8 w-8 text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  placeholder="Neue Option..."
                  onKeyPress={(e) => e.key === 'Enter' && addPollOption()}
                />
                <Button
                  variant="outline"
                  onClick={addPollOption}
                  disabled={!newOption.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <input
                type="checkbox"
                checked={pollForm.is_active}
                onChange={(e) => setPollForm({...pollForm, is_active: e.target.checked})}
                id="poll_active"
                className="rounded"
              />
              <Label htmlFor="poll_active" className="cursor-pointer flex-1">
                Abstimmung aktiv (auf Dashboard anzeigen)
              </Label>
            </div>

            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <input
                type="checkbox"
                checked={pollForm.show_results}
                onChange={(e) => setPollForm({...pollForm, show_results: e.target.checked})}
                id="show_results"
                className="rounded"
              />
              <Label htmlFor="show_results" className="cursor-pointer flex-1">
                Ergebnisse auf Dashboard anzeigen (anstatt Abstimmungsoptionen)
              </Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setPollDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmitPoll}
              disabled={!pollForm.title.trim() || pollForm.options.length === 0 || submitting}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              {submitting ? 'Wird gespeichert...' : editingPoll ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{newsToDelete ? 'Beitrag' : 'Abstimmung'} löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie {newsToDelete ? `den Beitrag "${newsToDelete?.title}"` : `die Abstimmung "${pollToDelete?.title}"`} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction 
              onClick={newsToDelete ? handleDeleteNews : handleDeletePoll} 
              className="bg-red-600 hover:bg-red-700"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}