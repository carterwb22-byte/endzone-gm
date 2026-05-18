import { useState, useRef, useEffect } from "react";

const MY_USER_ID = "732319537936089088";
const LEAGUE_ID = "1312888163689037824";
const SLEEPER = "https://api.sleeper.app/v1";

async function sleeperFetch(path) {
  const res = await fetch(SLEEPER + path);
  if (!res.ok) throw new Error("Sleeper API error: " + res.status);
  return res.json();
}

const LEAGUE_BASE_CONTEXT = `You are a fantasy football GM assistant for Carter Berry's team "cartberr" in The Endzone Booty Blitz.

LEAGUE INFO:
- Name: The Endzone Booty Blitz
- Format: 12-team PPR Dynasty with IDP
- Roster spots: QB, RB, RB, WR, WR, TE, FLEX, REC_FLEX, SUPER_FLEX, K, IDP_FLEX x3, 14 bench spots
- Best ball scoring, 2026 season
- 6 playoff teams, trade deadline Week 11, 3 draft rounds
- Divisions: "Horned Up North" vs "Sloppy Toppy South"

TEAMS:
1. Schrodiziak (Horned Up North)
2. Toby's Tankers (Horned Up North)
3. cartberr / Carter Berry (Sloppy Toppy South) - THE USER
4. KevinHannah (Sloppy Toppy South)
5. BickNoyle (Sloppy Toppy South)
6. ecjaeger2315 (Horned Up North)
7. apeterson2018 (Horned Up North)
8. HubeeDoobie (Horned Up North)
9. Brandon Schroedlé (Sloppy Toppy South)
10. samburck58 (Sloppy Toppy South)
11. awaidlich (Sloppy Toppy South)
12. Bower Rangers (Horned Up North)`;

const FALLBACK_ROSTER = `CARTER'S ROSTER (cartberr):
STARTERS: Drake Maye (QB, NE, age 23), Travis Etienne (RB, NO, age 27), Braelon Allen (RB, NYJ, age 22), Nico Collins (WR, HOU, age 27), Jordan Addison (WR, MIN, age 24), Dalton Kincaid (TE, BUF, age 26), Ricky Pearsall (FLEX/WR, SF, age 25), Lamar Jackson (SF/QB, BAL, age 29)
BENCH: Justin Herbert (QB, LAC, age 28), Jayden Higgins (WR, HOU, age 23), Jalen Coker (WR, CAR, age 24), Tank Bigsby (RB, PHI, age 24), Elijah Arroyo (TE, SEA, age 23), Trey Benson (RB, ARI, age 23), Ollie Gordon (RB, MIA, age 22), Jaylen Wright (RB, MIA, age 23), Rashod Bateman (WR, BAL, age 26), Ray Davis (RB, BUF, age 26), Ryan Flournoy (WR, DAL, age 26), Jaylin Lane (WR, WAS, age 24), Justice Hill (RB, BAL, age 28)`;

// Calls our Vercel serverless function instead of Anthropic directly
async function claudeChat(apiKey, messages, rosterContext) {
  const system = LEAGUE_BASE_CONTEXT + "\n\n" + rosterContext + "\n\nBe conversational, direct, and opinionated like a knowledgeable fantasy football friend. Use emojis sparingly. Factor in SUPER_FLEX QB premium, IDP, and dynasty age curves.";
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system, apiKey }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text || "";
}

