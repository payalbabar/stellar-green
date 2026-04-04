"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useWeb3 } from "@/context/Web3Context";
import { useRouter } from "next/navigation";
import { useContractEvents, type ContractEvent, createRecordUploadedEvent, createRewardEarnedEvent } from "@/hooks/useContractEvents";

// Types
type Record = {
  id: number;
  name: string;
  type: string;
  date: string;
  doctor: string;
  notes: string;
  hash: string;
  uploaded: string;
};

type Doctor = {
  id: number;
  addr: string;
  name: string;
  spec: string;
  granted: string;
};

type LogEntry = {
  action: "GRANTED" | "REVOKED";
  doctorName: string;
  doctorAddr: string;
  time: string;
};

export default function Dashboard() {
  const { address, isConnected, disconnect } = useWeb3();
  const router = useRouter();

  // Redirect if not connected
  useEffect(() => {
    if (!address) {
      router.push("/");
    }
  }, [address, router]);

  const [activeTab, setActiveTab] = useState("overview");
  const [records, setRecords] = useState<Record[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [accessLog, setAccessLog] = useState<LogEntry[]>([]);
  const [activities, setActivities] = useState<{ msg: string; time: string; dot: string }[]>([
    { msg: "Welcome to <strong>MediVault</strong>. Your secure medical record vault.", time: "Just now", dot: "lime" }
  ]);

  // Modal state
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);

  // Stats
  const totalRecords = records.length;
  const activeDoctors = doctors.length;
  const lastUpload = records.length > 0 
    ? new Date(records[records.length - 1].uploaded).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : "—";

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Form states
  const [uploadForm, setUploadForm] = useState({ name: "", type: "Lab Report", date: "", doctor: "", notes: "", file: null as File | null });
  const [grantForm, setGrantForm] = useState({ addr: "", name: "", spec: "" });

  // Activity management
  const addActivity = (msg: string, dot = "") => {
    setActivities(prev => [{ msg, time: new Date().toLocaleTimeString(), dot }, ...prev]);
  };

  // Real-time contract event listener
  const handleContractEvent = useCallback((event: ContractEvent) => {
    switch (event.type) {
      case 'RECORD_UPLOADED':
        setActivities(prev => [{ msg: `New record uploaded: <strong>${event.data.recordName}</strong>`, time: new Date().toLocaleTimeString(), dot: "lime" }, ...prev]);
        break;
      case 'ACCESS_GRANTED':
        setActivities(prev => [{ msg: `Access granted to <strong>${event.data.doctorName}</strong>`, time: new Date().toLocaleTimeString(), dot: "lime" }, ...prev]);
        break;
      case 'ACCESS_REVOKED':
        setActivities(prev => [{ msg: `Access revoked from <strong>${event.data.doctorName}</strong>`, time: new Date().toLocaleTimeString(), dot: "rust" }, ...prev]);
        break;
      case 'REWARD_EARNED':
        setActivities(prev => [{ msg: `<span className="text-lime font-bold">REWARD:</span> Earned <strong>${event.data.amount} MRT</strong> for ${event.data.reason}`, time: new Date().toLocaleTimeString(), dot: "lime" }, ...prev]);
        break;
      default:
        break;
    }
  }, []);

  useContractEvents(handleContractEvent);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.name || !uploadForm.date || !uploadForm.file) return;

    const btn = e.currentTarget.querySelector('button[type="submit"]') as HTMLButtonElement;
    const originalText = btn.textContent;
    btn.textContent = "⏳ Uploading to local storage...";
    btn.disabled = true;

    try {
      let recordHash = "";

      // Try Pinata upload if JWT is available
      const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT;
      if (pinataJwt && uploadForm.file) {
        btn.textContent = "🚀 Pinning to IPFS...";
        const formData = new FormData();
        formData.append("file", uploadForm.file);
        
        const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
          method: "POST",
          headers: { Authorization: `Bearer ${pinataJwt}` },
          body: formData,
        });
        
        if (res.ok) {
          const data = await res.json();
          recordHash = data.IpfsHash;
        } else {
          console.error("Pinata error:", await res.text());
          recordHash = URL.createObjectURL(uploadForm.file); // Fallback
        }
      } else {
        recordHash = URL.createObjectURL(uploadForm.file);
      }
      
      const newRecord: Record = {
        id: Date.now(),
        name: uploadForm.name,
        type: uploadForm.type,
        date: uploadForm.date,
        doctor: uploadForm.doctor || "Self-uploaded",
        notes: uploadForm.notes,
        hash: recordHash,
        uploaded: new Date().toISOString()
      };

      setRecords([...records, newRecord]);
      
      // Emit events (simulating chain events)
      handleContractEvent(createRecordUploadedEvent(uploadForm.name, uploadForm.type));
      setTimeout(() => {
        handleContractEvent(createRewardEarnedEvent(50, "data sovereignty contribution"));
      }, 1000);

      setUploadForm({ name: "", type: "Lab Report", date: "", doctor: "", notes: "", file: null });
      setActiveTab("records");
    } catch (error: any) {
      console.error(error);
      addActivity(`Failed to upload: <strong>${error.message || "Unknown error"}</strong>`, "rust");
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  };

  const handleGrant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantForm.addr || !grantForm.name) return;

    const newDoc: Doctor = {
      id: Date.now(),
      addr: grantForm.addr,
      name: grantForm.name,
      spec: grantForm.spec || "General Practice",
      granted: new Date().toISOString()
    };

    setDoctors([...doctors, newDoc]);
    setAccessLog([{ action: "GRANTED", doctorName: grantForm.name, doctorAddr: grantForm.addr, time: new Date().toISOString() }, ...accessLog]);
    addActivity(`Access granted to <strong>${grantForm.name}</strong>`, "lime");
    setGrantForm({ addr: "", name: "", spec: "" });
  };

  const revokeAccess = (id: number) => {
    const doc = doctors.find(d => d.id === id);
    if (!doc) return;
    setDoctors(doctors.filter(d => d.id !== id));
    setAccessLog([{ action: "REVOKED", doctorName: doc.name, doctorAddr: doc.addr, time: new Date().toISOString() }, ...accessLog]);
    addActivity(`Access revoked from <strong>${doc.name}</strong>`, "rust");
  };

  const deleteRecord = (id: number) => {
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    setRecords(records.filter(r => r.id !== id));
    addActivity(`Record <strong>"${rec.name}"</strong> deleted`, "rust");
  };

  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not Connected";

  return (
    <div className="flex flex-col min-h-screen bg-cream text-ink">
      {/* TOPBAR */}
      <nav className="sticky top-0 z-[100] bg-burgundy flex items-center justify-between px-6 md:px-10 h-14 border-b-3 border-lime">
        <div className="flex items-center gap-4">
           <button 
             onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
             className="md:hidden text-lime text-2xl transition-transform hover:scale-110 active:scale-95"
           >
             {isMobileMenuOpen ? "✕" : "☰"}
           </button>
           <div className="font-bebas text-[22px] tracking-[4px] text-lime">MEDIVAULT</div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" className="hidden sm:flex font-mono-plex text-[11px] font-semibold tracking-[2px] uppercase text-cream px-5 items-center hover:text-lime transition-colors">← Home</Link>
          <span className="font-mono-plex text-[11px] tracking-[2px] uppercase bg-rust text-white px-4 md:px-6 py-[8px] md:py-[10px]">{shortAddr}</span>
        </div>
      </nav>

      <div className="grid md:grid-cols-[280px_1fr] flex-grow relative">
        {/* SIDEBAR */}
        <aside className={`bg-ink flex flex-col border-r-3 border-lime h-[calc(100vh-56px)] fixed md:sticky top-14 left-0 z-50 w-[280px] md:w-auto transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} custom-scrollbar overflow-y-auto`}>
          <div className="p-8 pb-0">
            <div className="font-bebas text-[32px] tracking-[4px] text-lime">DASHBOARD</div>
          </div>
          <div className="m-6 mt-10 bg-lime/10 border border-lime/20 p-5">
            <div className="font-mono-plex text-[9px] tracking-[3px] uppercase text-lime/70 mb-1">Connected Wallet</div>
            <div className="font-mono-plex text-[11px] text-cream flex items-center gap-2 truncate">
              <span className="w-2 h-2 bg-lime rounded-full animate-blink shadow-[0_0_8px_#C8F02A]" />
              {shortAddr}
            </div>
          </div>
          <nav className="mt-10 flex-grow">
            <div className="font-mono-plex text-[9px] tracking-[4px] uppercase text-white/20 px-8 mb-3">Navigation</div>
            <NavItem label="Overview" icon="▦" active={activeTab === "overview"} onClick={() => { setActiveTab("overview"); setIsMobileMenuOpen(false); }} />
            <NavItem label="My Records" icon="📂" active={activeTab === "records"} onClick={() => { setActiveTab("records"); setIsMobileMenuOpen(false); }} />
            <NavItem label="Upload" icon="↑" active={activeTab === "upload"} onClick={() => { setActiveTab("upload"); setIsMobileMenuOpen(false); }} />
            <NavItem label="Doctors" icon="👨⚕" active={activeTab === "doctors"} onClick={() => { setActiveTab("doctors"); setIsMobileMenuOpen(false); }} />
            <NavItem label="Access Log" icon="🔑" active={activeTab === "access"} onClick={() => { setActiveTab("access"); setIsMobileMenuOpen(false); }} />
          </nav>
          <div className="p-6 border-t border-white/10 mt-auto">
            <button 
              onClick={() => { disconnect(); router.push("/"); }}
              className="w-full font-mono-plex text-[10px] font-semibold tracking-[2px] uppercase text-white/30 border border-white/10 p-3 hover:text-rust hover:border-rust transition-all"
            >
              Disconnect Wallet
            </button>
          </div>
        </aside>

        {/* MOBILE OVERLAY */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-300"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* MAIN */}
        <main className="dash-main overflow-y-auto h-[calc(100vh-56px)] custom-scrollbar">
          <div className="bg-cream-dark border-b-2 border-card-border px-6 md:px-12 py-5 flex items-center justify-between">
            <div className="font-bebas text-[30px] md:text-[36px] tracking-[3px] text-ink">{activeTab.toUpperCase()}</div>
            <div className="hidden sm:block font-mono-plex text-[11px] text-ink-soft tracking-widest">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          </div>

          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div className="animate-in fade-in slide-in-from-bottom-5 duration-500">
              <div className="grid grid-cols-2 md:grid-cols-4 border-b-2 border-card-border">
                <StatTile label="Total Records" val={totalRecords.toString()} change="↑ All time" />
                <StatTile label="Doctors With Access" val={activeDoctors.toString()} change="Active grants" />
                <StatTile label="Files on IPFS" val={totalRecords.toString()} change="↑ Pinned" />
                <StatTile label="Last Upload" val={lastUpload} change="Timestamp" isDate />
              </div>
              <div className="p-12 border-b-2 border-card-border">
                <div className="flex items-center justify-between mb-8">
                  <div className="font-bebas text-[28px] tracking-[2px] text-ink">RECENT RECORDS</div>
                  <button onClick={() => setActiveTab("upload")} className="font-mono-plex text-[10px] font-semibold tracking-[2px] uppercase bg-burgundy text-lime px-5 py-3 hover:bg-ink transition-all">+ Add Record</button>
                </div>
                {records.length === 0 ? <EmptyState icon="📋" title="No Records Yet" sub="Upload your first medical record to get started" /> : (
                  <div className="space-y-0">
                    {[...records].reverse().slice(0, 5).map((r, i) => (
                      <RecordRow key={r.id} index={i + 1} record={r} onView={() => setSelectedRecord(r)} onDelete={() => deleteRecord(r.id)} />
                    ))}
                  </div>
                )}
              </div>
              <div className="p-12 bg-cream-dark">
                <div className="font-bebas text-[28px] tracking-[2px] text-ink mb-6">ACTIVITY FEED</div>
                <div className="space-y-0">
                  {activities.map((a, i) => (
                    <div key={i} className="flex gap-4 py-4 border-b border-card-border last:border-0 items-start">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${a.dot === 'lime' ? 'bg-lime shadow-[0_0_8px_#C8F02A]' : a.dot === 'rust' ? 'bg-rust' : 'bg-mist'}`} />
                      <div>
                        <div className="text-xs leading-relaxed text-ink-soft font-light" dangerouslySetInnerHTML={{ __html: a.msg }} />
                        <div className="font-mono-plex text-[9px] text-mist tracking-wider mt-1">{a.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* RECORDS */}
          {activeTab === "records" && (
            <div className="p-12 animate-in fade-in duration-500">
               <div className="flex items-center justify-between mb-8">
                  <div className="font-bebas text-[28px] tracking-[2px] text-ink">ALL RECORDS</div>
                  <button onClick={() => setActiveTab("upload")} className="font-mono-plex text-[10px] font-semibold tracking-[2px] uppercase bg-burgundy text-lime px-5 py-3 hover:bg-ink transition-all">+ Upload New</button>
                </div>
                {records.length === 0 ? <EmptyState icon="📂" title="No Records Found" sub="Your uploaded records will appear here" /> : (
                  <div className="space-y-0">
                    {[...records].reverse().map((r, i) => (
                      <RecordRow key={r.id} index={i + 1} record={r} onView={() => setSelectedRecord(r)} onDelete={() => deleteRecord(r.id)} />
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* UPLOAD */}
          {activeTab === "upload" && (
            <div className="p-12 animate-in slide-in-from-bottom-10 duration-500">
              <div className="font-bebas text-[28px] tracking-[2px] text-ink mb-8">UPLOAD MEDICAL RECORD</div>
              <div 
                className="border-2 border-dashed border-card-border p-16 text-center cursor-crosshair transition-all hover:border-burgundy hover:bg-burgundy/[0.03] mb-8 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.012)_10px,rgba(0,0,0,0.012)_20px)]"
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <div className="text-[48px] mb-4">⬆</div>
                <div className="font-bebas text-[28px] tracking-[2px] text-ink mb-2">UPLOAD / DROP FILE</div>
                <div className="font-mono-plex text-[11px] text-ink-soft tracking-wider mb-8">PDF, JPG, PNG up to 50MB</div>
                <input type="file" id="file-input" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setUploadForm({...uploadForm, file, name: file.name.replace(/\.[^/.]+$/, "")});
                  }
                }} />
                <button className="font-mono-plex text-[11px] font-semibold tracking-[3px] uppercase bg-ink text-lime px-9 py-3.5 hover:bg-burgundy transition-all">Choose File</button>
              </div>

              {uploadForm.file && (
                <form 
                  onSubmit={handleUpload} 
                  className="border-t-2 border-card-border pt-8 animate-in fade-in duration-300"
                >
                  <div className="font-mono-plex text-[11px] text-ink-soft tracking-wider mb-8 flex items-center gap-2">📎 {uploadForm.file.name} ({(uploadForm.file.size/1024).toFixed(1)} KB)</div>
                  <div className="grid grid-cols-2 gap-5 mb-5 md:mb-5">
                    <FormField 
                      label="Record Name" 
                      value={uploadForm.name} 
                      onChange={(v) => setUploadForm({...uploadForm, name: v})} 
                      placeholder="e.g. Blood Test Results" 
                      required
                    />
                    <div className="flex flex-col gap-2">
                       <label className="font-mono-plex text-[9px] tracking-[3px] uppercase text-ink-soft">Record Type</label>
                       <select 
                         className="font-manrope text-sm bg-cream border-2 border-card-border p-3 outline-none focus:border-burgundy transition-all"
                         value={uploadForm.type}
                         onChange={(e) => setUploadForm({...uploadForm, type: e.target.value})}
                       >
                          <option>Lab Report</option>
                          <option>Imaging</option>
                          <option>Prescription</option>
                          <option>Vaccination</option>
                          <option>Other</option>
                       </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-5 mb-5">
                    <FormField 
                      label="Date" 
                      type="date" 
                      value={uploadForm.date} 
                      onChange={(v) => setUploadForm({...uploadForm, date: v})} 
                      required
                    />
                    <FormField label="Doctor / Facility" value={uploadForm.doctor} onChange={(v) => setUploadForm({...uploadForm, doctor: v})} placeholder="e.g. City General Hospital" />
                  </div>
                  <FormField label="Notes (optional)" value={uploadForm.notes} onChange={(v) => setUploadForm({...uploadForm, notes: v})} placeholder="Any additional info" />
                  <button 
                    type="submit" 
                    className="mt-8 font-mono-plex text-[11px] font-semibold tracking-[3px] uppercase bg-burgundy text-lime px-10 py-4 hover:bg-ink transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ⬡ Upload to IPFS & Chain
                  </button>
                </form>
              )}
            </div>
          )}

          {/* DOCTORS */}
          {activeTab === "doctors" && (
            <div className="animate-in fade-in duration-500">
              <div className="p-12 pb-0">
                <div className="font-bebas text-[28px] tracking-[2px] text-ink mb-8">GRANT DOCTOR ACCESS</div>
                <form onSubmit={handleGrant} className="grid grid-cols-1 md:grid-cols-2 gap-10 border-b-2 border-card-border pb-12">
                   <div className="space-y-5">
                      <FormField label="Doctor Wallet Address" value={grantForm.addr} onChange={(v) => setGrantForm({...grantForm, addr: v})} placeholder="0x..." />
                      <FormField label="Doctor Name" value={grantForm.name} onChange={(v) => setGrantForm({...grantForm, name: v})} placeholder="Dr. Jane Smith" />
                   </div>
                   <div className="space-y-5 flex flex-col">
                      <FormField label="Specialisation" value={grantForm.spec} onChange={(v) => setGrantForm({...grantForm, spec: v})} placeholder="e.g. Cardiologist" />
                      <button type="submit" className="mt-auto font-mono-plex text-[11px] font-semibold tracking-[3px] uppercase bg-burgundy text-lime px-10 py-4 hover:bg-ink transition-all">Grant Access →</button>
                   </div>
                </form>
              </div>
              <div className="p-12 bg-cream-dark min-h-[400px]">
                <div className="font-bebas text-[28px] tracking-[2px] text-ink mb-8">AUTHORISED DOCTORS</div>
                {doctors.length === 0 ? <EmptyState icon="👨⚕" title="No Doctors Authorised" sub="Grant access to your first doctor above" /> : (
                  <div className="grid md:grid-cols-3 border-2 border-ink">
                    {doctors.map(d => (
                      <div key={d.id} className="p-8 border-r-2 border-ink last:border-0 relative bg-cream group hover:bg-burgundy transition-all duration-300">
                        <button onClick={() => revokeAccess(d.id)} className="absolute top-4 right-4 text-[9px] font-mono-plex tracking-wider uppercase text-mist border border-card-border px-2 py-1 opacity-0 group-hover:opacity-100 transition-all hover:bg-rust hover:text-white">Revoke</button>
                        <div className="w-12 h-12 bg-ink text-2xl flex items-center justify-center border-2 border-card-border mb-4 transition-all group-hover:border-lime">👨⚕</div>
                        <div className="font-serif text-lg text-ink group-hover:text-cream transition-colors">{d.name}</div>
                        <div className="font-mono-plex text-[10px] tracking-wider text-rust uppercase mb-3 transition-colors group-hover:text-lime">{d.spec}</div>
                        <div className="font-mono-plex text-[9px] text-mist truncate transition-colors group-hover:text-cream/50">{d.addr}</div>
                        <div className="mt-3 text-[9px] font-mono-plex text-green-600 font-semibold uppercase tracking-widest transition-colors group-hover:text-lime">● Access Active</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ACCESS LOG */}
          {activeTab === "access" && (
            <div className="p-12 animate-in fade-in duration-500">
                <div className="font-bebas text-[28px] tracking-[2px] text-ink mb-8">ACCESS LOG</div>
                {accessLog.length === 0 ? <EmptyState icon="🔑" title="No Access Events" sub="Access grants and revocations will appear here" /> : (
                  <div className="space-y-0">
                    {accessLog.map((log, i) => (
                      <div key={i} className="grid grid-cols-[40px_1fr_auto] gap-5 items-center py-5 border-b border-card-border">
                        <div className="font-mono-plex text-xs text-mist font-semibold">{(i + 1).toString().padStart(2, '0')}</div>
                        <div>
                          <div className="font-bold text-sm text-ink uppercase tracking-wider">{log.doctorName}</div>
                          <div className="font-mono-plex text-[10px] text-ink-soft tracking-wider">{log.doctorAddr} · {new Date(log.time).toLocaleString()}</div>
                        </div>
                        <div className={`font-mono-plex text-[9px] font-bold tracking-widest px-3 py-1 border ${log.action === 'GRANTED' ? 'bg-green-50 text-green-600 border-green-600' : 'bg-rust/10 text-rust border-rust'}`}>
                          {log.action}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
        </main>
      </div>

      {/* MODAL */}
      {selectedRecord && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/85 backdrop-blur-sm p-4 animate-in fade-in duration-300" onClick={() => setSelectedRecord(null)}>
          <div className="bg-cream border-3 border-ink w-full max-w-[560px] max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom-10 duration-300" onClick={e => e.stopPropagation()}>
            <div className="bg-ink p-6 px-8 flex items-center justify-between">
              <div className="font-bebas text-[28px] tracking-[3px] text-lime">RECORD DETAIL</div>
              <button onClick={() => setSelectedRecord(null)} className="text-white/50 text-xl hover:text-lime transition-all">✕</button>
            </div>
            <div className="p-10 space-y-5">
              {['Imaging', 'Lab Report'].includes(selectedRecord.type) && (
                <div className="mb-8 border-2 border-card-border p-2 bg-white">
                  <img
                    src={selectedRecord.hash.startsWith('blob:') ? selectedRecord.hash : `https://ipfs.io/ipfs/${selectedRecord.hash}`}
                    alt="Record Detail"
                    className="w-full h-auto rounded-sm"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                </div>
              )}
              <ModalField label="Name" val={selectedRecord.name} />
              <ModalField label="Type" val={selectedRecord.type} />
              <ModalField label="Date" val={selectedRecord.date} />
              <ModalField label="Doctor / Facility" val={selectedRecord.doctor} />
              <ModalField label="IPFS Hash" val={selectedRecord.hash} isMono />
              <ModalField label="Uploaded" val={new Date(selectedRecord.uploaded).toLocaleString()} />
              <ModalField label="Notes" val={selectedRecord.notes || "—"} />
              <div className="pt-8 border-t-2 border-card-border mt-8">
                {selectedRecord.hash.startsWith('blob:') ? (
                  <span className="font-mono-plex text-[10px] tracking-[2px] uppercase text-lime">Dev Mode: Local Upload</span>
                ) : (
                  <a href={`https://ipfs.io/ipfs/${selectedRecord.hash}`} target="_blank" className="font-mono-plex text-[10px] tracking-[2px] uppercase text-burgundy border-b border-burgundy hover:text-ink hover:border-ink transition-all">View on IPFS ↗</a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-components
function NavItem({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 py-4 px-8 font-semibold text-sm transition-all border-l-4 ${active ? 'text-lime border-lime bg-lime/5' : 'text-white/45 border-transparent hover:bg-white/5 hover:text-cream'}`}
    >
      <span className={`w-8 h-8 flex items-center justify-center bg-white/5 shrink-0 ${active ? 'bg-lime/15' : ''}`}>{icon}</span>
      {label}
    </button>
  );
}

function StatTile({ label, val, change, isDate = false }: { label: string; val: string; change: string; isDate?: boolean }) {
  return (
    <div className="p-10 border-r-2 border-card-border last:border-0 hover:bg-burgundy group transition-all duration-300">
      <div className="font-mono-plex text-[9px] tracking-[3px] uppercase text-ink-soft mb-4 group-hover:text-white/50 transition-colors">{label}</div>
      <div className={`font-bebas leading-none text-ink tracking-widest transition-colors group-hover:text-lime ${isDate ? 'text-2xl mt-3' : 'text-[52px]'}`}>{val}</div>
      <div className="font-mono-plex text-[10px] text-rust mt-2 group-hover:text-white/60 transition-colors">{change}</div>
    </div>
  );
}

function RecordRow({ index, record, onView, onDelete }: { index: number; record: Record; onView: () => void; onDelete: () => void }) {
  const typeStyles = {
    'Lab Report': 'bg-burgundy/10 text-burgundy border-burgundy',
    'Imaging': 'bg-rust/10 text-rust border-rust',
    'Prescription': 'bg-green-100 text-green-700 border-green-700',
    'Vaccination': 'bg-blue-100 text-blue-700 border-blue-700',
    'Other': 'bg-cream-dark text-ink-soft border-card-border'
  };
  return (
    <div className="grid grid-cols-[40px_1fr_auto_auto] gap-5 items-center py-5 border-b border-card-border last:border-0 hover:bg-cream-dark group relative transition-all">
      <div className="font-mono-plex text-xs text-mist font-semibold group-hover:text-ink transition-colors">{index.toString().padStart(2, '0')}</div>
      <div>
        <div className="font-bold text-sm text-ink group-hover:text-burgundy transition-colors">{record.name}</div>
        <div className="font-mono-plex text-[10px] text-ink-soft tracking-wider mt-0.5">{record.doctor} · {record.date} · {record.hash.slice(0, 10)}...</div>
      </div>
      <div className={`font-mono-plex text-[9px] font-bold tracking-widest px-3 py-1 border hidden sm:block ${typeStyles[record.type as keyof typeof typeStyles] || typeStyles['Other']}`}>
        {record.type.toUpperCase()}
      </div>
      <div className="flex gap-2">
        <button onClick={onView} className="w-8 h-8 flex items-center justify-center border border-card-border hover:bg-burgundy hover:text-lime hover:border-burgundy transition-all">👁</button>
        <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center border border-card-border hover:bg-burgundy hover:text-lime hover:border-burgundy transition-all text-xs">✕</button>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, type = "text", required = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-mono-plex text-[9px] tracking-[3px] uppercase text-ink-soft">{label}</label>
      <input 
        type={type} 
        required={required}
        className="font-manrope text-sm bg-cream border-2 border-card-border p-3 outline-none focus:border-burgundy transition-all"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function ModalField({ label, val, isMono = false }: { label: string; val: string; isMono?: boolean }) {
  return (
    <div>
      <div className="font-mono-plex text-[9px] tracking-[3px] uppercase text-ink-soft mb-1.5">{label}</div>
      <div className={`text-sm text-ink break-all ${isMono ? 'font-mono-plex text-[13px]' : 'font-manrope'}`}>{val}</div>
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="text-center py-20 animate-in fade-in duration-700">
      <div className="text-[48px] mb-4 opacity-40">{icon}</div>
      <div className="font-bebas text-[32px] tracking-[2px] text-mist mb-2">{title}</div>
      <div className="font-mono-plex text-[11px] text-mist tracking-widest">{sub}</div>
    </div>
  );
}
