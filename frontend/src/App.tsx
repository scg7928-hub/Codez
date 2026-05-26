import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  useListCodes, useCreateCode, useDeleteCode,
  useListStaff, useCreateStaff, useDeleteStaff, useUpdateStaff, useStaffLogin,
  useListTasks, useCreateTask, useUpdateTask, useDeleteTask,
  useListLeaves, useCreateLeave, useUpdateLeave,
  useGetStats,
  getListCodesQueryKey, getListStaffQueryKey, getListTasksQueryKey,
  getListLeavesQueryKey, getGetStatsQueryKey,
} from "@workspace/api-client-react";
import type { StaffMember } from "@workspace/api-client-react";
import { DISCORD_URL, OWNER_PASSWORD } from "./config.js";

const queryClient = new QueryClient();

const ROLES = ["Trainee","Staff","Mod","Senior Mod","Admin","Senior Admin","Manager","Developer"] as const;

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Trainee:       { bg:"bg-slate-500/15", text:"text-slate-300",  border:"border-slate-500/30" },
  Staff:         { bg:"bg-blue-500/15",  text:"text-blue-300",   border:"border-blue-500/30" },
  Mod:           { bg:"bg-cyan-500/15",  text:"text-cyan-300",   border:"border-cyan-500/30" },
  "Senior Mod":  { bg:"bg-teal-500/15",  text:"text-teal-300",   border:"border-teal-500/30" },
  Admin:         { bg:"bg-orange-500/15",text:"text-orange-300", border:"border-orange-500/30" },
  "Senior Admin":{ bg:"bg-red-500/15",   text:"text-red-300",    border:"border-red-500/30" },
  Manager:       { bg:"bg-purple-500/15",text:"text-purple-300", border:"border-purple-500/30" },
  Developer:     { bg:"bg-primary/20",   text:"text-primary",    border:"border-primary/40" },
};

const LOG_META: Record<string, { icon: string; color: string }> = {
  staff_added:          { icon:"👤", color:"text-blue-400" },
  staff_removed:        { icon:"🚫", color:"text-red-400" },
  role_changed:         { icon:"🔄", color:"text-purple-400" },
  task_assigned:        { icon:"📋", color:"text-yellow-400" },
  task_completed:       { icon:"✅", color:"text-green-400" },
  task_failed:          { icon:"❌", color:"text-red-400" },
  task_deleted:         { icon:"🗑",  color:"text-muted-foreground" },
  warning_issued:       { icon:"⚠️", color:"text-orange-400" },
  warning_cleared:      { icon:"🟢", color:"text-green-400" },
  leave_requested:      { icon:"🏖️", color:"text-blue-400" },
  leave_approved:       { icon:"✅", color:"text-green-400" },
  leave_denied:         { icon:"❌", color:"text-red-400" },
  promo_requested:      { icon:"⬆️", color:"text-yellow-400" },
  promo_approved:       { icon:"🎉", color:"text-green-400" },
  promo_denied:         { icon:"❌", color:"text-red-400" },
  code_added:           { icon:"📦", color:"text-primary" },
  code_removed:         { icon:"🗑",  color:"text-muted-foreground" },
  announcement_posted:  { icon:"📢", color:"text-primary" },
  announcement_deleted: { icon:"🗑",  color:"text-muted-foreground" },
};

type StaffFull = StaffMember & { warnings: number; notes: string | null };
type Announcement = { id:number; type:string; title:string; content:string; pinned:string; createdAt:string };
type PromotionRequest = { id:number; staffId:number; staffUsername:string; currentRole:string; requestedRole:string; reason:string; status:string; createdAt:string; reviewedAt:string|null };
type ActivityLog = { id:number; type:string; description:string; staffId:number|null; staffUsername:string|null; createdAt:string };

const API = "/api";

/* ── Custom hooks ─────────────────────────────────────────────────────────── */
const useFetch = <T,>(key: unknown[], url: string) =>
  useQuery<T>({ queryKey: key, queryFn: () => fetch(url).then(r => r.json()) });

const usePost = <T, B>(url: string) =>
  useMutation<T, Error, B>({ mutationFn: (body: B) => fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); return d; }) });