function Msg({ text }) {
  const lines = text.split("\n");
  return <>{lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2,-2)}</strong> : p
    );
    return <span key={i}>{parts}{i < lines.length - 1 ? <br /> : null}</span>;
  })}</>;
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("sc_api_key") || "");
  const [showApiInput, setShowApiInput] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: `Hey Carter! 👋 Welcome to your GM assistant for **The Endzone Booty Blitz**!\n\nTap **Sync League** to load your live roster from Sleeper, then ask me anything.\n\n📊 **Team Analysis** · 🔄 **Trade Help** · 🎯 **Start/Sit** · 🏈 **Draft Strategy**` }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [lastSync, setLastSync] = useState(null);
  const [syncLog, setSyncLog] = useState("");
  const [rosterContext, setRosterContext] = useState(FALLBACK_ROSTER);

  const bottomRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  function saveApiKey(key) {
    setApiKey(key);
    localStorage.setItem("sc_api_key", key);
  }

  async function syncLeague() {
    setSyncStatus("syncing");
    try {
      setSyncLog("Fetching rosters...");
      const rostersData = await sleeperFetch("/league/" + LEAGUE_ID + "/rosters");
      setSyncLog("Fetching picks...");
      const picksData = await sleeperFetch("/league/" + LEAGUE_ID + "/traded_picks");
      setSyncLog("Fetching player database...");
      const playersData = await sleeperFetch("/players/nfl");

      const myRoster = rostersData.find(r => r.owner_id === MY_USER_ID);
      if (myRoster && playersData) {
        const playerList = (myRoster.players || []).map(pid => {
          const p = playersData[pid];
          if (!p) return null;
          const name = ((p.first_name || "") + " " + (p.last_name || "")).trim();
          return `${name} (${p.fantasy_positions?.[0] || p.position || "?"}, ${p.team || "FA"}, age ${p.age || "?"})`;
        }).filter(Boolean);

        const myPicks = (picksData || [])
          .filter(p => p.owner_id === myRoster.roster_id)
          .map(p => `${p.season} Round ${p.round}`);
        const picksAway = (picksData || [])
          .filter(p => p.roster_id === myRoster.roster_id && p.owner_id !== myRoster.roster_id)
          .map(p => `${p.season} Round ${p.round}`);

        setRosterContext(
          `CARTER'S LIVE ROSTER (synced from Sleeper):\n` +
          `Players: ${playerList.join(", ")}\n` +
          `Record: ${myRoster.settings?.wins || 0}-${myRoster.settings?.losses || 0}\n` +
          `Acquired picks: ${myPicks.join(", ") || "none"}\n` +
          `Picks traded away: ${picksAway.join(", ") || "none"}`
        );
      }

      setSyncStatus("synced");
      setLastSync(new Date());
      setSyncLog("");
      setMessages(m => [...m, { role: "assistant", content: "✅ Synced live from Sleeper! Your current roster and picks are loaded." }]);
    } catch (e) {
      setSyncStatus("error");
      setSyncLog(e.message);
      setMessages(m => [...m, { role: "assistant", content: `⚠️ Sync failed: ${e.message}\n\nUsing your last known roster — still happy to help!` }]);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    if (!apiKey) { setShowApiInput(true); return; }
    const userMsg = { role: "user", content: text };
    setMessages(m => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    const newHistory = [...history, userMsg];
    try {
      const reply = await claudeChat(apiKey, newHistory, rosterContext);
      setHistory([...newHistory, { role: "assistant", content: reply }]);
      setMessages(m => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", content: "⚠️ " + e.message }]);
    }
    setLoading(false);
    setTimeout(() => taRef.current?.focus(), 100);
  }

  const SUGGESTIONS = ["Analyze my roster", "Should I trade Lamar?", "Rate my RB room", "Best trade targets?"];

  return (
    <div style={{ display:"flex", height:"100vh", background:"#f9fafb", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", overflow:"hidden" }}>

      {/* Sidebar */}
      <div style={{ width:240, background:"#fff", borderRight:"1px solid #e5e7eb", display:"flex", flexDirection:"column", flexShrink:0 }}>
        <div style={{ padding:"14px 14px 10px", borderBottom:"1px solid #f3f4f6" }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#111827", marginBottom:6 }}>The Endzone Booty Blitz</div>
          <div style={{ display:"flex", gap:4, marginBottom:8 }}>
            {["SF","PPR","IDP"].map(t => <span key={t} style={{ fontSize:10, background:"#f3f4f6", color:"#6b7280", borderRadius:4, padding:"2px 6px", fontWeight:600 }}>{t}</span>)}
          </div>
          <button onClick={syncLeague} disabled={syncStatus==="syncing"}
            style={{ fontSize:11, color:syncStatus==="synced"?"#16a34a":syncStatus==="error"?"#dc2626":"#6b7280", background:"none", border:"none", cursor:syncStatus==="syncing"?"default":"pointer", padding:0, display:"flex", alignItems:"center", gap:4 }}>
            <span style={{ display:"inline-block", animation:syncStatus==="syncing"?"spin 1s linear infinite":"none" }}>⟳</span>
            {syncStatus==="syncing" ? (syncLog || "Syncing...") :
             syncStatus==="synced" ? `Synced ✓ ${lastSync?.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}` :
             syncStatus==="error" ? "Sync failed — retry" : "Sync league"}
          </button>
        </div>

        <div style={{ padding:"8px", borderBottom:"1px solid #f3f4f6", display:"flex", gap:4 }}>
          <button style={{ flex:1, padding:"6px", borderRadius:6, border:"none", background:"#f3f4f6", cursor:"pointer", fontSize:12, fontWeight:600, color:"#111827" }}>💬 Chat</button>
          <button style={{ flex:1, padding:"6px", borderRadius:6, border:"none", background:"transparent", cursor:"pointer", fontSize:12, color:"#6b7280" }}>🔭 Explore</button>
        </div>

        <div style={{ padding:"8px", flex:1, overflowY:"auto" }}>
          {[["👤","Players"],["⭐","My Team"],["🏆","League"],["🏈","NFL Teams"],["🔄","Trade Calculator"]].map(([icon,label]) => (
            <div key={label} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, cursor:"pointer", fontSize:13, color:"#6b7280", marginBottom:2 }}>
              <span>{icon}</span>{label}
            </div>
          ))}
          <div style={{ marginTop:12, fontSize:11, fontWeight:600, color:"#9ca3af", letterSpacing:0.5, textTransform:"uppercase", padding:"0 10px 6px" }}>Chats</div>
          <div style={{ padding:"7px 10px", borderRadius:6, fontSize:13, color:"#374151", background:"#f3f4f6" }}>GM Assistant</div>
        </div>

        <div style={{ padding:"12px 14px", borderTop:"1px solid #f3f4f6", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:"50%", background:"#f97316", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff" }}>CB</div>
          <span style={{ fontSize:13, fontWeight:500, color:"#111827" }}>Carter Berry</span>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", padding:"10px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:6, background:"linear-gradient(135deg,#7c3aed,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:14 }}>A</div>
            <span style={{ fontSize:14, fontWeight:500, color:"#111827" }}>Claude Sonnet 4.6</span>
            {syncStatus==="synced" && <span style={{ fontSize:11, background:"#f0fdf4", color:"#16a34a", borderRadius:4, padding:"2px 8px" }}>Live ✓</span>}
          </div>
          <button onClick={()=>setShowApiInput(v=>!v)}
            style={{ fontSize:12, padding:"5px 12px", borderRadius:6, border:"1px solid #e5e7eb", background:apiKey?"#f0fdf4":"#fff", color:apiKey?"#16a34a":"#6b7280", cursor:"pointer" }}>
            {apiKey ? "✓ API Key Set" : "Add API Key"}
          </button>
        </div>

        {showApiInput && (
          <div style={{ background:"#fefce8", borderBottom:"1px solid #fde68a", padding:"10px 20px", display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
            <input autoFocus type="password" placeholder="sk-ant-... (free at console.anthropic.com)" value={apiKey}
              onChange={e=>saveApiKey(e.target.value)} onKeyDown={e=>e.key==="Enter"&&setShowApiInput(false)}
              style={{ flex:1, padding:"7px 10px", borderRadius:6, border:"1px solid #fcd34d", fontSize:13, outline:"none", background:"#fff" }} />
            <button onClick={()=>setShowApiInput(false)} style={{ padding:"7px 16px", borderRadius:6, border:"none", background:"#f97316", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>Save</button>
          </div>
        )}

        <div style={{ flex:1, overflowY:"auto", padding:"20px 0" }}>
          {messages.map((m,i) => (
            <div key={i} style={{ padding:"2px 20px 18px", display:"flex", gap:12, alignItems:"flex-start" }}>
              <div style={{ width:30, height:30, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, marginTop:2, color:"#fff", background:m.role==="user"?"#f97316":"linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
                {m.role==="user"?"CB":"A"}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#111827", marginBottom:5 }}>{m.role==="user"?"Carter Berry":"Claude"}</div>
                <div style={{ fontSize:14, color:"#374151", lineHeight:1.75 }}><Msg text={m.content}/></div>
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ padding:"2px 20px 18px", display:"flex", gap:12 }}>
              <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#fff", flexShrink:0, marginTop:2 }}>A</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#111827", marginBottom:8 }}>Claude</div>
                <div style={{ display:"flex", gap:5 }}>{[0,1,2].map(i=><div key={i} style={{ width:7, height:7, borderRadius:"50%", background:"#d1d5db", animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}</div>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {messages.length <= 1 && !loading && (
          <div style={{ padding:"0 20px 10px", display:"flex", gap:8, flexWrap:"wrap", flexShrink:0 }}>
            {SUGGESTIONS.map(s=>(
              <button key={s} onClick={()=>{setInput(s);taRef.current?.focus();}}
                style={{ fontSize:12, padding:"6px 14px", borderRadius:20, border:"1px solid #e5e7eb", background:"#fff", color:"#374151", cursor:"pointer" }}>{s}</button>
            ))}
          </div>
        )}

        <div style={{ padding:"10px 20px 16px", background:"#fff", borderTop:"1px solid #f3f4f6", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"flex-end", gap:8, background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:14, padding:"10px 14px" }}>
            <textarea ref={taRef} value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
              placeholder="Message Claude" rows={1}
              style={{ flex:1, border:"none", background:"transparent", outline:"none", fontSize:14, color:"#111827", resize:"none", fontFamily:"inherit", lineHeight:1.5, maxHeight:120, overflowY:"auto" }}/>
            <button onClick={send} disabled={!input.trim()||loading}
              style={{ width:32, height:32, borderRadius:8, border:"none", background:input.trim()&&!loading?"#111827":"#e5e7eb", color:"#fff", cursor:input.trim()&&!loading?"pointer":"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:16 }}>↑</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce{0%,100%{transform:translateY(0);opacity:.4}50%{transform:translateY(-4px);opacity:1}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        textarea{scrollbar-width:none}textarea::-webkit-scrollbar{display:none}*{box-sizing:border-box}
      `}</style>
    </div>
  );
}

}
