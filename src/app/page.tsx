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
  const [menu, setMenu] = useState<{toppings: string[], drinks: string[]}>({ toppings: [], drinks: [] });
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
    const { data } = await supabase.from('menu_options').select('*');
    if (data) {
      setMenu({
        toppings: data.filter(m => m.category === 'topping').map(m => m.label),
        drinks: data.filter(m => m.category === 'drink').map(m => m.label)
      });
    }
  }

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

              <div className="bg-red-950/10 p-6 rounded-[2.5rem] border-2 border-red-900/20 text-center">
                  <button onClick={async () => { if(confirm("Purge current event data?")) await supabase.from('pizza_orders').delete().eq('tournament_slug', slug); fetchOrders(); }} className="text-red-600 font-black uppercase text-xs tracking-[0.2em] flex items-center justify-center gap-2 mx-auto"><Trash2 size={16}/> Reset Event Data</button>
              </div>
            </div>
          )}

          {/* SEARCH BAR */}
          {(activeTab === 'door' || activeTab === 'counter') && (
            <div className="mb-6 relative group">
              <Search className="absolute left-6 top-5 text-red-600" size={24} />
              <input className="w-full p-5 pl-16 rounded-[2.5rem] border-4 border-slate-900 bg-[#161010] text-white text-xl shadow-2xl focus:border-amber-500 outline-none transition-all font-bold" placeholder="Search a smasher..." value={search} onChange={(e)=>setSearch(e.target.value)} />
            </div>
          )}

          {/* THE DOOR (CHECK-IN) */}
          {activeTab === 'door' && (
              <div className="space-y-3">
                  {filtered.map(o => (
                    <div key={o.id} className="bg-[#1a1111] p-5 rounded-[2rem] border-2 border-slate-900 flex justify-between items-center shadow-xl transition-all">
                      <div className="flex-1 cursor-pointer" onClick={() => { setEditingOrder(o); setIsModalOpen(true); }}>
                        <div className="font-black text-3xl leading-tight text-white hover:text-amber-400 italic tracking-tighter transition-colors">{stripPrefix(o.player_name)}</div>
                        <div className="text-xs font-black uppercase italic tracking-widest mt-2 flex items-center gap-2">
                          <span className="text-amber-500">{o.topping}</span>
                          <span className="text-red-600 bg-red-600/10 px-2 py-0.5 rounded border border-red-600/20">{o.slice_count} SLICES</span>
                          <span className="text-slate-600">{o.drink}</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => toggleStatus(o.id, 'is_paid', o.is_paid)} 
                        className={`ml-4 px-6 py-4 rounded-2xl font-black text-md shadow-2xl transition-all border-b-4 active:translate-y-1 active:border-b-0 ${o.is_paid ? 'bg-green-600 text-white border-green-800 scale-105 shadow-green-900/40' : 'bg-slate-800 text-slate-600 border-slate-950 opacity-40'}`}
                      >
                        {o.is_paid ? 'PAID' : 'CASH'}
                      </button>
                    </div>
                  ))}
              </div>
          )}

          {/* THE OVEN */}
          {activeTab === 'oven' && (
            <div className="space-y-6 animate-in zoom-in-95 duration-300">
              <div className="bg-[#1a1111] p-10 rounded-[3rem] border-t-8 border-red-600 shadow-2xl relative overflow-hidden">
                <div className="absolute top-4 right-6 opacity-5"><Utensils size={80}/></div>
                <h3 className="font-black text-amber-500 text-[10px] uppercase mb-10 tracking-[0.4em] border-b-2 border-amber-500/10 pb-4 italic text-center">Kitchen Tickets</h3>
                {Object.entries(toppingTally).map(([t, count]: any) => {
                  const totalSlices = count * 2;
                  const totalPizzas = Math.ceil(totalSlices / 8);
                  const extraSlices = (totalPizzas * 8) - totalSlices;
                  return (
                    <div key={t} className="flex justify-between items-center mb-10 last:mb-0">
                      <div>
                        <div className="text-3xl font-black text-white leading-none mb-1 italic tracking-tighter">{t}</div>
                        <div className="text-slate-500 font-black text-xl uppercase tracking-widest">{totalSlices} SLICES</div>
                      </div>
                      <div className="text-right">
                        <div className="text-amber-500 font-black text-5xl leading-none tracking-normal">{totalPizzas} <span className="text-[14px]">BOXES</span></div>
                        <div className="text-[12px] text-red-600 font-black uppercase mt-1">+{extraSlices} EXTRAS</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bg-[#1a1111] p-8 rounded-[3rem] border-t-8 border-amber-600 shadow-2xl">
                <h3 className="font-black text-amber-500 text-[10px] uppercase mb-6 tracking-[0.4em] border-b-2 border-amber-500/10 pb-4 italic text-center">Bar Inventory</h3>
                {Object.entries(drinkTally).map(([d, count]: any) => (
                  <div key={d} className="flex justify-between py-4 border-b border-slate-800 last:border-0 font-black text-3xl items-center">
                    <span className="text-slate-400 italic lowercase tracking-tighter">{d}</span> 
                    <span className="text-amber-500">x{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* THE COUNTER */}
          {activeTab === 'counter' && (
              <div className="space-y-5">
                  {filtered.filter(o => o.is_paid).map(o => (
                      <div key={o.id} className={`relative p-8 rounded-[2.5rem] flex justify-between items-center transition-all duration-500 overflow-hidden border-b-8
                        ${o.is_collected 
                          ? 'opacity-10 bg-black grayscale scale-95 border-transparent' 
                          : 'bg-[#1e1414] border-red-900 shadow-2xl ring-2 ring-white/5'
                        }`}
                      >
                        <div className="flex-1 z-10">
                          <div className="font-black text-4xl leading-none text-white mb-4 tracking-tighter italic drop-shadow-xl">{stripPrefix(o.player_name)}</div>
                          <div className="flex flex-col gap-1">
                            <div className="font-black text-amber-500 text-2xl uppercase tracking-tighter flex items-center gap-3">
                                {o.topping} <span className="text-slate-700 text-lg font-black">• {o.slice_count} SLICES</span>
                            </div>
                            <div className="text-slate-500 text-xl font-black italic mt-1 flex items-center gap-2 uppercase tracking-widest text-[14px]">
                                <span className="opacity-40">🥤</span> {o.drink} <span className="text-[10px] opacity-50 bg-slate-800 px-2 py-1 rounded-lg">x{o.drink_count}</span>
                            </div>
                          </div>
                        </div>
                        <button onClick={() => toggleStatus(o.id, 'is_collected', o.is_collected)} className={`px-12 py-10 rounded-[2.2rem] font-black text-2xl shadow-2xl transition-all active:scale-90 z-10 border-b-8
                          ${o.is_collected ? 'bg-slate-900 text-slate-800 border-transparent' : 'bg-gradient-to-br from-red-600 to-red-800 text-white border-red-950 shadow-red-950/40'}`}
                        >
                          {o.is_collected ? 'SERVED' : 'SERVE!'}
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
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-[#1e1515] w-full max-w-lg rounded-[2rem] p-8 border-x-8 border-red-900/50 shadow-[0_0_100px_rgba(211,47,47,0.15)] relative overflow-hidden">
            {/* Ticket Edge Decoration */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-red-700 opacity-50" style={{backgroundImage: 'radial-gradient(circle, transparent 70%, #1e1515 70%)', backgroundSize: '20px 20px'}}></div>
            
            <button onClick={() => { setIsModalOpen(false); setEditingOrder(null); }} className="absolute top-6 right-6 text-slate-700 hover:text-red-500 transition-colors"><X size={32}/></button>
            
            <h2 className="text-3xl font-black mb-8 uppercase italic text-amber-500 tracking-tighter">{editingOrder ? 'Edit Ticket' : 'New Ticket'}</h2>
            
            <form onSubmit={saveManualOrder} className="space-y-6">
              <div className="relative">
                 <label className="text-[10px] font-black text-red-800 uppercase tracking-widest absolute -top-2 left-4 bg-[#1e1515] px-2">Player Tag</label>
                 <input name="player_name" defaultValue={editingOrder?.player_name} placeholder="GamerTag" required className="w-full bg-black/40 p-5 rounded-xl text-2xl border-2 border-slate-900 text-white focus:border-amber-500 outline-none font-black italic shadow-inner" />
              </div>

              <div className="grid grid-cols-5 gap-4">
                <div className="col-span-3 relative">
                    <label className="text-[10px] font-black text-red-800 uppercase tracking-widest absolute -top-2 left-4 bg-[#1e1515] px-2">Topping</label>
                    <select name="topping" defaultValue={editingOrder?.topping || 'Pepperoni'} className="w-full bg-black/40 p-5 rounded-xl text-lg text-white border-2 border-slate-900 font-black italic appearance-none focus:border-amber-500">
                        {menu.toppings.map(t => <option key={t} value={t} className="bg-slate-900">{t}</option>)}
                    </select>
                </div>
                <div className="col-span-2 relative">
                    <label className="text-[10px] font-black text-red-800 uppercase tracking-widest absolute -top-2 left-4 bg-[#1e1515] px-2 flex items-center gap-1"><Hash size={10}/> Slices</label>
                    <input name="slice_count" type="number" defaultValue={editingOrder?.slice_count || 2} className="w-full bg-black/40 p-5 rounded-xl text-lg text-white border-2 border-slate-900 font-black focus:border-amber-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-5 gap-4">
                <div className="col-span-3 relative">
                    <label className="text-[10px] font-black text-red-800 uppercase tracking-widest absolute -top-2 left-4 bg-[#1e1515] px-2">Drink</label>
                    <select name="drink" defaultValue={editingOrder?.drink || 'Coke'} className="w-full bg-black/40 p-5 rounded-xl text-lg text-white border-2 border-slate-900 font-black italic appearance-none focus:border-amber-500">
                        {menu.drinks.map(d => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
                    </select>
                </div>
                <div className="col-span-2 relative">
                    <label className="text-[10px] font-black text-red-800 uppercase tracking-widest absolute -top-2 left-4 bg-[#1e1515] px-2 flex items-center gap-1"><Beer size={10}/> Qty</label>
                    <input name="drink_count" type="number" defaultValue={editingOrder?.drink_count || 1} className="w-full bg-black/40 p-5 rounded-xl text-lg text-white border-2 border-slate-900 font-black focus:border-amber-500 outline-none" />
                </div>
              </div>

              <button type="submit" className="w-full bg-red-700 text-white p-6 rounded-2xl font-black text-2xl mt-4 border-b-8 border-red-950 active:translate-y-2 active:border-b-0 transition-all shadow-xl flex items-center justify-center gap-3">
                <Save size={24}/> {editingOrder ? 'UPDATE TICKET' : 'PRINT TICKET'}
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