function useAnnouncements(type?: "public"|"staff") {
  return useFetch<Announcement[]>(["announcements", type??"all"], `${API}/announcements${type?`?type=${type}`:""}`);
}
function useCreateAnn() {
  return useMutation({ mutationFn: (b: {type:string;title:string;content:string;pinned:boolean}) => fetch(`${API}/announcements`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).then(r=>r.json()) });
}
function useDeleteAnn() {
  return useMutation({ mutationFn: (id:number) => fetch(`${API}/announcements/${id}`,{method:"DELETE"}).then(r=>r.json()) });
}
function usePromotions(staffId?: number) {
  return useFetch<PromotionRequest[]>(["promotions", staffId??"all"], `${API}/promotion-requests${staffId?`?staffId=${staffId}`:""}`);
}
function useCreatePromo() {
  return usePost<PromotionRequest,{staffId:number;staffUsername:string;currentRole:string;requestedRole:string;reason:string}>(`${API}/promotion-requests`);
}
function useUpdatePromo() {
  return useMutation({ mutationFn: ({id,status}:{id:number;status:string}) => fetch(`${API}/promotion-requests/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})}).then(r=>r.json()) });
}
function useActivityLogs(type?:string) {
  return useFetch<ActivityLog[]>(["activity-logs", type??"all"], `${API}/activity-logs?limit=200${type&&type!=="all"?`&type=${type}`:""}`);
}
function useWarnStaff() { return useMutation({ mutationFn:(id:number)=>fetch(`${API}/staff/${id}/warn`,{method:"POST"}).then(r=>r.json()) }); }
function useClearWarn() { return useMutation({ mutationFn:(id:number)=>fetch(`${API}/staff/${id}/warn`,{method:"DELETE"}).then(r=>r.json()) }); }
function useClearAllWarns() { return useMutation({ mutationFn:(id:number)=>fetch(`${API}/staff/${id}/warnings`,{method:"DELETE"}).then(r=>r.json()) }); }
function useSaveNotes() { return useMutation({ mutationFn:({id,notes}:{id:number;notes:string})=>fetch(`${API}/staff/${id}/notes`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes})}).then(r=>r.json()) }); }

/* ── Shared primitives ───────────────────────────────────────────────────── */
const inputCls = "px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/40 transition-all";

function Btn({ variant="primary", className="", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:"primary"|"ghost"|"danger"|"outline"|"warn"}) {
  const base = "px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed";
  const v={primary:"bg-primary text-white hover:bg-primary/90 shadow-primary/20 shadow",ghost:"border border-white/10 text-muted-foreground hover:bg-white/5",danger:"bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20",outline:"border border-white/10 text-foreground hover:bg-white/5",warn:"bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20"};
  return <button {...p} className={`${base} ${v[variant]} ${className}`}/>;
}
function GCard({ children, className="", accent=false }:{children:React.ReactNode;className?:string;accent?:boolean}) {
  return <div className={`rounded-2xl border ${accent?"bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20":"bg-gradient-to-br from-white/5 to-transparent border-white/8"} ${className}`}>{children}</div>;
}
function RoleBadge({role}:{role:string}) {
  const c=ROLE_COLORS[role]||{bg:"bg-muted",text:"text-muted-foreground",border:"border-border"};
  return <span className={`inline-flex items-center px-2.5 py-0.5 text-xs rounded-full border font-bold tracking-wide ${c.bg} ${c.text} ${c.border}`}>{role}</span>;
}
function WarnBadge({count}:{count:number}) {
  if(!count) return null;
  const s=count>=3?"bg-red-500 text-white animate-pulse shadow-red-500/40 shadow-md":count===2?"bg-orange-500 text-white shadow-orange-500/30 shadow":"bg-yellow-500 text-black shadow-yellow-500/20 shadow";
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-black ${s}`}>⚠️ {count}</span>;
}
function StatusBadge({status}:{status:string}) {
  const m:Record<string,string>={pending:"bg-yellow-500/15 text-yellow-300 border-yellow-500/30",done:"bg-green-500/15 text-green-300 border-green-500/30",failed:"bg-red-500/15 text-red-300 border-red-500/30",approved:"bg-green-500/15 text-green-300 border-green-500/30",denied:"bg-red-500/15 text-red-300 border-red-500/30"};
  return <span className={`px-2 py-0.5 text-xs rounded-full border font-semibold capitalize ${m[status]||"bg-muted text-muted-foreground border-border"}`}>{status}</span>;
}
function CopyBtn({text}:{text:string}) {
  const [ok,setOk]=useState(false);
  return <button onClick={()=>{navigator.clipboard.writeText(text).then(()=>{setOk(true);setTimeout(()=>setOk(false),2000)})}} className={`absolute top-2 right-2 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${ok?"bg-green-500/20 text-green-400 border-green-500/40":"bg-black/30 text-muted-foreground border-border hover:bg-primary/20 hover:text-primary hover:border-primary/40"}`}>{ok?"✓ Copied":"Copy"}</button>;
}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="bg-[#0f0f17] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors text-sm">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function AnnCard({ann,onDelete}:{ann:Announcement;onDelete?:(id:number)=>void}) {
  const pin=ann.pinned==="true";
  return (
    <div className={`p-4 rounded-xl border transition-all ${pin?"bg-primary/8 border-primary/30":"bg-white/3 border-white/8"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">{pin&&<span className="text-xs text-primary font-bold">📌 PINNED</span>}<span className="font-bold text-sm">{ann.title}</span></div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{ann.content}</p>
          <p className="text-xs text-muted-foreground/60 mt-2">{new Date(ann.createdAt).toLocaleString()}</p>
        </div>
        {onDelete&&<button onClick={()=>onDelete(ann.id)} className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-destructive border border-destructive/20 bg-destructive/5 hover:bg-destructive/20 transition-colors text-xs">✕</button>}
      </div>
    </div>
  );
}
function StatCard({icon,label,value,color}:{icon:string;label:string;value:number|string;color:string}) {
  return <GCard className="p-4"><div className="flex items-center gap-2 mb-2"><span className="text-lg">{icon}</span><span className="text-xs text-muted-foreground font-medium">{label}</span></div><p className={`text-3xl font-black ${color}`}>{value}</p></GCard>;
}
function timeAgo(iso:string) {
  const s=Math.floor((Date.now()-new Date(iso).getTime())/1000);
  if(s<60) return `${s}s ago`;
  if(s<3600) return `${Math.floor(s/60)}m ago`;
  if(s<86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

/* ── PUBLIC SITE ─────────────────────────────────────────────────────────── */
function PublicSite({onOwnerLogin,onStaffLogin}:{onOwnerLogin:()=>void;onStaffLogin:(s:StaffMember)=>void}) {
  const {data:codes=[]}=useListCodes();
  const {data:announcements=[]}=useAnnouncements("public");
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState<"all"|"free"|"paid">("all");
  const [showOwner,setShowOwner]=useState(false);
  const [showStaff,setShowStaff]=useState(false);
  const [ownerPw,setOwnerPw]=useState("");
  const [staffUser,setStaffUser]=useState("");
  const [staffPw,setStaffPw]=useState("");
  const staffLogin=useStaffLogin();
  const {toast}=useToast();
  const q=search.toLowerCase();
  const filtered=codes.filter(c=>(filter==="all"||c.type===filter)&&(!q||c.title.toLowerCase().includes(q)||(c.emoji||"").includes(q)||(c.description||"").toLowerCase().includes(q)));
  const free=filtered.filter(c=>c.type==="free");
  const paid=filtered.filter(c=>c.type==="paid");
  const sorted=[...announcements.filter(a=>a.pinned==="true"),...announcements.filter(a=>a.pinned!=="true")];

  const handleOwner=(e:React.FormEvent)=>{e.preventDefault();if(ownerPw===OWNER_PASSWORD){onOwnerLogin();setShowOwner(false);setOwnerPw("");}else toast({title:"Wrong password",variant:"destructive"})};
  const handleStaff=(e:React.FormEvent)=>{e.preventDefault();staffLogin.mutate({data:{username:staffUser,password:staffPw}},{onSuccess:(d)=>{onStaffLogin(d as StaffMember);setShowStaff(false)},onError:()=>toast({title:"Invalid credentials",variant:"destructive"})})};

  return (
    <div className="min-h-screen bg-[#07070f]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#07070f]/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center font-black text-white text-sm shadow-primary/40 shadow-lg">CZ</div>
          <span className="font-black text-lg tracking-tight">CodeZ <span className="text-primary">Development</span></span>
        </div>
        <div className="flex items-center gap-2">
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-xl bg-[#5865F2] text-white text-sm font-semibold hover:bg-[#4752c4] transition-colors shadow hidden sm:block">Discord</a>
          <Btn variant="ghost" onClick={()=>{setShowStaff(true);setShowOwner(false)}}>Staff Panel</Btn>
          <Btn onClick={()=>{setShowOwner(true);setShowStaff(false)}}>Owner Panel</Btn>
        </div>
      </nav>

      {showOwner&&<Modal title="🔐 Owner Login" onClose={()=>setShowOwner(false)}><form onSubmit={handleOwner} className="flex flex-col gap-3"><input type="password" placeholder="Password" value={ownerPw} onChange={e=>setOwnerPw(e.target.value)} className={`w-full ${inputCls}`} autoFocus/><div className="flex gap-2"><Btn type="submit" className="flex-1">Login</Btn><Btn type="button" variant="ghost" onClick={()=>setShowOwner(false)} className="flex-1">Cancel</Btn></div></form></Modal>}
      {showStaff&&<Modal title="👤 Staff Login" onClose={()=>setShowStaff(false)}><form onSubmit={handleStaff} className="flex flex-col gap-3"><input placeholder="Username" value={staffUser} onChange={e=>setStaffUser(e.target.value)} className={`w-full ${inputCls}`} autoFocus/><input type="password" placeholder="Password" value={staffPw} onChange={e=>setStaffPw(e.target.value)} className={`w-full ${inputCls}`}/><div className="flex gap-2"><Btn type="submit" className="flex-1">Login</Btn><Btn type="button" variant="ghost" onClick={()=>setShowStaff(false)} className="flex-1">Cancel</Btn></div></form></Modal>}

      <header className="relative py-24 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-transparent to-transparent pointer-events-none"/>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none"/>
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/25 text-primary text-xs font-bold mb-6 tracking-widest uppercase">⚡ Free & Premium Codes</div>
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight mb-4 leading-tight">CodeZ <span className="text-primary drop-shadow-[0_0_30px_hsl(var(--primary)/0.5)]">Development</span></h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8 leading-relaxed">Your hub for exclusive server codes — free for everyone, premium for serious communities.</p>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-primary text-white font-bold text-base hover:bg-primary/90 transition-all shadow-primary/30 shadow-xl hover:shadow-primary/50 hover:-translate-y-0.5">Join Our Discord ↗</a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-24">
        {sorted.length>0&&<section className="mb-12"><div className="flex items-center gap-3 mb-4"><div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center text-sm">📢</div><h2 className="text-lg font-bold">Announcements</h2></div><div className="space-y-3">{sorted.map(a=><AnnCard key={a.id} ann={a}/>)}</div></section>}
        <div className="mb-10 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">🔍</span>
            <input placeholder="Search codes…" value={search} onChange={e=>setSearch(e.target.value)} className={`w-full pl-11 pr-10 py-3 rounded-2xl ${inputCls}`}/>
            {search&&<button onClick={()=>setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground w-6 h-6 flex items-center justify-center">✕</button>}
          </div>
          <div className="flex gap-2">{(["all","free","paid"] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all ${filter===f?"bg-primary text-white shadow-primary/30 shadow":"bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/8"}`}>{f==="paid"?"Premium":f==="all"?"All":f.charAt(0).toUpperCase()+f.slice(1)}</button>)}</div>
        </div>

        {(filter==="all"||filter==="free")&&<section className="mb-16">
          <div className="flex items-center gap-3 mb-6"><span className="text-2xl">🆓</span><h2 className="text-2xl font-black">Free Codes</h2><span className="px-2.5 py-0.5 rounded-full bg-green-500/15 text-green-400 text-xs font-bold border border-green-500/25">{free.length} available</span></div>
          {free.length===0?<div className="text-center py-14 bg-white/3 border border-white/8 rounded-2xl text-muted-foreground">No free codes available yet.</div>
          :<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{free.map(c=><div key={c.id} className="group relative bg-gradient-to-br from-green-500/5 to-transparent border border-green-500/15 rounded-2xl p-4 hover:border-green-500/30 hover:shadow-green-500/5 hover:shadow-lg transition-all"><div className="flex items-start justify-between mb-3"><div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/20 flex items-center justify-center text-lg">{c.emoji||"💎"}</div><span className="px-2 py-0.5 text-xs rounded-full bg-green-500/15 text-green-400 border border-green-500/25 font-bold">FREE</span></div><h3 className="font-bold mb-1">{c.title}</h3>{c.description&&<p className="text-sm text-muted-foreground mb-3 leading-relaxed">{c.description}</p>}{c.code&&<div className="relative mt-2"><div className="p-2.5 pr-16 rounded-xl bg-black/40 font-mono text-sm text-green-400 select-all border border-green-500/20 break-all">{c.code}</div><CopyBtn text={c.code}/></div>}</div>)}</div>}
        </section>}

        {(filter==="all"||filter==="paid")&&<section>
          <div className="flex items-center gap-3 mb-6"><span className="text-2xl">⭐</span><h2 className="text-2xl font-black">Premium Codes</h2><span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-bold border border-primary/25">{paid.length} available</span></div>
          {paid.length===0?<div className="text-center py-14 bg-white/3 border border-white/8 rounded-2xl text-muted-foreground">No premium codes listed yet.</div>
          :<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{paid.map(c=><div key={c.id} className="group bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-4 hover:border-primary/40 hover:shadow-primary/10 hover:shadow-xl transition-all"><div className="flex items-start justify-between mb-3"><div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-lg">{c.emoji||"⭐"}</div><span className="px-2 py-0.5 text-xs rounded-full bg-primary/15 text-primary border border-primary/30 font-bold">PREMIUM</span></div><h3 className="font-bold mb-1">{c.title}</h3>{c.description&&<p className="text-sm text-muted-foreground mb-3 leading-relaxed">{c.description}</p>}{c.link&&<a href={c.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 rounded-xl bg-primary/15 text-primary text-sm font-bold border border-primary/30 hover:bg-primary/25 transition-all">Get Access ↗</a>}</div>)}</div>}
        </section>}
      </main>
    </div>
  );
}

/* ── OWNER PANEL ─────────────────────────────────────────────────────────── */
const OWNER_TABS = ["Dashboard","Manage Codes","Manage Staff","Assign Tasks","Leave Requests","Promotions","Announcements","Activity Log","Statistics"] as const;
type OTab = typeof OWNER_TABS[number];

function OwnerPanel({onLogout}:{onLogout:()=>void}) {
  const [tab,setTab]=useState<OTab>("Dashboard");
  const qc=useQueryClient();
  const {toast}=useToast();

  const {data:rawCodes=[]}=useListCodes();
  const {data:rawStaff=[]}=useListStaff();
  const staff=rawStaff as StaffFull[];
  const {data:tasks=[]}=useListTasks();
  const {data:leaves=[]}=useListLeaves();
  const {data:stats}=useGetStats();
  const {data:anns=[]}=useAnnouncements();
  const {data:promos=[]}=usePromotions();

  const [logType,setLogType]=useState("all");
  const {data:logs=[],refetch:refetchLogs}=useActivityLogs(logType);

  const createCode=useCreateCode();
  const deleteCode=useDeleteCode();
  const createStaff=useCreateStaff();
  const deleteStaff=useDeleteStaff();
  const updateStaff=useUpdateStaff();
  const createTask=useCreateTask();
  const updateTask=useUpdateTask();
  const deleteTask=useDeleteTask();
  const updateLeave=useUpdateLeave();
  const createAnn=useCreateAnn();
  const deleteAnn=useDeleteAnn();
  const updatePromo=useUpdatePromo();
  const warnStaff=useWarnStaff();
  const clearWarn=useClearWarn();
  const clearAllWarns=useClearAllWarns();
  const saveNotes=useSaveNotes();

  const inv=(...keys:unknown[][])=>keys.forEach(k=>qc.invalidateQueries({queryKey:k}));
  const invStaff=()=>inv(getListStaffQueryKey());

  // forms
  const [cf,setCf]=useState({type:"free",title:"",description:"",code:"",link:"",emoji:""});
  const [sf,setSf]=useState({username:"",password:"",role:"Trainee"});
  const [tf,setTf]=useState({staffId:"",title:"",description:"",consequence:"",dueAt:""});
  const [af,setAf]=useState({type:"public",title:"",content:"",pinned:false});
  const [cSearch,setCSearch]=useState("");
  const [sSearch,setSSearch]=useState("");
  const [cFilter,setCFilter]=useState<"all"|"free"|"paid">("all");
  const [tFilter,setTFilter]=useState<"all"|"pending"|"done"|"failed">("all");
  const [lFilter,setLFilter]=useState<"all"|"pending"|"approved"|"denied">("all");
  const [pFilter,setPFilter]=useState<"all"|"pending"|"approved"|"denied">("all");
  const [aFilter,setAFilter]=useState<"all"|"public"|"staff">("all");
  const [ssort,setSsort]=useState<"name"|"done"|"failed"|"rate"|"warnings">("name");
  const [editRoleId,setEditRoleId]=useState<number|null>(null);
  const [editRoleVal,setEditRoleVal]=useState("");
  const [editNotesId,setEditNotesId]=useState<number|null>(null);
  const [editNotesVal,setEditNotesVal]=useState("");

  const filteredCodes=rawCodes.filter(c=>(cFilter==="all"||c.type===cFilter)&&(!cSearch||c.title.toLowerCase().includes(cSearch.toLowerCase())));
  const filteredTasks=tasks.filter(t=>tFilter==="all"||t.status===tFilter);
  const filteredLeaves=leaves.filter(l=>lFilter==="all"||l.status===lFilter);
  const filteredPromos=promos.filter(p=>pFilter==="all"||p.status===pFilter);
  const filteredAnns=anns.filter(a=>aFilter==="all"||a.type===aFilter);
  const sortedAnns=[...filteredAnns.filter(a=>a.pinned==="true"),...filteredAnns.filter(a=>a.pinned!=="true")];
  const filteredStaff=staff.filter(s=>!sSearch||s.username.toLowerCase().includes(sSearch.toLowerCase())||s.role.toLowerCase().includes(sSearch.toLowerCase()));
  const sortedStaff=[...filteredStaff].sort((a,b)=>{
    if(ssort==="name") return a.username.localeCompare(b.username);
    if(ssort==="done") return b.tasksCompleted-a.tasksCompleted;
    if(ssort==="failed") return b.tasksFailed-a.tasksFailed;
    if(ssort==="warnings") return b.warnings-a.warnings;
    const ra=(a.tasksCompleted+a.tasksFailed)>0?a.tasksCompleted/(a.tasksCompleted+a.tasksFailed):0;
    const rb=(b.tasksCompleted+b.tasksFailed)>0?b.tasksCompleted/(b.tasksCompleted+b.tasksFailed):0;
    return rb-ra;
  });

  const pendingLeaves=leaves.filter(l=>l.status==="pending").length;
  const pendingPromos=promos.filter(p=>p.status==="pending").length;
  const atRisk=staff.filter(s=>s.warnings>=3).length;
  const overdueTasks=tasks.filter(t=>t.status==="pending"&&(t as any).dueAt&&new Date((t as any).dueAt)<new Date()).length;

  const handleAddCode=(e:React.FormEvent)=>{e.preventDefault();createCode.mutate({data:cf as Parameters<typeof createCode.mutate>[0]["data"]},{onSuccess:()=>{inv(getListCodesQueryKey());setCf({type:"free",title:"",description:"",code:"",link:"",emoji:""});toast({title:"✅ Code added"})}})};
  const handleAddStaff=(e:React.FormEvent)=>{e.preventDefault();createStaff.mutate({data:sf},{onSuccess:()=>{invStaff();setSf({username:"",password:"",role:"Trainee"});toast({title:"✅ Staff added"})},onError:()=>toast({title:"Username already exists",variant:"destructive"})})};
  const handleAssignTask=(e:React.FormEvent)=>{
    e.preventDefault();
    const member=staff.find(s=>s.id===Number(tf.staffId));
    if(!member) return;
    fetch(`${API}/tasks`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({staffId:Number(tf.staffId),staffUsername:member.username,title:tf.title,description:tf.description,consequence:tf.consequence,dueAt:tf.dueAt||undefined})}).then(()=>{inv(getListTasksQueryKey());setTf({staffId:"",title:"",description:"",consequence:"",dueAt:""});toast({title:"✅ Task assigned"})});
  };
  const handleAddAnn=(e:React.FormEvent)=>{e.preventDefault();createAnn.mutate({type:af.type,title:af.title,content:af.content,pinned:af.pinned},{onSuccess:()=>{inv(["announcements"]);setAf({type:"public",title:"",content:"",pinned:false});toast({title:"✅ Announcement posted"})}})};
  const handlePromo=(id:number,status:"approved"|"denied")=>updatePromo.mutate({id,status},{onSuccess:()=>{inv(["promotions"],getListStaffQueryKey());toast({title:status==="approved"?"⬆️ Promotion approved!":"❌ Denied"})}});
  const handleWarn=(id:number,u:string)=>warnStaff.mutate(id,{onSuccess:()=>{invStaff();toast({title:`⚠️ Warning issued to ${u}`})}});
  const handleClearWarn=(id:number)=>clearWarn.mutate(id,{onSuccess:()=>invStaff()});
  const handleClearAll=(id:number,u:string)=>clearAllWarns.mutate(id,{onSuccess:()=>{invStaff();toast({title:`✅ All warnings cleared for ${u}`})}});

  const tabIcons:Record<OTab,string>={"Dashboard":"🏠","Manage Codes":"📦","Manage Staff":"👥","Assign Tasks":"📋","Leave Requests":"🏖️","Promotions":"⬆️","Announcements":"📢","Activity Log":"📜","Statistics":"📊"};
  const tabBadge:Partial<Record<OTab,string|number>>={
    "Leave Requests":pendingLeaves||undefined,
    "Promotions":pendingPromos||undefined,
    "Manage Staff":atRisk?`${atRisk}⚠`:undefined,
    "Assign Tasks":overdueTasks?`${overdueTasks}⏰`:undefined,
  };

  const LOG_TYPES=["all","staff_added","staff_removed","role_changed","task_assigned","task_completed","task_failed","warning_issued","warning_cleared","leave_approved","leave_denied","promo_approved","promo_denied","code_added","code_removed","announcement_posted"];

  return (
    <div className="min-h-screen bg-[#07070f]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#07070f]/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center font-black text-white text-sm shadow-primary/40 shadow-lg">CZ</div>
          <div><p className="font-black text-base">Owner <span className="text-primary">Panel</span></p><p className="text-xs text-muted-foreground">{staff.length} staff · {rawCodes.length} codes</p></div>
        </div>
        <Btn variant="ghost" onClick={onLogout}>← Logout</Btn>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Tab bar */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-2 scrollbar-none">
          {OWNER_TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${tab===t?"bg-primary text-white shadow-primary/30 shadow":"border border-white/8 text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
              <span>{tabIcons[t]}</span><span className="hidden sm:inline">{t}</span>
              {tabBadge[t]!==undefined&&<span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-black ${tab===t?"bg-white/20 text-white":"bg-primary/20 text-primary"}`}>{tabBadge[t]}</span>}
            </button>
          ))}
        </div>

        {/* ── DASHBOARD ── */}
        {tab==="Dashboard"&&(
          <div className="space-y-6">
            {/* Quick stats */}
            {stats&&<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon="📦" label="Total Codes" value={stats.totalCodes} color="text-primary"/>
              <StatCard icon="👥" label="Staff" value={stats.totalStaff} color="text-blue-400"/>
              <StatCard icon="✅" label="Tasks Done" value={stats.completedTasks} color="text-green-400"/>
              <StatCard icon="⏳" label="Pending Tasks" value={stats.pendingTasks} color="text-yellow-400"/>
            </div>}
            {/* Alert cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`p-4 rounded-2xl border flex items-center gap-3 ${pendingLeaves>0?"bg-yellow-500/8 border-yellow-500/25":"bg-white/3 border-white/8"}`}>
                <span className="text-2xl">🏖️</span>
                <div><p className="font-bold text-sm">{pendingLeaves} Leave Request{pendingLeaves!==1?"s":""}</p><p className="text-xs text-muted-foreground">{pendingLeaves>0?"Awaiting review":"All clear"}</p></div>
                {pendingLeaves>0&&<Btn className="ml-auto text-xs py-1" onClick={()=>setTab("Leave Requests")}>Review</Btn>}
              </div>
              <div className={`p-4 rounded-2xl border flex items-center gap-3 ${pendingPromos>0?"bg-purple-500/8 border-purple-500/25":"bg-white/3 border-white/8"}`}>
                <span className="text-2xl">⬆️</span>
                <div><p className="font-bold text-sm">{pendingPromos} Promotion{pendingPromos!==1?"s":""}</p><p className="text-xs text-muted-foreground">{pendingPromos>0?"Awaiting decision":"None pending"}</p></div>
                {pendingPromos>0&&<Btn className="ml-auto text-xs py-1" onClick={()=>setTab("Promotions")}>Review</Btn>}
              </div>
              <div className={`p-4 rounded-2xl border flex items-center gap-3 ${atRisk>0?"bg-red-500/8 border-red-500/25":"bg-white/3 border-white/8"}`}>
                <span className="text-2xl">⚠️</span>
                <div><p className="font-bold text-sm">{atRisk} At-Risk Staff</p><p className="text-xs text-muted-foreground">{atRisk>0?"3+ warnings":"All good"}</p></div>
                {atRisk>0&&<Btn className="ml-auto text-xs py-1" onClick={()=>setTab("Manage Staff")}>View</Btn>}
              </div>
            </div>
            {/* Recent activity */}
            <GCard className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2">📜 Recent Activity</h3>
                <button onClick={()=>setTab("Activity Log")} className="text-xs text-primary hover:underline">View all →</button>
              </div>
              {logs.slice(0,8).length===0?<p className="text-sm text-muted-foreground text-center py-4">No activity yet.</p>
              :<div className="space-y-2">{logs.slice(0,8).map(l=>{
                const meta=LOG_META[l.type]||{icon:"📌",color:"text-muted-foreground"};
                return <div key={l.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <span className="text-base w-6 text-center flex-shrink-0">{meta.icon}</span>
                  <span className={`flex-1 text-sm ${meta.color}`}>{l.description}</span>
                  <span className="text-xs text-muted-foreground/60 flex-shrink-0">{timeAgo(l.createdAt)}</span>
                </div>;
              })}</div>}
            </GCard>
            {/* Quick assign task */}
            <GCard className="p-5">
              <h3 className="font-bold mb-4">⚡ Quick Assign Task</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select className={inputCls} value={tf.staffId} onChange={e=>setTf(f=>({...f,staffId:e.target.value}))}>
                  <option value="">Select staff…</option>
                  {staff.map(s=><option key={s.id} value={s.id}>{s.username}</option>)}
                </select>
                <input placeholder="Task title…" className={inputCls} value={tf.title} onChange={e=>setTf(f=>({...f,title:e.target.value}))}/>
                <Btn onClick={()=>{
                  if(!tf.staffId||!tf.title) return;
                  const member=staff.find(s=>s.id===Number(tf.staffId));
                  if(!member) return;
                  fetch(`${API}/tasks`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({staffId:Number(tf.staffId),staffUsername:member.username,title:tf.title,description:tf.title,consequence:""})}).then(()=>{inv(getListTasksQueryKey());setTf(f=>({...f,staffId:"",title:""}));toast({title:"✅ Task assigned"})});
                }}>Assign</Btn>
              </div>
            </GCard>
          </div>
        )}

        {/* ── MANAGE CODES ── */}
        {tab==="Manage Codes"&&(
          <div className="space-y-6">
            <GCard className="p-5">
              <h3 className="font-bold mb-4">➕ Add New Code</h3>
              <form onSubmit={handleAddCode}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <select value={cf.type} onChange={e=>setCf(f=>({...f,type:e.target.value}))} className={inputCls}><option value="free">🆓 Free</option><option value="paid">⭐ Premium</option></select>
                  <input required placeholder="Title *" value={cf.title} onChange={e=>setCf(f=>({...f,title:e.target.value}))} className={inputCls}/>
                  <input placeholder="Emoji" value={cf.emoji} onChange={e=>setCf(f=>({...f,emoji:e.target.value}))} className={inputCls}/>
                  <input placeholder="Description" value={cf.description} onChange={e=>setCf(f=>({...f,description:e.target.value}))} className={inputCls}/>
                  {cf.type==="free"?<input placeholder="Code value *" value={cf.code} onChange={e=>setCf(f=>({...f,code:e.target.value}))} className={`sm:col-span-2 ${inputCls}`}/>:<input placeholder="Link *" value={cf.link} onChange={e=>setCf(f=>({...f,link:e.target.value}))} className={`sm:col-span-2 ${inputCls}`}/>}
                </div>
                <Btn type="submit">Add Code</Btn>
              </form>
            </GCard>
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <h3 className="font-bold">All Codes <span className="text-muted-foreground font-normal text-sm">({filteredCodes.length})</span></h3>
                <div className="ml-auto flex gap-2 items-center flex-wrap">
                  <input placeholder="Search…" value={cSearch} onChange={e=>setCSearch(e.target.value)} className={`w-28 py-1.5 ${inputCls}`}/>
                  {(["all","free","paid"] as const).map(f=><button key={f} onClick={()=>setCFilter(f)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${cFilter===f?"bg-primary text-white":"border border-white/10 text-muted-foreground hover:bg-white/5"}`}>{f==="paid"?"Premium":f}</button>)}
                </div>
              </div>
              <div className="space-y-2">
                {filteredCodes.length===0&&<div className="text-center py-10 bg-white/3 border border-white/8 rounded-2xl text-muted-foreground">No codes found.</div>}
                {filteredCodes.map(c=>(
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-white/3 border border-white/8 rounded-xl hover:border-white/15 transition-all">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${c.type==="free"?"bg-green-500/15 border border-green-500/20":"bg-primary/15 border border-primary/20"}`}>{c.emoji||(c.type==="free"?"🆓":"⭐")}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap"><span className="font-semibold text-sm truncate">{c.title}</span><span className={`px-1.5 py-0.5 text-xs rounded-lg border font-bold ${c.type==="free"?"bg-green-500/15 text-green-400 border-green-500/20":"bg-primary/15 text-primary border-primary/20"}`}>{c.type==="paid"?"PREMIUM":"FREE"}</span></div>
                      {c.description&&<p className="text-xs text-muted-foreground truncate">{c.description}</p>}
                      {c.code&&<p className="text-xs font-mono text-green-400 mt-0.5 truncate">{c.code}</p>}
                      {c.link&&<p className="text-xs text-primary truncate mt-0.5">{c.link}</p>}
                    </div>
                    <Btn variant="danger" className="py-1.5 text-xs flex-shrink-0" onClick={()=>deleteCode.mutate({id:c.id},{onSuccess:()=>{inv(getListCodesQueryKey());toast({title:"🗑 Removed"})}})}>Remove</Btn>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── MANAGE STAFF ── */}
        {tab==="Manage Staff"&&(
          <div className="space-y-6">
            <GCard className="p-5">
              <h3 className="font-bold mb-4">➕ Add Staff Member</h3>
              <form onSubmit={handleAddStaff}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <input required placeholder="Username *" value={sf.username} onChange={e=>setSf(f=>({...f,username:e.target.value}))} className={inputCls}/>
                  <input required type="password" placeholder="Password *" value={sf.password} onChange={e=>setSf(f=>({...f,password:e.target.value}))} className={inputCls}/>
                  <select value={sf.role} onChange={e=>setSf(f=>({...f,role:e.target.value}))} className={inputCls}>{ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select>
                </div>
                <Btn type="submit">Add Staff</Btn>
              </form>
            </GCard>
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h3 className="font-bold">Staff Members ({filteredStaff.length})</h3>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  <input placeholder="Search staff…" value={sSearch} onChange={e=>setSSearch(e.target.value)} className={`w-36 py-1.5 ${inputCls}`}/>
                  {(["name","done","failed","rate","warnings"] as const).map(s=><button key={s} onClick={()=>setSsort(s)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${ssort===s?"bg-primary text-white":"border border-white/10 text-muted-foreground hover:bg-white/5"}`}>{s==="warnings"?"⚠️":s}</button>)}
                </div>
              </div>
              <div className="space-y-3">
                {sortedStaff.length===0&&<div className="text-center py-10 bg-white/3 border border-white/8 rounded-2xl text-muted-foreground">No staff found.</div>}
                {sortedStaff.map(s=>(
                  <div key={s.id} className={`p-4 border rounded-2xl transition-all ${s.warnings>=3?"bg-red-500/5 border-red-500/25":s.warnings>0?"bg-orange-500/5 border-orange-500/20":"bg-white/3 border-white/8"}`}>
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="relative flex-shrink-0">
                        <div className="w-11 h-11 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-black text-lg">{s.username[0].toUpperCase()}</div>
                        {s.warnings>0&&<div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-black flex items-center justify-center shadow">{s.warnings}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5"><span className="font-bold text-sm">{s.username}</span><RoleBadge role={s.role}/>{s.warnings>0&&<WarnBadge count={s.warnings}/>}</div>
                        <p className="text-xs text-muted-foreground">✅ {s.tasksCompleted} · ❌ {s.tasksFailed} · Joined {new Date(s.createdAt).toLocaleDateString()}</p>
                        {s.notes&&<p className="text-xs text-yellow-400/80 mt-1 italic">📝 {s.notes}</p>}
                        {/* Warning controls */}
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <button onClick={()=>handleWarn(s.id,s.username)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 text-xs font-semibold border border-orange-500/20 hover:bg-orange-500/20 transition-colors">⚠️ Warn</button>
                          {s.warnings>0&&<><button onClick={()=>handleClearWarn(s.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold border border-green-500/20 hover:bg-green-500/20 transition-colors">−1</button><button onClick={()=>handleClearAll(s.id,s.username)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 text-muted-foreground text-xs font-semibold border border-white/10 hover:bg-white/10 transition-colors">Clear All</button></>}
                          {/* Notes */}
                          {editNotesId===s.id?(
                            <div className="flex items-center gap-1.5 w-full mt-1">
                              <input placeholder="Owner note…" value={editNotesVal} onChange={e=>setEditNotesVal(e.target.value)} className={`flex-1 py-1 text-xs ${inputCls}`}/>
                              <Btn className="py-1 text-xs" onClick={()=>saveNotes.mutate({id:s.id,notes:editNotesVal},{onSuccess:()=>{invStaff();setEditNotesId(null);toast({title:"📝 Note saved"})}})}>Save</Btn>
                              <Btn variant="ghost" className="py-1 text-xs" onClick={()=>setEditNotesId(null)}>✕</Btn>
                            </div>
                          ):(
                            <button onClick={()=>{setEditNotesId(s.id);setEditNotesVal(s.notes||"")}} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs font-semibold border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors">📝 {s.notes?"Edit Note":"Add Note"}</button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {editRoleId===s.id?(
                          <><select value={editRoleVal} onChange={e=>setEditRoleVal(e.target.value)} className={`py-1 text-xs ${inputCls}`}>{ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select><Btn className="py-1.5 text-xs" onClick={()=>updateStaff.mutate({id:s.id,data:{role:editRoleVal}},{onSuccess:()=>{invStaff();setEditRoleId(null);toast({title:"✅ Role updated"})}})}>Save</Btn><Btn variant="ghost" className="py-1.5 text-xs" onClick={()=>setEditRoleId(null)}>✕</Btn></>
                        ):(
                          <Btn variant="outline" className="py-1.5 text-xs" onClick={()=>{setEditRoleId(s.id);setEditRoleVal(s.role)}}>Edit Role</Btn>
                        )}
                        <Btn variant="danger" className="py-1.5 text-xs" onClick={()=>deleteStaff.mutate({id:s.id},{onSuccess:()=>{invStaff();toast({title:"🗑 Removed"})}})}>Remove</Btn>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ASSIGN TASKS ── */}
        {tab==="Assign Tasks"&&(
          <div className="space-y-6">
            <GCard className="p-5">
              <h3 className="font-bold mb-4">📋 Assign Task</h3>
              <form onSubmit={handleAssignTask}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <select required value={tf.staffId} onChange={e=>setTf(f=>({...f,staffId:e.target.value}))} className={inputCls}><option value="">Select staff *</option>{staff.map(s=><option key={s.id} value={s.id}>{s.username} — {s.role}</option>)}</select>
                  <input required placeholder="Task title *" value={tf.title} onChange={e=>setTf(f=>({...f,title:e.target.value}))} className={inputCls}/>
                  <textarea required placeholder="Description *" value={tf.description} onChange={e=>setTf(f=>({...f,description:e.target.value}))} rows={3} className={`sm:col-span-2 resize-none ${inputCls}`}/>
                  <input placeholder="Consequence if not done" value={tf.consequence} onChange={e=>setTf(f=>({...f,consequence:e.target.value}))} className={inputCls}/>
                  <div><label className="text-xs text-muted-foreground block mb-1">Due date (optional)</label><input type="datetime-local" value={tf.dueAt} onChange={e=>setTf(f=>({...f,dueAt:e.target.value}))} className={`w-full ${inputCls}`}/></div>
                </div>
                <Btn type="submit">Assign Task</Btn>
              </form>
            </GCard>
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h3 className="font-bold">All Tasks <span className="text-muted-foreground font-normal text-sm">({filteredTasks.length})</span></h3>
                <div className="ml-auto flex gap-1.5">{(["all","pending","done","failed"] as const).map(f=><button key={f} onClick={()=>setTFilter(f)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${tFilter===f?"bg-primary text-white":"border border-white/10 text-muted-foreground hover:bg-white/5"}`}>{f}</button>)}</div>
              </div>
              <div className="space-y-3">
                {filteredTasks.length===0&&<div className="text-center py-10 bg-white/3 border border-white/8 rounded-2xl text-muted-foreground">No tasks found.</div>}
                {filteredTasks.map(t=>{
                  const due=(t as any).dueAt?new Date((t as any).dueAt):null;
                  const overdue=due&&t.status==="pending"&&due<new Date();
                  return <div key={t.id} className={`p-4 border rounded-2xl ${overdue?"bg-red-500/8 border-red-500/30":t.status==="pending"?"bg-yellow-500/5 border-yellow-500/20":t.status==="done"?"bg-green-500/5 border-green-500/20":"bg-red-500/5 border-red-500/20"}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1"><span className="font-semibold text-sm">{t.title}</span><StatusBadge status={t.status}/>{overdue&&<span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-bold animate-pulse">⏰ OVERDUE</span>}</div>
                        <p className="text-xs text-muted-foreground mb-1.5">👤 <span className="text-foreground font-medium">{t.staffUsername}</span></p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{t.description}</p>
                        {t.consequence&&<p className="text-xs text-red-400 mt-1.5">⚠️ {t.consequence}</p>}
                        {due&&<p className={`text-xs mt-1.5 font-semibold ${overdue?"text-red-400":"text-muted-foreground"}`}>📅 Due: {due.toLocaleString()}</p>}
                        <p className="text-xs text-muted-foreground/60 mt-1">{new Date(t.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {t.status==="pending"&&<Btn variant="danger" className="py-1.5 text-xs" onClick={()=>updateTask.mutate({id:t.id,data:{status:"failed"}},{onSuccess:()=>{inv(getListTasksQueryKey(),getListStaffQueryKey());toast({title:"⚠️ Marked failed (+1 warning)"})}})}>Mark Failed</Btn>}
                        <Btn variant="ghost" className="py-1.5 text-xs" onClick={()=>deleteTask.mutate({id:t.id},{onSuccess:()=>inv(getListTasksQueryKey())})}>Delete</Btn>
                      </div>
                    </div>
                  </div>;
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── LEAVE REQUESTS ── */}
        {tab==="Leave Requests"&&(
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h3 className="font-bold">Leave Requests <span className="text-muted-foreground font-normal text-sm">({filteredLeaves.length})</span></h3>
              <div className="ml-auto flex gap-1.5">{(["all","pending","approved","denied"] as const).map(f=><button key={f} onClick={()=>setLFilter(f)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${lFilter===f?"bg-primary text-white":"border border-white/10 text-muted-foreground hover:bg-white/5"}`}>{f}</button>)}</div>
            </div>
            {filteredLeaves.length===0&&<div className="text-center py-14 bg-white/3 border border-white/8 rounded-2xl text-muted-foreground">No leave requests found.</div>}
            {filteredLeaves.map(l=>(
              <div key={l.id} className="p-4 bg-white/3 border border-white/8 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold flex-shrink-0">{l.staffUsername[0].toUpperCase()}</div>
                  <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1 flex-wrap"><span className="font-semibold text-sm">{l.staffUsername}</span><StatusBadge status={l.status}/></div><p className="text-sm text-muted-foreground leading-relaxed">{l.reason}</p><p className="text-xs text-muted-foreground/60 mt-1">{new Date(l.createdAt).toLocaleString()}</p></div>
                  {l.status==="pending"&&<div className="flex gap-2 flex-shrink-0">
                    <button onClick={()=>updateLeave.mutate({id:l.id,data:{status:"approved"}},{onSuccess:()=>{inv(getListLeavesQueryKey());toast({title:"✅ Approved"})}})} className="px-3 py-1.5 rounded-xl bg-green-500/10 text-green-400 text-xs font-bold border border-green-500/20 hover:bg-green-500/20 transition-all">✅ Approve</button>
                    <Btn variant="danger" className="py-1.5 text-xs" onClick={()=>updateLeave.mutate({id:l.id,data:{status:"denied"}},{onSuccess:()=>{inv(getListLeavesQueryKey());toast({title:"❌ Denied"})}})}>Deny</Btn>
                  </div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── PROMOTIONS ── */}
        {tab==="Promotions"&&(
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h3 className="font-bold">Promotion Requests <span className="text-muted-foreground font-normal text-sm">({filteredPromos.length})</span></h3>
              <div className="ml-auto flex gap-1.5">{(["all","pending","approved","denied"] as const).map(f=><button key={f} onClick={()=>setPFilter(f)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${pFilter===f?"bg-primary text-white":"border border-white/10 text-muted-foreground hover:bg-white/5"}`}>{f}</button>)}</div>
            </div>
            {filteredPromos.length===0&&<div className="text-center py-16 bg-white/3 border border-white/8 rounded-2xl"><p className="text-4xl mb-3">⬆️</p><p className="text-muted-foreground">No promotion requests yet.</p></div>}
            {filteredPromos.map(p=>(
              <div key={p.id} className={`p-4 border rounded-2xl ${p.status==="pending"?"bg-yellow-500/5 border-yellow-500/20":p.status==="approved"?"bg-green-500/5 border-green-500/20":"bg-white/3 border-white/8"}`}>
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-black text-lg flex-shrink-0">{p.staffUsername[0].toUpperCase()}</div>
                  <div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap mb-2"><span className="font-bold text-sm">{p.staffUsername}</span><StatusBadge status={p.status}/></div><div className="flex items-center gap-2 mb-2"><RoleBadge role={p.currentRole}/><span className="text-muted-foreground font-bold">→</span><RoleBadge role={p.requestedRole}/></div><p className="text-sm text-muted-foreground italic">"{p.reason}"</p><p className="text-xs text-muted-foreground/60 mt-1.5">{new Date(p.createdAt).toLocaleString()}</p></div>
                  {p.status==="pending"&&<div className="flex flex-col gap-2 flex-shrink-0"><button onClick={()=>handlePromo(p.id,"approved")} className="px-3 py-1.5 rounded-xl bg-green-500/10 text-green-400 text-xs font-bold border border-green-500/20 hover:bg-green-500/20 transition-all">⬆️ Approve</button><Btn variant="danger" className="py-1.5 text-xs" onClick={()=>handlePromo(p.id,"denied")}>❌ Deny</Btn></div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ANNOUNCEMENTS ── */}
        {tab==="Announcements"&&(
          <div className="space-y-6">
            <GCard className="p-5">
              <h3 className="font-bold mb-4">📢 Post Announcement</h3>
              <form onSubmit={handleAddAnn}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <select value={af.type} onChange={e=>setAf(f=>({...f,type:e.target.value}))} className={inputCls}><option value="public">🌍 Public</option><option value="staff">🔒 Staff only</option></select>
                  <input required placeholder="Title *" value={af.title} onChange={e=>setAf(f=>({...f,title:e.target.value}))} className={inputCls}/>
                  <textarea required placeholder="Content *" value={af.content} onChange={e=>setAf(f=>({...f,content:e.target.value}))} rows={3} className={`sm:col-span-2 resize-none ${inputCls}`}/>
                  <label className="flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={af.pinned} onChange={e=>setAf(f=>({...f,pinned:e.target.checked}))} className="w-4 h-4 accent-primary rounded"/><span className="text-sm">📌 Pin announcement</span></label>
                </div>
                <Btn type="submit">Post</Btn>
              </form>
            </GCard>
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h3 className="font-bold">All Announcements <span className="text-muted-foreground font-normal text-sm">({filteredAnns.length})</span></h3>
                <div className="ml-auto flex gap-1.5">{(["all","public","staff"] as const).map(f=><button key={f} onClick={()=>setAFilter(f)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${aFilter===f?"bg-primary text-white":"border border-white/10 text-muted-foreground hover:bg-white/5"}`}>{f}</button>)}</div>
              </div>
              {sortedAnns.length===0&&<div className="text-center py-10 bg-white/3 border border-white/8 rounded-2xl text-muted-foreground">No announcements yet.</div>}
              <div className="space-y-3">{sortedAnns.map(a=><AnnCard key={a.id} ann={a} onDelete={id=>deleteAnn.mutate(id,{onSuccess:()=>{inv(["announcements"]);toast({title:"🗑 Removed"})}})}/>)}</div>
            </div>
          </div>
        )}

        {/* ── ACTIVITY LOG ── */}
        {tab==="Activity Log"&&(
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="font-bold">Activity Log <span className="text-muted-foreground font-normal text-sm">({logs.length} entries)</span></h3>
              <button onClick={()=>refetchLogs()} className="ml-auto text-xs text-primary hover:underline">↻ Refresh</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["all","task_completed","task_failed","warning_issued","warning_cleared","staff_added","staff_removed","role_changed","leave_approved","leave_denied","promo_approved","promo_denied","code_added","announcement_posted"].map(t=>(
                <button key={t} onClick={()=>setLogType(t)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all capitalize ${logType===t?"bg-primary text-white":"border border-white/10 text-muted-foreground hover:bg-white/5"}`}>{t==="all"?"All":t.replace(/_/g," ")}</button>
              ))}
            </div>
            {logs.length===0&&<div className="text-center py-16 bg-white/3 border border-white/8 rounded-2xl"><p className="text-4xl mb-3">📜</p><p className="text-muted-foreground">No activity logged yet. Actions will appear here as they happen.</p></div>}
            <GCard className="overflow-hidden">
              {logs.map((l,i)=>{
                const meta=LOG_META[l.type]||{icon:"📌",color:"text-muted-foreground"};
                return <div key={l.id} className={`flex items-start gap-3 px-5 py-3.5 ${i!==logs.length-1?"border-b border-white/5":""} hover:bg-white/3 transition-colors`}>
                  <span className="text-lg w-7 text-center flex-shrink-0 mt-0.5">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${meta.color}`}>{l.description}</p>
                    {l.staffUsername&&<p className="text-xs text-muted-foreground/60 mt-0.5">👤 {l.staffUsername}</p>}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-muted-foreground/60">{new Date(l.createdAt).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground/40">{timeAgo(l.createdAt)}</p>
                  </div>
                </div>;
              })}
            </GCard>
          </div>
        )}

        {/* ── STATISTICS ── */}
        {tab==="Statistics"&&(
          <div className="space-y-8">
            {stats&&<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon="📦" label="Total Codes" value={stats.totalCodes} color="text-primary"/>
              <StatCard icon="🆓" label="Free Codes" value={stats.freeCodes} color="text-green-400"/>
              <StatCard icon="⭐" label="Premium" value={stats.paidCodes} color="text-yellow-400"/>
              <StatCard icon="👥" label="Staff" value={stats.totalStaff} color="text-blue-400"/>
              <StatCard icon="✅" label="Tasks Done" value={stats.completedTasks} color="text-green-400"/>
              <StatCard icon="⏳" label="Pending" value={stats.pendingTasks} color="text-yellow-400"/>
              <StatCard icon="❌" label="Failed" value={stats.failedTasks} color="text-red-400"/>
              <StatCard icon="🏖️" label="Leaves Pending" value={stats.pendingLeaves} color="text-orange-400"/>
            </div>}
            {staff.filter(s=>s.warnings>0).length>0&&<GCard className="p-5 border-orange-500/20">
              <h3 className="font-bold text-orange-400 mb-3">⚠️ At-Risk Staff</h3>
              <div className="space-y-2">{staff.filter(s=>s.warnings>0).sort((a,b)=>b.warnings-a.warnings).map(s=>(
                <div key={s.id} className="flex items-center gap-3 p-3 bg-white/3 rounded-xl border border-white/8"><div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-black text-sm flex-shrink-0">{s.username[0].toUpperCase()}</div><span className="font-semibold text-sm flex-1">{s.username}</span><RoleBadge role={s.role}/><WarnBadge count={s.warnings}/></div>
              ))}</div>
            </GCard>}
            <div>
              <h3 className="font-bold text-lg mb-4">👥 Staff Performance</h3>
              <div className="overflow-x-auto rounded-2xl border border-white/8">
                <table className="w-full">
                  <thead><tr className="border-b border-white/8 bg-white/3">{["#","Staff","Role","⚠️","✅","❌","Rate","Joined"].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-bold text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody>{sortedStaff.map((s,i)=>{
                    const tot=s.tasksCompleted+s.tasksFailed;
                    const rate=tot>0?Math.round(s.tasksCompleted/tot*100):0;
                    const rc=rate>=80?"text-green-400":rate>=50?"text-yellow-400":"text-red-400";
                    const bc=rate>=80?"bg-green-500":rate>=50?"bg-yellow-500":"bg-red-500";
                    return <tr key={s.id} className={`border-b border-white/5 last:border-0 transition-colors ${s.warnings>=3?"bg-red-500/5 hover:bg-red-500/8":"hover:bg-white/3"}`}>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{i+1}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-black text-xs">{s.username[0].toUpperCase()}</div><span className="text-sm font-semibold">{s.username}</span></div></td>
                      <td className="px-4 py-3"><RoleBadge role={s.role}/></td>
                      <td className="px-4 py-3">{s.warnings>0?<WarnBadge count={s.warnings}/>:<span className="text-xs text-muted-foreground/40">—</span>}</td>
                      <td className="px-4 py-3 text-center text-sm font-bold text-green-400">{s.tasksCompleted}</td>
                      <td className="px-4 py-3 text-center text-sm font-bold text-red-400">{s.tasksFailed}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2 min-w-20"><div className="flex-1 h-1.5 rounded-full bg-white/10"><div className={`h-full rounded-full ${bc}`} style={{width:`${rate}%`}}/></div><span className={`text-xs font-bold ${rc}`}>{rate}%</span></div></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── STAFF PANEL ─────────────────────────────────────────────────────────── */
function StaffPanel({staffMember:init,onLogout}:{staffMember:StaffMember;onLogout:()=>void}) {
  const qc=useQueryClient();
  const {toast}=useToast();
  const {data:rawStaff=[]}=useListStaff();
  const live=(rawStaff as StaffFull[]).find(s=>s.id===init.id)??(init as StaffFull);
  const {data:tasks=[]}=useListTasks();
  const {data:leaves=[]}=useListLeaves();
  const {data:staffAnns=[]}=useAnnouncements("staff");
  const {data:myPromos=[]}=usePromotions(live.id);
  const updateTask=useUpdateTask();
  const createLeave=useCreateLeave();
  const createPromo=useCreatePromo();

  const [showLeave,setShowLeave]=useState(false);
  const [showPromo,setShowPromo]=useState(false);
  const [leaveReason,setLeaveReason]=useState("");
  const [promoRole,setPromoRole]=useState("");
  const [promoReason,setPromoReason]=useState("");
  const [tFilter,setTFilter]=useState<"all"|"pending"|"done"|"failed">("all");

  const myTasks=tasks.filter(t=>t.staffId===live.id);
  const myLeaves=leaves.filter(l=>l.staffId===live.id);
  const filteredTasks=myTasks.filter(t=>tFilter==="all"||t.status===tFilter);
  const sortedAnns=[...staffAnns.filter(a=>a.pinned==="true"),...staffAnns.filter(a=>a.pinned!=="true")];
  const hasPendingPromo=myPromos.some(p=>p.status==="pending");

  const done=myTasks.filter(t=>t.status==="done").length;
  const failed=myTasks.filter(t=>t.status==="failed").length;
  const pending=myTasks.filter(t=>t.status==="pending").length;
  const total=done+failed;
  const rate=total>0?Math.round(done/total*100):0;
  const rateColor=rate>=80?"text-green-400":rate>=50?"text-yellow-400":total===0?"text-muted-foreground":"text-red-400";
  const barColor=rate>=80?"bg-green-500":rate>=50?"bg-yellow-500":total===0?"bg-white/10":"bg-red-500";
  const grade=rate>=90?"S":rate>=75?"A":rate>=55?"B":rate>=35?"C":total===0?"—":"D";
  const gradeStyle=rate>=90?"text-green-400 border-green-500/40 bg-green-500/10 shadow-green-500/20 shadow":rate>=75?"text-blue-400 border-blue-500/40 bg-blue-500/10 shadow-blue-500/20 shadow":rate>=55?"text-yellow-400 border-yellow-500/40 bg-yellow-500/10":total===0?"text-muted-foreground border-white/10 bg-white/5":"text-red-400 border-red-500/40 bg-red-500/10";

  const handleLeave=(e:React.FormEvent)=>{e.preventDefault();createLeave.mutate({data:{staffId:live.id,staffUsername:live.username,reason:leaveReason}},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListLeavesQueryKey()});setLeaveReason("");setShowLeave(false);toast({title:"📤 Leave submitted"})}})};
  const handlePromo=(e:React.FormEvent)=>{e.preventDefault();createPromo.mutate({staffId:live.id,staffUsername:live.username,currentRole:live.role,requestedRole:promoRole,reason:promoReason},{onSuccess:()=>{qc.invalidateQueries({queryKey:["promotions"]});setPromoRole("");setPromoReason("");setShowPromo(false);toast({title:"⬆️ Request sent!"})},onError:(err)=>toast({title:err.message,variant:"destructive"})})};

  return (
    <div className="min-h-screen bg-[#07070f]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#07070f]/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-black text-lg">{live.username[0].toUpperCase()}</div>
            {live.warnings>0&&<div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-black flex items-center justify-center shadow animate-pulse">{live.warnings}</div>}
          </div>
          <div><p className="font-bold text-sm">{live.username}</p><RoleBadge role={live.role}/></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowPromo(true)} disabled={hasPendingPromo} className="px-3 py-2 rounded-xl border border-white/10 text-xs font-semibold text-foreground hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed">⬆️ Promo</button>
          <button onClick={()=>setShowLeave(true)} className="px-3 py-2 rounded-xl border border-white/10 text-xs font-semibold text-foreground hover:bg-white/5 transition-all">🏖️ Leave</button>
          <button onClick={onLogout} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all shadow-primary/30 shadow">← Logout</button>
        </div>
      </nav>

      {showLeave&&<Modal title="🏖️ Apply for Leave" onClose={()=>setShowLeave(false)}><p className="text-xs text-muted-foreground -mt-2 mb-3">Sent to owner for review.</p><form onSubmit={handleLeave} className="flex flex-col gap-3"><textarea placeholder="Reason…" value={leaveReason} onChange={e=>setLeaveReason(e.target.value)} rows={4} required className={`resize-none w-full ${inputCls}`} autoFocus/><div className="flex gap-2"><button type="submit" className="flex-1 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90">Submit</button><button type="button" onClick={()=>setShowLeave(false)} className="flex-1 py-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:bg-white/5">Cancel</button></div></form></Modal>}
      {showPromo&&<Modal title="⬆️ Request Promotion" onClose={()=>setShowPromo(false)}><form onSubmit={handlePromo} className="flex flex-col gap-3"><div><p className="text-xs text-muted-foreground mb-1">Current role</p><RoleBadge role={live.role}/></div><div><p className="text-xs text-muted-foreground mb-1">Requested role *</p><select required value={promoRole} onChange={e=>setPromoRole(e.target.value)} className={`w-full ${inputCls}`}><option value="">Select…</option>{ROLES.filter(r=>r!==live.role).map(r=><option key={r} value={r}>{r}</option>)}</select></div><textarea placeholder="Why do you deserve this? *" value={promoReason} onChange={e=>setPromoReason(e.target.value)} rows={4} required className={`resize-none w-full ${inputCls}`}/><div className="flex gap-2"><button type="submit" className="flex-1 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90">Submit</button><button type="button" onClick={()=>setShowPromo(false)} className="flex-1 py-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:bg-white/5">Cancel</button></div></form></Modal>}

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Warning alert */}
        {live.warnings>0&&<div className={`p-4 rounded-2xl border flex items-start gap-3 ${live.warnings>=3?"bg-red-500/10 border-red-500/30":live.warnings===2?"bg-orange-500/8 border-orange-500/25":"bg-yellow-500/8 border-yellow-500/20"}`}>
          <span className="text-2xl flex-shrink-0">{live.warnings>=3?"🚨":"⚠️"}</span>
          <div><p className={`font-bold text-sm ${live.warnings>=3?"text-red-400":live.warnings===2?"text-orange-400":"text-yellow-400"}`}>{live.warnings>=3?"CRITICAL — You are at serious risk of demotion or removal!":live.warnings===2?"You have 2 warnings — one more puts you at critical risk.":"You have a warning on your record."}</p><p className="text-xs text-muted-foreground mt-0.5">Complete your tasks to avoid further warnings.</p></div>
        </div>}

        {/* Owner note */}
        {live.notes&&<div className="p-4 rounded-2xl border bg-yellow-500/5 border-yellow-500/20 flex items-start gap-3"><span className="text-xl flex-shrink-0">📝</span><div><p className="text-xs text-yellow-400 font-bold mb-1">Owner Note</p><p className="text-sm text-muted-foreground">{live.notes}</p></div></div>}

        {/* Stats */}
        <GCard className="p-6">
          <h2 className="font-bold mb-5 flex items-center gap-2">📊 My Statistics</h2>
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex flex-col items-center gap-3 sm:w-36 flex-shrink-0">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-primary font-black text-2xl shadow-primary/20 shadow-lg">{live.username[0].toUpperCase()}</div>
                {live.warnings>0&&<div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-black flex items-center justify-center shadow animate-pulse">{live.warnings}</div>}
              </div>
              <div className="text-center"><p className="font-bold text-sm">{live.username}</p><div className="mt-1"><RoleBadge role={live.role}/></div></div>
              <div className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center font-black text-2xl ${gradeStyle}`}>{grade}</div>
              <p className="text-xs text-muted-foreground">Performance</p>
            </div>
            <div className="flex-1 space-y-4">
              <div><div className="flex items-center justify-between mb-1.5"><span className="text-xs text-muted-foreground font-medium">Success Rate</span><span className={`text-sm font-black ${rateColor}`}>{total===0?"No tasks yet":`${rate}%`}</span></div><div className="h-3 rounded-full bg-white/8 overflow-hidden"><div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{width:`${rate}%`}}/></div></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[{label:"Done",value:done,icon:"✅",color:"text-green-400",bg:"bg-green-500/8 border-green-500/20"},{label:"Pending",value:pending,icon:"⏳",color:"text-yellow-400",bg:"bg-yellow-500/8 border-yellow-500/20"},{label:"Failed",value:failed,icon:"❌",color:"text-red-400",bg:"bg-red-500/8 border-red-500/20"},{label:"Leaves",value:myLeaves.length,icon:"🏖️",color:"text-blue-400",bg:"bg-blue-500/8 border-blue-500/20"}].map(s=>(
                  <div key={s.label} className={`border rounded-xl p-3 text-center ${s.bg}`}><p className="text-base mb-0.5">{s.icon}</p><p className={`text-2xl font-black ${s.color}`}>{s.value}</p><p className="text-xs text-muted-foreground mt-0.5">{s.label}</p></div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>🗓 Joined <span className="text-foreground font-semibold">{new Date(live.createdAt).toLocaleDateString()}</span></span>
                <span>📋 {myTasks.length} tasks total</span>
                {live.warnings>0&&<span className="text-orange-400 font-bold">⚠️ {live.warnings} warning{live.warnings!==1?"s":""}</span>}
              </div>
            </div>
          </div>
        </GCard>

        {/* Promotions */}
        {myPromos.length>0&&<GCard className="p-5"><h2 className="font-bold mb-3">⬆️ My Promotion Requests</h2><div className="space-y-2">{myPromos.map(p=><div key={p.id} className={`p-3 rounded-xl border ${p.status==="pending"?"border-yellow-500/25 bg-yellow-500/5":p.status==="approved"?"border-green-500/25 bg-green-500/5":"border-white/8 bg-white/3"}`}><div className="flex items-center gap-3 flex-wrap"><div className="flex items-center gap-2"><RoleBadge role={p.currentRole}/><span className="text-muted-foreground font-bold">→</span><RoleBadge role={p.requestedRole}/></div><StatusBadge status={p.status}/><span className="text-xs text-muted-foreground ml-auto">{new Date(p.createdAt).toLocaleDateString()}</span></div>{p.status==="approved"&&<p className="text-xs text-green-400 mt-1.5 font-semibold">🎉 Congratulations! Your role has been updated.</p>}</div>)}</div></GCard>}

        {/* Staff announcements */}
        {sortedAnns.length>0&&<div><h2 className="font-bold text-base mb-3 flex items-center gap-2"><span>📢</span> Staff Announcements</h2><div className="space-y-3">{sortedAnns.map(a=><AnnCard key={a.id} ann={a}/>)}</div></div>}

        {/* Pending warning */}
        {pending>0&&<div className="p-4 bg-yellow-500/8 border border-yellow-500/20 rounded-2xl flex items-center gap-3"><span className="text-xl">⏳</span><p className="text-sm font-semibold text-yellow-300">You have {pending} pending task{pending!==1?"s":""} — complete them to avoid consequences.</p></div>}

        {/* Tasks */}
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h2 className="font-bold text-lg">My Tasks</h2>
            <div className="ml-auto flex gap-1.5">{(["all","pending","done","failed"] as const).map(f=><button key={f} onClick={()=>setTFilter(f)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${tFilter===f?"bg-primary text-white":"border border-white/10 text-muted-foreground hover:bg-white/5"}`}>{f}</button>)}</div>
          </div>
          {filteredTasks.length===0&&<div className="text-center py-12 bg-white/3 border border-white/8 rounded-2xl text-muted-foreground">No tasks found.</div>}
          <div className="space-y-3">{filteredTasks.map(t=>{
            const due=(t as any).dueAt?new Date((t as any).dueAt):null;
            const overdue=due&&t.status==="pending"&&due<new Date();
            return <div key={t.id} className={`p-4 border rounded-2xl ${overdue?"bg-red-500/8 border-red-500/30":t.status==="pending"?"bg-yellow-500/5 border-yellow-500/20":t.status==="done"?"bg-green-500/5 border-green-500/20":"bg-red-500/5 border-red-500/20"}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap"><span className="font-semibold text-sm">{t.title}</span><StatusBadge status={t.status}/>{overdue&&<span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-bold animate-pulse">⏰ OVERDUE</span>}</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t.description}</p>
                  {t.consequence&&<p className="text-xs text-red-400 mt-1.5">⚠️ Consequence: <span className="font-semibold">{t.consequence}</span></p>}
                  {due&&<p className={`text-xs mt-1.5 font-semibold ${overdue?"text-red-400":"text-muted-foreground"}`}>📅 Due: {due.toLocaleString()}</p>}
                  <p className="text-xs text-muted-foreground/60 mt-1">{new Date(t.createdAt).toLocaleString()}</p>
                </div>
                {t.status==="pending"&&<button onClick={()=>updateTask.mutate({id:t.id,data:{status:"done"}},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListTasksQueryKey()});toast({title:"✅ Task complete!"})}})} className="flex-shrink-0 w-12 h-12 rounded-2xl bg-green-500/15 border-2 border-green-500/40 text-green-400 text-2xl flex items-center justify-center hover:bg-green-500/25 hover:border-green-500/60 hover:scale-105 transition-all font-bold">✓</button>}
              </div>
            </div>;
          })}</div>
        </div>

        {/* Leave history */}
        <div>
          <h2 className="font-bold text-lg mb-3">My Leave Requests</h2>
          {myLeaves.length===0&&<div className="text-center py-10 bg-white/3 border border-white/8 rounded-2xl text-muted-foreground">No leave requests yet.</div>}
          <div className="space-y-2">{myLeaves.map(l=><div key={l.id} className="p-4 bg-white/3 border border-white/8 rounded-xl"><div className="flex items-start justify-between gap-3"><div><div className="mb-1"><StatusBadge status={l.status}/></div><p className="text-sm text-muted-foreground">{l.reason}</p><p className="text-xs text-muted-foreground/60 mt-1">{new Date(l.createdAt).toLocaleString()}</p></div>{l.reviewedAt&&<p className="text-xs text-muted-foreground flex-shrink-0">Reviewed {new Date(l.reviewedAt).toLocaleDateString()}</p>}</div></div>)}</div>
        </div>
      </div>
    </div>
  );
}

/* ── APP SHELL ───────────────────────────────────────────────────────────── */
type View={kind:"public"}|{kind:"owner"}|{kind:"staff";member:StaffMember};
function AppShell() {
  const [view,setView]=useState<View>({kind:"public"});
  if(view.kind==="owner") return <OwnerPanel onLogout={()=>setView({kind:"public"})}/>;
  if(view.kind==="staff") return <StaffPanel staffMember={view.member} onLogout={()=>setView({kind:"public"})}/>;
  return <PublicSite onOwnerLogin={()=>setView({kind:"owner"})} onStaffLogin={(m)=>setView({kind:"staff",member:m})}/>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,"")}>
          <Switch><Route path="/" component={AppShell}/></Switch>
        </WouterRouter>
        <Toaster/>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
