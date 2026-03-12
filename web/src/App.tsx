import { useState, useEffect, useMemo } from 'react';
import { HabitGrid, type CompletionData } from './components/habit-grid';
import { BackgroundParticles } from './components/background-particles';
import { InsightsPanel, type Insight } from './components/insights-panel';
import { QuoteBanner } from './components/quote-banner';

interface Habit {
  id: string;
  name: string;
  measure_unit: string;
  tags: string[];
  day_start_offset: number;
  current_streak: number;
  completions: CompletionData[];
}

function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitUnit, setNewHabitUnit] = useState('');
  const [newHabitTagsStr, setNewHabitTagsStr] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editTagsStr, setEditTagsStr] = useState('');
  const [showInsights, setShowInsights] = useState(false);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  
  // State for check-in forms
  const [activeCheckIn, setActiveCheckIn] = useState<string | null>(null);
  const [checkInDate, setCheckInDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkInValue, setCheckInValue] = useState<number | ''>(1);

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; habitId: string | null; habitName: string }>({
    isOpen: false,
    habitId: null,
    habitName: '',
  });

  const fetchHabitsAndInsights = async () => {
    try {
      const [habitsRes, insightsRes] = await Promise.all([
        fetch('/api/habits'),
        fetch('/api/insights')
      ]);
      
      const habitsData = await habitsRes.json();
      const insightsData = await insightsRes.json();
      
      setHabits(habitsData || []);
      setInsights(insightsData || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHabitsAndInsights();
  }, []);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    habits.forEach(h => {
      (h.tags || []).forEach(t => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [habits]);

  const filteredHabits = useMemo(() => {
    if (!activeTagFilter) return habits;
    return habits.filter(h => (h.tags || []).includes(activeTagFilter));
  }, [habits, activeTagFilter]);

  const parseTags = (str: string) => {
    return str.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
  };

  const createHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitName.trim()) return;

    const tags = parseTags(newHabitTagsStr);

    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newHabitName, 
          measure_unit: newHabitUnit, 
          tags,
          day_start_offset: 0 
        }),
      });
      if (res.ok) {
        setNewHabitName('');
        setNewHabitUnit('');
        setNewHabitTagsStr('');
        fetchHabitsAndInsights();
      }
    } catch (err) {
      console.error('Failed to create habit:', err);
    }
  };

  const updateHabit = async (e: React.FormEvent, id: string, currentOffset: number) => {
    e.preventDefault();
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }

    const tags = parseTags(editTagsStr);

    try {
      const res = await fetch(`/api/habits/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: editName, 
          measure_unit: editUnit, 
          tags,
          day_start_offset: Number(currentOffset) || 0 
        }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchHabitsAndInsights();
      } else {
        const errorText = await res.text();
        console.error('Failed to update habit on server:', errorText);
      }
    } catch (err) {
      console.error('Failed to update habit network request:', err);
    }
  };

  const confirmDelete = (habit: Habit) => {
    setConfirmModal({
      isOpen: true,
      habitId: habit.id,
      habitName: habit.name,
    });
  };

  const executeDelete = async () => {
    const id = confirmModal.habitId;
    if (!id) return;

    try {
      const res = await fetch(`/api/habits/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConfirmModal({ isOpen: false, habitId: null, habitName: '' });
        fetchHabitsAndInsights();
      }
    } catch (err) {
      console.error('Failed to delete habit:', err);
    }
  };

  const submitCheckIn = async (e: React.FormEvent, habitId: string) => {
    e.preventDefault();
    const val = Number(checkInValue);
    if (isNaN(val) || val <= 0) return;

    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habit_id: habitId, date: checkInDate, value: val }),
      });
      if (res.ok) {
        setActiveCheckIn(null);
        fetchHabitsAndInsights();
      }
    } catch (err) {
      console.error('Failed to check in:', err);
    }
  };

  const startEditing = (habit: Habit) => {
    setEditingId(habit.id);
    setEditName(habit.name);
    setEditUnit(habit.measure_unit || '');
    setEditTagsStr((habit.tags || []).join(', '));
    setActiveCheckIn(null);
  };

  const toggleCheckIn = (habitId: string) => {
    if (activeCheckIn === habitId) {
      setActiveCheckIn(null);
    } else {
      setActiveCheckIn(habitId);
      setCheckInDate(new Date().toISOString().split('T')[0]);
      setCheckInValue(1);
      setEditingId(null);
    }
  };

  return (
    <div className="min-h-screen text-text-primary flex flex-col items-center relative">
      <BackgroundParticles />
      <QuoteBanner />
      
      {/* 
        The main wrapper expands to max-w-[1500px] on 2xl screens to allow for the 2-column grid.
        On smaller screens, it remains max-w-3xl for the single column layout. 
      */}
      <div className="w-full max-w-3xl 2xl:max-w-[1500px] px-4 py-12 flex flex-col mx-auto relative z-10">
      
      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface border border-white/10 p-8 rounded-sm shadow-2xl max-w-sm w-full">
            <h3 className="text-xl font-bold uppercase tracking-tight text-red-500 mb-2">Delete Habit</h3>
            <p className="text-text-secondary mb-6 text-sm">
              Are you sure you want to permanently delete <strong className="text-text-primary">{confirmModal.habitName}</strong>? All history will be lost.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal({ isOpen: false, habitId: null, habitName: '' })}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="bg-red-900/30 hover:bg-red-600 text-red-500 hover:text-white px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="w-full mb-12 flex justify-between items-start pointer-events-none">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2 uppercase pointer-events-auto">Commit</h1>
          <p className="text-text-secondary text-sm tracking-widest uppercase pointer-events-auto">Precision Habit Tracking</p>
        </div>
        <button
          onClick={() => setShowInsights(!showInsights)}
          className={`pointer-events-auto cursor-pointer font-mono text-xs px-3 py-1.5 rounded-sm border transition-colors ${showInsights ? 'bg-accent-4 text-background border-accent-4' : 'bg-surface border-white/10 text-text-secondary hover:text-text-primary hover:border-white/30'}`}
          title="Toggle System Insights"
        >
          &gt;_
        </button>
      </header>

      <main className="w-full flex flex-col gap-8">
        
        {/* Form and Tag Filter Area */}
        <div className="flex flex-col gap-4">
          <form onSubmit={createHabit} className="flex flex-wrap gap-2 w-full max-w-3xl">
            <input
              type="text"
              value={newHabitName}
              onChange={(e) => setNewHabitName(e.target.value)}
              placeholder="New Habit..."
              className="flex-1 min-w-[200px] bg-surface border-none text-text-primary px-4 py-2 rounded-sm focus:ring-1 focus:ring-accent-4 outline-none transition-all placeholder:text-text-secondary/50"
            />
            <input
              type="text"
              value={newHabitTagsStr}
              onChange={(e) => setNewHabitTagsStr(e.target.value)}
              placeholder="Tags (comma separated)"
              className="flex-1 min-w-[150px] bg-surface border-none text-text-primary px-4 py-2 rounded-sm focus:ring-1 focus:ring-accent-4 outline-none transition-all placeholder:text-text-secondary/50 text-sm font-mono"
            />
            <input
              type="text"
              value={newHabitUnit}
              onChange={(e) => setNewHabitUnit(e.target.value)}
              placeholder="Unit (e.g. pages)"
              className="w-32 bg-surface border-none text-text-primary px-4 py-2 rounded-sm focus:ring-1 focus:ring-accent-4 outline-none transition-all placeholder:text-text-secondary/50"
            />
            <button
              type="submit"
              className="bg-accent-4 cursor-pointer text-background px-6 py-2 rounded-sm font-bold uppercase tracking-wider hover:bg-white transition-colors"
            >
              Add
            </button>
          </form>

          {/* Tags Filter Bar */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-text-secondary uppercase tracking-widest mr-2">Filter:</span>
              <button
                onClick={() => setActiveTagFilter(null)}
                className={`cursor-pointer px-3 py-1 rounded-sm text-xs font-mono transition-colors ${!activeTagFilter ? 'bg-text-primary text-background' : 'bg-surface border border-white/10 text-text-secondary hover:text-text-primary'}`}
              >
                *all
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setActiveTagFilter(tag === activeTagFilter ? null : tag)}
                  className={`cursor-pointer px-3 py-1 rounded-sm text-xs font-mono transition-colors ${activeTagFilter === tag ? 'bg-accent-3 text-background' : 'bg-surface border border-white/10 text-accent-4 hover:bg-accent-4 hover:text-background'}`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-text-secondary uppercase tracking-widest animate-pulse">
            Loading lattice...
          </div>
        ) : (
          /* Grid Layout: 1 column by default, 2 columns on massive screens */
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 items-start">
            {filteredHabits.map((habit) => (
              <div key={habit.id} className="w-full min-w-0 bg-surface p-6 rounded-sm border border-white/5 group hover:border-white/10 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1 mr-4">
                    {editingId === habit.id ? (
                      <form 
                        onSubmit={(e) => updateHabit(e, habit.id, habit.day_start_offset)} 
                        className="flex flex-wrap gap-2 mb-1"
                      >
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          className="flex-1 min-w-[150px] bg-background border-none text-text-primary px-2 py-1 text-xl font-bold uppercase tracking-tight rounded-sm focus:ring-1 focus:ring-accent-4 outline-none"
                        />
                        <input
                          type="text"
                          value={editTagsStr}
                          onChange={(e) => setEditTagsStr(e.target.value)}
                          placeholder="Tags (csv)"
                          className="flex-1 min-w-[100px] bg-background border-none text-accent-4 px-2 py-1 text-sm font-mono rounded-sm focus:ring-1 focus:ring-accent-4 outline-none"
                        />
                        <input
                          type="text"
                          value={editUnit}
                          onChange={(e) => setEditUnit(e.target.value)}
                          placeholder="Unit"
                          className="w-20 bg-background border-none text-text-primary px-2 py-1 text-sm rounded-sm focus:ring-1 focus:ring-accent-4 outline-none"
                        />
                        <button
                          type="submit"
                          className="cursor-pointer bg-accent-3 text-background px-3 rounded-sm text-xs font-bold uppercase hover:bg-accent-4 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="cursor-pointer bg-text-secondary/20 text-text-primary px-3 rounded-sm text-xs font-bold uppercase hover:bg-text-secondary/40 transition-colors"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div>
                        <h2 
                          className="text-xl font-bold uppercase tracking-tight cursor-pointer hover:text-accent-3 transition-colors flex flex-wrap items-center gap-2"
                          onClick={() => startEditing(habit)}
                          title="Click to edit"
                        >
                          {habit.name}
                          {habit.measure_unit && <span className="text-xs font-normal text-text-secondary normal-case tracking-normal">[{habit.measure_unit}]</span>}
                          
                          {/* Display Tags */}
                          {(habit.tags || []).map(t => (
                            <span key={t} className="text-[10px] font-mono bg-accent-4/10 text-accent-4 px-2 py-0.5 rounded-sm normal-case tracking-normal border border-accent-4/20">
                              #{t}
                            </span>
                          ))}
                        </h2>
                      </div>
                    )}
                    <p className="text-text-secondary text-xs uppercase tracking-widest mt-2">
                      Current Streak: <span className="text-accent-4 font-bold">{habit.current_streak}</span>
                    </p>
                  </div>
                  
                  {/* Action Buttons & Check-in Form */}
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleCheckIn(habit.id)}
                        className={`cursor-pointer px-3 py-1 rounded-sm text-xs font-bold uppercase transition-colors ${
                          activeCheckIn === habit.id 
                          ? 'bg-accent-3 text-background hover:bg-accent-4' 
                          : 'bg-accent-1 text-accent-4 hover:bg-accent-3'
                        }`}
                      >
                        {activeCheckIn === habit.id ? 'Cancel' : 'Track'}
                      </button>
                      <button
                        onClick={() => confirmDelete(habit)}
                        className="cursor-pointer bg-red-900/20 hover:bg-red-900/50 text-red-500 px-3 py-1 rounded-sm text-xs font-bold uppercase transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Delete Habit"
                      >
                        Delete
                      </button>
                    </div>

                    {/* Inline Check-in Form */}
                    {activeCheckIn === habit.id && (
                      <form onSubmit={(e) => submitCheckIn(e, habit.id)} className="flex gap-2 bg-background p-2 rounded-sm border border-white/5 animate-in fade-in slide-in-from-top-2">
                        <input 
                          type="date" 
                          value={checkInDate}
                          onChange={(e) => setCheckInDate(e.target.value)}
                          className="bg-surface text-text-primary text-xs px-2 py-1 rounded-sm border-none outline-none focus:ring-1 focus:ring-accent-4"
                          required
                        />
                        <input 
                          type="number" 
                          min="1"
                          value={checkInValue}
                          onChange={(e) => setCheckInValue(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder={habit.measure_unit || 'Value'}
                          className="bg-surface text-text-primary text-xs px-2 py-1 rounded-sm border-none outline-none focus:ring-1 focus:ring-accent-4 w-16"
                          required
                        />
                        <button 
                          type="submit"
                          className="cursor-pointer bg-accent-4 text-background px-3 py-1 rounded-sm text-xs font-bold uppercase hover:bg-white transition-colors"
                        >
                          Save
                        </button>
                      </form>
                    )}
                  </div>

                </div>
                <HabitGrid completions={habit.completions || []} measureUnit={habit.measure_unit} />
              </div>
            ))}
            {filteredHabits.length === 0 && !loading && (
              <div className="text-center py-24 border-2 border-dashed border-white/5 rounded-sm col-span-full">
                <p className="text-text-secondary uppercase tracking-widest text-sm">No Habits Found</p>
              </div>
            )}
          </div>
        )}
        
        {/* We place the Insights Panel inside a dedicated container that spans all columns if necessary */}
        {showInsights && (
           <div className="w-full">
             <InsightsPanel insights={insights} onClose={() => setShowInsights(false)} />
           </div>
        )}
      </main>
      </div>
    </div>
  );
}

export default App;
