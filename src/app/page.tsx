'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';
import { 
  Upload, UserCheck, Pizza, CheckCircle2, Search, Plus, X, Save, Trash2, Settings2, Utensils, History, ChevronRight, Hash, Beer
} from 'lucide-react';

export default function PizzaApp() {
  // 1. Separate the "Active" slug (for fetching) from the "Input" slug (for typing)
  const [activeTab, setActiveTab] = useState('door');
  const [slug, setSlug] = useState(''); // The source of truth for Supabase
  const [inputSlug, setInputSlug] = useState(''); // The text inside the input box
  
  const [orders, setOrders] = useState<any[]>([]);
  const [menu, setMenu] = useState<{toppings: any[], drinks: any[]}>({ toppings: [], drinks: [] });
  const [newMenuLabel, setNewMenuLabel] = useState('');
  const [newMenuCategory, setNewMenuCategory] = useState('topping');
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);

  useEffect(() => {
    const savedSlug = localStorage.getItem('current_pizza_slug') || 'back-to-the-lab-again-39';
    const savedRecents = JSON.parse(localStorage.getItem('recent_pizza_slugs') || '["back-to-the-lab-again-39"]');
    
    // Set both states on load
    setSlug(savedSlug);
    setInputSlug(savedSlug);
    setRecentSlugs(savedRecents);
    fetchMenu();
  }, []);

  // This Effect now only runs when the "Active" slug changes (after you hit Enter/Confirm)
  useEffect(() => {
    if (!slug) return;
    
    // Explicitly pass the slug to avoid closure staleness
    fetchOrders(slug); 
    
    const channel = supabase.channel('pizza-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pizza_orders' }, () => fetchOrders(slug))
      .subscribe();
    return () => { supabase.removeChannel(channel) };
  }, [slug]);

  const confirmSlug = (targetSlug: string) => {
    if (!targetSlug) return;
    
    // Update the Active Slug (triggers the fetch)
    setSlug(targetSlug);
    // Sync the Input Slug (in case this came from a Recent button click)
    setInputSlug(targetSlug);
    
    localStorage.setItem('current_pizza_slug', targetSlug);
    if (!recentSlugs.includes(targetSlug)) {
        const newRecents = [targetSlug, ...recentSlugs.filter(s => s !== targetSlug)].slice(0, 5);
        setRecentSlugs(newRecents);
        localStorage.setItem('recent_pizza_slugs', JSON.stringify(newRecents));
    }
  };

  // Pass slug as argument to ensure we always fetch the right ID
  async function fetchOrders(currentSlug = slug) {
    const { data } = await supabase.from('pizza_orders')
        .select('*')
        .eq('tournament_slug', currentSlug)
        .order('player_name', { ascending: true });
    
    // Always update orders, even if empty (to clear previous event data)
    setOrders(data || []);
  }
  async function fetchMenu() {
    const { data } = await supabase.from('menu_options').select('*').order('label');
    if (data) {
      setMenu({
        toppings: data.filter(m => m.category === 'topping'),
        drinks: data.filter(m => m.category === 'drink')
      });
    }
  }

  // 3. ADD NEW FUNCTIONS
  const addMenuItem = async (e: any) => {
    e.preventDefault();
    if (!newMenuLabel) return;
    
    await supabase.from('menu_options').insert({ 
      category: newMenuCategory, 
      label: newMenuLabel 
    });
    
    setNewMenuLabel('');
    fetchMenu();
  };

  const deleteMenuItem = async (id: string) => {
    if (!confirm('Remove this item from the menu?')) return;
    await supabase.from('menu_options').delete().eq('id', id);
    fetchMenu();
  };

  const stripPrefix = (name: string) => {
    if (!name) return "";
    return name.includes('|') ? name.split('|')[1].trim() : name;
  };

  const handleUpload = (e: any) => {
    const file = e.target.files[0];
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        confirmSlug(slug);
        const newOrders = results.data.filter((row: any) => row['GamerTag']).map((row: any) => ({
            tournament_slug: slug,
            player_name: row['GamerTag'],
            topping: row['Pizza Deal Pre-order: Toppings'] || 'Cheese',
            drink: row['Pizza Deal: Drink'] || 'Iced Tea',
            slice_count: 2, drink_count: 1
        }));
        await supabase.from('pizza_orders').upsert(newOrders, { onConflict: 'tournament_slug,player_name' });
        setActiveTab('door');
      }
    });
  };

  const saveManualOrder = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      tournament_slug: slug,
      player_name: formData.get('player_name'),
      topping: formData.get('topping'),
      drink: formData.get('drink'),
      slice_count: Number(formData.get('slice_count')),
      drink_count: Number(formData.get('drink_count')),
      is_paid: editingOrder?.is_paid || false,
      is_collected: editingOrder?.is_collected || false
    };
    await supabase.from('pizza_orders').upsert([payload], { onConflict: 'tournament_slug,player_name' });
    setIsModalOpen(false);
    setEditingOrder(null);
  };

  const deleteOrder = async () => {
    if (!editingOrder || !editingOrder.id) return;
    
    if (confirm(`Remove ${editingOrder.player_name} from the list? \n\nThis cannot be undone.`)) {
      // 1. Delete from Supabase
      const { error } = await supabase.from('pizza_orders').delete().eq('id', editingOrder.id);
      
      if (!error) {
        // 2. Close modal
        setIsModalOpen(false);
        setEditingOrder(null);
        // 3. Refresh list (The realtime subscription will also catch this, but this is faster)
        fetchOrders(); 
      }
    }
  };

  const toggleStatus = async (id: string, field: string, current: boolean) => {
    await supabase.from('pizza_orders').update({ [field]: !current }).eq('id', id);
  };

  const paidOrders = orders.filter(o => o.is_paid);
  const toppingTally: any = {};
  paidOrders.forEach(o => { toppingTally[o.topping] = (toppingTally[o.topping] || 0) + (Number(o.slice_count) / 2); });
  const drinkTally: any = {};
  paidOrders.forEach(o => { drinkTally[o.drink] = (drinkTally[o.drink] || 0) + Number(o.drink_count); });
  const filtered = orders.filter(o => (o.player_name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-screen bg-[#0d0909] flex flex-col overflow-hidden text-slate-100 font-sans">
      <style jsx global>{` ::-webkit-scrollbar { display: none; } * { -ms-overflow-style: none; scrollbar-width: none; } `}</style>

      {/* HEADER */}
      <header className="bg-red-700 p-6 text-white flex-none flex justify-between items-center shadow-[0_4px_30px_rgba(0,0,0,0.6)] border-b-4 border-amber-600 overflow-hidden relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%, #fff), linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%, #fff)`, backgroundSize: '20px 20px', backgroundPosition: '0 0, 10px 10px' }}></div>
        <div className="z-10 flex items-center gap-3">
            <Pizza className="text-amber-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" size={32} />
            <h1 className="font-black text-2xl uppercase tracking-tighter italic drop-shadow-lg">
                {activeTab === 'door' ? "The Door" : activeTab === 'oven' ? "The Oven" : activeTab === 'counter' ? "The Counter" : "Prep Station"}
            </h1>
        </div>
        <div className="bg-black/40 px-4 py-1 rounded-full text-lg font-black border-2 border-amber-500/30 z-10 text-amber-400 italic">
            {paidOrders.length} <span className="text-[10px] uppercase ml-1">Paid</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto pb-24">
          
          {/* PREP STATION */}
          {activeTab === 'prep' && (
            <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
              <div className="bg-[#1a1111] p-6 rounded-[2.5rem] border-t-8 border-red-600 shadow-2xl">
                <h2 className="text-lg font-black mb-4 flex items-center gap-2 text-amber-500 uppercase italic"><History size={20}/> Quick Access</h2>
                <div className="flex flex-wrap gap-2 mb-6">
                    {recentSlugs.map(s => (
                        <button key={s} 
                            // Update: Calling confirmSlug handles everything
                            onClick={()=>confirmSlug(s)} 
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase italic border-2 transition-all ${slug === s ? 'bg-amber-500 text-black border-amber-500 scale-105' : 'bg-black/40 text-slate-500 border-slate-800'}`}>
                            {s.split('-').slice(-1)}
                        </button>
                    ))}
                </div>

                <h2 className="text-lg font-black mb-4 flex items-center gap-2 text-amber-500 uppercase italic">Tournament Slug</h2>
                <div className="flex gap-2 mb-4">
                    {/* Update: Bind to inputSlug, confirm on Enter */}
                    <input 
                        className="flex-1 bg-black/40 border-2 border-slate-800 p-4 rounded-xl text-white text-lg font-bold outline-none focus:border-amber-500 transition-colors" 
                        value={inputSlug} 
                        onChange={(e)=>setInputSlug(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && confirmSlug(inputSlug)} 
                        placeholder="e.g. weekly-smash-40" 
                    />
                    <button onClick={() => confirmSlug(inputSlug)} className="bg-amber-500 text-black px-4 rounded-xl font-black shadow-lg shadow-amber-500/10"><ChevronRight /></button>
                </div>
                
                <label className="block w-full bg-red-600/5 border-4 border-dashed border-red-600/20 p-8 rounded-[2rem] text-center hover:bg-red-600/10 cursor-pointer group transition-all">
                  <Upload className="mx-auto mb-2 text-red-500 group-hover:scale-110 transition-transform" size={40} />
                  <span className="text-red-500 font-black text-lg uppercase italic">Drop start.gg CSV</span>
                  <input type="file" accept=".csv" className="hidden" onChange={handleUpload} />
                </label>
              </div>
              
              <div className="bg-[#1a1111] p-6 sm:p-8 rounded-[2rem] border-t-8 border-amber-600 shadow-2xl mt-6">
                <h2 className="text-lg font-black mb-6 flex items-center gap-2 text-amber-500 uppercase italic">
                  <Settings2 size={20}/> Menu Config
                </h2>

                {/* ADD NEW ITEM FORM */}
                <form onSubmit={addMenuItem} className="flex flex-col sm:flex-row gap-3 mb-8">
                  <select 
                    value={newMenuCategory} 
                    onChange={(e) => setNewMenuCategory(e.target.value)}
                    className="bg-black/40 border-2 border-slate-800 p-3 rounded-xl text-white font-bold outline-none focus:border-amber-500"
                  >
                    <option value="topping">Topping</option>
                    <option value="drink">Drink</option>
                  </select>
                  
                  <input 
                    className="flex-1 bg-black/40 border-2 border-slate-800 p-3 rounded-xl text-white font-bold outline-none focus:border-amber-500 placeholder:text-slate-700 italic" 
                    placeholder="New item name..." 
                    value={newMenuLabel}
                    onChange={(e) => setNewMenuLabel(e.target.value)}
                  />
                  
                  <button type="submit" className="bg-amber-500 text-black px-6 py-3 rounded-xl font-black uppercase shadow-lg hover:scale-105 transition-transform">
                    Add
                  </button>
                </form>

                {/* LIST ITEMS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  
                  {/* TOPPINGS LIST */}
                  <div>
                    <h3 className="text-red-500 font-black uppercase text-xs tracking-widest mb-3 border-b border-red-900/30 pb-2">Toppings</h3>
                    <div className="space-y-2">
                      {menu.toppings.map(item => (
                        <div key={item.id} className="flex justify-between items-center group">
                          <span className="font-bold text-slate-300 italic">{item.label}</span>
                          <button onClick={() => deleteMenuItem(item.id)} className="text-slate-700 hover:text-red-500 transition-colors opacity-50 group-hover:opacity-100">
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* DRINKS LIST */}
                  <div>
                    <h3 className="text-amber-500 font-black uppercase text-xs tracking-widest mb-3 border-b border-amber-900/30 pb-2">Drinks</h3>
                    <div className="space-y-2">
                      {menu.drinks.map(item => (
                        <div key={item.id} className="flex justify-between items-center group">
                          <span className="font-bold text-slate-300 italic">{item.label}</span>
                          <button onClick={() => deleteMenuItem(item.id)} className="text-slate-700 hover:text-red-500 transition-colors opacity-50 group-hover:opacity-100">
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-red-950/10 p-6 rounded-[2.5rem] border-2 border-red-900/20 text-center">
                  <button onClick={async () => { if(confirm("Purge current event data?")) await supabase.from('pizza_orders').delete().eq('tournament_slug', slug); fetchOrders(); }} className="text-red-600 font-black uppercase text-xs tracking-[0.2em] flex items-center justify-center gap-2 mx-auto"><Trash2 size={16}/> Reset Event Data</button>
              </div>
            </div>
          )}

          {/* SEARCH BAR */}
          {(activeTab === 'door' || activeTab === 'counter') && (
          <div className="mb-4 sm:mb-6 relative group">
              <Search className="absolute left-5 top-4 sm:left-6 sm:top-5 text-red-600" size={20} />
              <input 
                  className="w-full p-4 pl-12 sm:p-5 sm:pl-16 rounded-[2rem] sm:rounded-[2.5rem] border-4 border-slate-900 bg-[#161010] text-white text-lg sm:text-xl shadow-2xl focus:border-amber-500 outline-none transition-all font-bold" 
                  placeholder="Search..." 
                  value={search} 
                  onChange={(e)=>setSearch(e.target.value)} 
              />
          </div>
          )}

          {/* THE DOOR (CHECK-IN) */}
            {activeTab === 'door' && (
                <div className="space-y-3 pb-32">
                    {filtered.map(o => (
                    <div key={o.id} className="bg-[#1a1111] p-4 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] border-2 border-slate-900 flex justify-between items-center shadow-xl transition-all">
                        <div className="flex-1 cursor-pointer min-w-0 pr-4" onClick={() => { setEditingOrder(o); setIsModalOpen(true); }}>
                        
                        {/* Player Name */}
                        <div className="font-black text-xl sm:text-3xl leading-tight text-white hover:text-amber-400 italic tracking-tighter transition-colors truncate mb-2">
                            {stripPrefix(o.player_name)}
                        </div>

                        {/* New "Count: Item" Layout */}
                        <div className="flex flex-wrap items-center gap-2">
                            
                            {/* Pizza Badge */}
                            <div className="flex items-center gap-2 bg-red-950/30 px-3 py-1.5 rounded-lg border border-red-900/30">
                                <span className="text-lg">🍕</span>
                                <div className="text-[10px] sm:text-xs font-black uppercase italic tracking-wider text-amber-500">
                                    <span className="text-white text-sm sm:text-base mr-0.5">{o.slice_count}</span>: {o.topping}
                                </div>
                            </div>

                            {/* Drink Badge */}
                            <div className="flex items-center gap-2 bg-slate-800/40 px-3 py-1.5 rounded-lg border border-slate-700/30">
                                <span className="text-lg">🥤</span>
                                <div className="text-[10px] sm:text-xs font-black uppercase italic tracking-wider text-slate-400">
                                    <span className="text-white text-sm sm:text-base mr-0.5">{o.drink_count}</span>: {o.drink}
                                </div>
                            </div>

                        </div>
                        </div>

                        {/* Paid/Cash Button */}
                        <button 
                        onClick={() => toggleStatus(o.id, 'is_paid', o.is_paid)} 
                        className={`shrink-0 px-4 py-3 sm:px-6 sm:py-4 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm shadow-2xl transition-all border-b-4 active:translate-y-1 active:border-b-0 
                            ${o.is_paid 
                                ? 'bg-green-600 text-white border-green-800 scale-105 shadow-green-900/40' 
                                : 'bg-slate-800 text-slate-600 border-slate-950 opacity-40'}`}
                        >
                        {o.is_paid ? 'PAID' : 'CASH'}
                        </button>
                    </div>
                    ))}
                </div>
            )}

          {/* THE OVEN (KITCHEN MATH) - STRICT HALVES COMPACTOR */}
          {activeTab === 'oven' && (() => {
            // 1. Calculate how many "Sides" (4-slice halves) each topping needs
            // Each order is 2 slices. A side is 4 slices.
            const toppingSides: { topping: string, type: 'FULL' | 'PARTIAL' }[] = [];
            
            const counts: Record<string, number> = {};
            paidOrders.forEach(o => { counts[o.topping] = (counts[o.topping] || 0) + Number(o.slice_count); });

            Object.entries(counts).forEach(([topping, totalSlices]) => {
              let slicesLeft = totalSlices;
              
              while (slicesLeft >= 4) {
                toppingSides.push({ topping, type: 'FULL' });
                slicesLeft -= 4;
              }
              if (slicesLeft > 0) {
                toppingSides.push({ topping, type: 'PARTIAL' });
              }
            });

            // 2. Pack the Sides into Boxes (2 sides per box)
            const boxes: { sideA: any, sideB: any }[] = [];
            let pool = [...toppingSides];

            // STRATEGY: Try to keep the same topping in the same box first
            const uniqueToppings = [...new Set(pool.map(s => s.topping))];
            
            uniqueToppings.forEach(t => {
              const matchingSides = pool.filter(s => s.topping === t);
              // If a topping has 2 sides (e.g. 3 orders = 1 Full + 1 Partial), put them together
              while (matchingSides.length >= 2) {
                const sA = matchingSides.shift()!;
                const sB = matchingSides.shift()!;
                boxes.push({ sideA: sA, sideB: sB });
                // Remove from main pool
                pool.splice(pool.indexOf(sA), 1);
                pool.splice(pool.indexOf(sB), 1);
              }
            });

            // 3. Pair remaining different toppings into boxes
            while (pool.length > 0) {
              const sideA = pool.shift()!;
              const sideB = pool.shift() || null; // Might be empty if total sides are odd
              boxes.push({ sideA, sideB });
            }

            return (
              <div className="space-y-6 animate-in zoom-in-95 duration-300 pb-32">
                <div className="bg-[#1a1111] p-8 rounded-[3rem] border-t-8 border-red-600 shadow-2xl">
                  <h3 className="font-black text-amber-500 text-[10px] uppercase mb-8 tracking-[0.4em] border-b-2 border-amber-500/10 pb-4 italic text-center">Shop Call List</h3>
                  
                  <div className="space-y-6">
                    {boxes.map((box, i) => {
                      const isWhole = box.sideB && box.sideA.topping === box.sideB.topping && box.sideA.type === 'FULL' && box.sideB.type === 'FULL';
                      const is75Percent = box.sideB && box.sideA.topping === box.sideB.topping && box.sideB.type === 'PARTIAL';
                      
                      return (
                        <div key={i} className={`bg-black/20 p-6 rounded-[2rem] border-l-8 shadow-xl transition-all ${isWhole ? 'border-green-600' : 'border-amber-600'}`}>
                          <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest italic">Pizza #{i+1}</span>
                            {isWhole && <span className="text-green-500 font-black text-[10px] uppercase italic">100% Full</span>}
                            {is75Percent && <span className="text-blue-400 font-black text-[10px] uppercase italic">75% {box.sideA.topping}</span>}
                          </div>

                          <div className="space-y-4">
                            {/* SIDE A */}
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="text-[8px] font-black text-slate-600 uppercase mb-1">Side A (50%)</div>
                                <div className="text-2xl font-black text-white uppercase italic tracking-tighter">{box.sideA.topping}</div>
                              </div>
                              {box.sideA.type === 'PARTIAL' && <span className="bg-red-900/30 text-red-500 text-[9px] font-black px-2 py-1 rounded border border-red-500/20">2 EMPTY SLICES</span>}
                            </div>

                            <div className="h-[1px] bg-white/5 w-full"></div>

                            {/* SIDE B */}
                            <div className="flex justify-between items-center">
                              {box.sideB ? (
                                <>
                                  <div>
                                    <div className="text-[8px] font-black text-slate-600 uppercase mb-1">Side B (50%)</div>
                                    <div className="text-2xl font-black text-white uppercase italic tracking-tighter">{box.sideB.topping}</div>
                                  </div>
                                  {box.sideB.type === 'PARTIAL' && <span className="bg-red-900/30 text-red-500 text-[9px] font-black px-2 py-1 rounded border border-red-500/20">2 EMPTY SLICES</span>}
                                </>
                              ) : (
                                <div className="py-2">
                                  <div className="text-[8px] font-black text-slate-800 uppercase mb-1">Side B</div>
                                  <div className="text-2xl font-black text-slate-800 uppercase italic">--- EMPTY ---</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {boxes.length === 0 && (
                      <div className="text-center py-20 opacity-20 italic font-black uppercase tracking-widest">No paid orders yet</div>
                    )}
                  </div>
                </div>

                {/* DRINK TALLY */}
                <div className="bg-[#1a1111] p-8 rounded-[3rem] border-t-8 border-amber-600 shadow-2xl">
                  <h3 className="font-black text-amber-500 text-[10px] uppercase mb-6 tracking-[0.4em] border-b-2 border-amber-500/10 pb-4 italic text-center">Drink Inventory</h3>
                  {Object.entries(drinkTally).map(([d, count]: any) => (
                    <div key={d} className="flex justify-between py-4 border-b border-slate-800 last:border-0 font-black text-3xl items-center">
                      <span className="text-slate-400 italic lowercase tracking-tighter truncate pr-4">{d}</span> 
                      <span className="text-amber-500">x{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}


          {/* THE COUNTER */}
            {activeTab === 'counter' && (
                <div className="space-y-4 pb-32"> {/* Added pb-32 so you can scroll past the FAB */}
                    {filtered.filter(o => o.is_paid).map(o => (
                        <div key={o.id} className={`relative p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] flex justify-between items-center gap-3 transition-all duration-500 overflow-hidden border-b-8
                        ${o.is_collected 
                            ? 'opacity-10 bg-black grayscale scale-95 border-transparent' 
                            : 'bg-[#1e1414] border-red-900 shadow-2xl ring-2 ring-white/5'
                        }`}
                        >
                        <div className="flex-1 z-10 min-w-0"> {/* min-w-0 fixes text overflow issues */}
                            <div className="font-black text-2xl sm:text-4xl leading-tight text-white mb-2 sm:mb-4 tracking-tighter italic drop-shadow-xl break-words">
                                {stripPrefix(o.player_name)}
                            </div>
                            <div className="flex flex-col gap-0.5 sm:gap-1">
                            <div className="font-black text-amber-500 text-lg sm:text-2xl uppercase tracking-tighter flex flex-wrap items-center gap-2">
                                {o.topping} <span className="text-slate-700 text-sm sm:text-lg font-black whitespace-nowrap">• {o.slice_count} SLICES</span>
                            </div>
                            <div className="text-slate-500 text-sm sm:text-xl font-black italic mt-1 flex items-center gap-2 uppercase tracking-widest">
                                <span className="opacity-40">🥤</span> {o.drink} <span className="text-[10px] opacity-50 bg-slate-800 px-2 py-1 rounded-lg">x{o.drink_count}</span>
                            </div>
                            </div>
                        </div>
                        <button onClick={() => toggleStatus(o.id, 'is_collected', o.is_collected)} className={`shrink-0 px-6 py-6 sm:px-12 sm:py-10 rounded-2xl sm:rounded-[2.2rem] font-black text-lg sm:text-2xl shadow-2xl transition-all active:scale-90 z-10 border-b-4 sm:border-b-8
                            ${o.is_collected ? 'bg-slate-900 text-slate-800 border-transparent' : 'bg-gradient-to-br from-red-600 to-red-800 text-white border-red-950 shadow-red-950/40'}`}
                        >
                            {o.is_collected ? 'DONE' : 'SERVE!'}
                        </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </main>

      {/* PIZZA ADD BUTTON */}
      <button onClick={() => { setEditingOrder(null); setIsModalOpen(true); }} className="fixed right-6 bottom-36 bg-gradient-to-t from-amber-600 to-amber-400 text-red-950 p-6 rounded-full shadow-[0_15px_50px_rgba(245,158,11,0.3)] active:scale-75 transition-all z-30 border-4 border-[#0d0909]">
        <Plus size={36} strokeWidth={4} />
      </button>

      {/* NEW PIZZA TICKET MODAL */}
        {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
            {/* Changed p-8 to p-6 for mobile */}
            <div className="bg-[#1e1515] w-full max-w-lg rounded-[2rem] p-6 sm:p-8 border-x-8 border-red-900/50 shadow-[0_0_100px_rgba(211,47,47,0.15)] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-2 bg-red-700 opacity-50" style={{backgroundImage: 'radial-gradient(circle, transparent 70%, #1e1515 70%)', backgroundSize: '20px 20px'}}></div>
            
            <button onClick={() => { setIsModalOpen(false); setEditingOrder(null); }} className="absolute top-4 right-4 sm:top-6 sm:right-6 text-slate-700 hover:text-red-500 transition-colors"><X size={28} /></button>
            
            <h2 className="text-2xl sm:text-3xl font-black mb-6 sm:mb-8 uppercase italic text-amber-500 tracking-tighter">{editingOrder ? 'Edit Ticket' : 'New Ticket'}</h2>
            
            <form onSubmit={saveManualOrder} className="space-y-5 sm:space-y-6">
                <div className="relative">
                    <label className="text-[10px] font-black text-red-800 uppercase tracking-widest absolute -top-2 left-4 bg-[#1e1515] px-2">Player Tag</label>
                    {/* Reduced text size for inputs on mobile */}
                    <input name="player_name" defaultValue={editingOrder?.player_name} placeholder="GamerTag" required className="w-full bg-black/40 p-4 sm:p-5 rounded-xl text-xl sm:text-2xl border-2 border-slate-900 text-white focus:border-amber-500 outline-none font-black italic shadow-inner" />
                </div>
                <div className="flex flex-col gap-3 mt-6">
                  {/* SAVE BUTTON */}
                  <button type="submit" className="w-full bg-red-700 text-white p-5 sm:p-6 rounded-2xl font-black text-xl sm:text-2xl border-b-8 border-red-950 active:translate-y-2 active:border-b-0 transition-all shadow-xl flex items-center justify-center gap-3 hover:bg-red-600">
                    <Save size={24}/> {editingOrder ? 'UPDATE TICKET' : 'PRINT TICKET'}
                  </button>

                  {/* DELETE BUTTON - Only show if editing an existing order */}
                  {editingOrder && (
                    <button 
                      type="button" // Important! Prevents form submission
                      onClick={deleteOrder}
                      className="w-full bg-black/20 text-red-500/50 p-4 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-red-950/30 hover:text-red-500 transition-all flex items-center justify-center gap-2 border-2 border-transparent hover:border-red-900/30"
                    >
                      <Trash2 size={16} /> Delete Ticket
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-3 sm:gap-4">
                <div className="col-span-3 relative">
                    <label className="text-[10px] font-black text-red-800 uppercase tracking-widest absolute -top-2 left-4 bg-[#1e1515] px-2">Topping</label>
                    <select name="topping" defaultValue={editingOrder?.topping || 'Pepperoni'} className="w-full bg-black/40 p-4 sm:p-5 rounded-xl text-md sm:text-lg text-white border-2 border-slate-900 font-black italic appearance-none focus:border-amber-500">
                           {menu.toppings.map(t => (
                              <option key={t.id} value={t.label} className="bg-slate-900">{t.label}</option>
                          ))}
                    </select>
                </div>
                <div className="col-span-2 relative">
                    <label className="text-[10px] font-black text-red-800 uppercase tracking-widest absolute -top-2 left-4 bg-[#1e1515] px-2 flex items-center gap-1"><Hash size={10}/> Slices</label>
                    <input name="slice_count" type="number" defaultValue={editingOrder?.slice_count || 2} className="w-full bg-black/40 p-4 sm:p-5 rounded-xl text-md sm:text-lg text-white border-2 border-slate-900 font-black focus:border-amber-500 outline-none" />
                </div>
                </div>

                <div className="grid grid-cols-5 gap-3 sm:gap-4">
                <div className="col-span-3 relative">
                    <label className="text-[10px] font-black text-red-800 uppercase tracking-widest absolute -top-2 left-4 bg-[#1e1515] px-2">Drink</label>
                    <select name="drink" defaultValue={editingOrder?.drink || 'Coke'} className="w-full bg-black/40 p-4 sm:p-5 rounded-xl text-md sm:text-lg text-white border-2 border-slate-900 font-black italic appearance-none focus:border-amber-500">
                        {menu.drinks.map(d => (
                            <option key={d.id} value={d.label} className="bg-slate-900">{d.label}</option>
                        ))}
                    </select>
                </div>
                <div className="col-span-2 relative">
                    <label className="text-[10px] font-black text-red-800 uppercase tracking-widest absolute -top-2 left-4 bg-[#1e1515] px-2 flex items-center gap-1"><Beer size={10}/> Qty</label>
                    <input name="drink_count" type="number" defaultValue={editingOrder?.drink_count || 1} className="w-full bg-black/40 p-4 sm:p-5 rounded-xl text-md sm:text-lg text-white border-2 border-slate-900 font-black focus:border-amber-500 outline-none" />
                </div>
                </div>

                <button type="submit" className="w-full bg-red-700 text-white p-5 sm:p-6 rounded-2xl font-black text-xl sm:text-2xl mt-4 border-b-8 border-red-950 active:translate-y-2 active:border-b-0 transition-all shadow-xl flex items-center justify-center gap-3">
                <Save size={24}/> {editingOrder ? 'UPDATE' : 'PRINT'}
                </button>
            </form>
            </div>
        </div>
        )}

      {/* FOOTER NAV */}
      <nav className="flex-none bg-black/80 backdrop-blur-3xl border-t-4 border-slate-900 flex justify-around p-4 pb-12 z-40">
        <NavBtn icon={<Settings2 size={28}/>} active={activeTab==='prep'} onClick={()=>setActiveTab('prep')} label="Prep" />
        <NavBtn icon={<UserCheck size={28}/>} active={activeTab==='door'} onClick={()=>setActiveTab('door')} label="Door" />
        <NavBtn icon={<Pizza size={28}/>} active={activeTab==='oven'} onClick={()=>setActiveTab('oven')} label="Oven" />
        <NavBtn icon={<CheckCircle2 size={28}/>} active={activeTab==='counter'} onClick={()=>setActiveTab('counter')} label="Food" />
      </nav>
    </div>
  );
}

function NavBtn({icon, active, onClick, label}: any) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all duration-300 ${active ? 'text-amber-500 scale-125 -translate-y-2' : 'text-slate-800'}`}>
      <div className={`p-1 rounded-lg ${active ? 'bg-amber-500/10' : ''}`}>{icon}</div>
      <span className={`text-[9px] font-black uppercase tracking-[0.2em] italic ${active ? 'opacity-100' : 'opacity-100 text-slate-800'}`}>{label}</span>
    </button>
  );
}