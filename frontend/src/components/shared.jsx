import React, { useState } from "react";
import { motion } from "framer-motion";
import { useApp, api } from "../context/AppContext";
import { Volume2, ArrowLeft, Flame, Star, Languages, Loader2, CheckCircle2, Lightbulb, TrendingUp } from "lucide-react";
import { speak } from "../lib/speech";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export const THEMES = [
  { id: "finance", en: "Finance", mr: "अर्थ" },
  { id: "tech", en: "Technology", mr: "तंत्रज्ञान" },
  { id: "videography", en: "Videography", mr: "व्हिडिओग्राफी" },
  { id: "business", en: "Business & Sales", mr: "व्यवसाय" },
  { id: "interview", en: "Interview", mr: "मुलाखत" },
];

export function Loader({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500" data-testid="loader">
      <Loader2 className="w-8 h-8 animate-spin text-[#E65F2B]" />
      <p className="text-sm">{label || "Loading…"}</p>
    </div>
  );
}

export function LangToggle() {
  const { lang, toggleLang } = useApp();
  return (
    <button onClick={toggleLang} data-testid="language-toggle" aria-label="Switch language English Marathi"
      className="flex items-center gap-2 h-11 px-4 rounded-full bg-white border-2 border-slate-200 hover:border-[#E65F2B] transition-colors font-semibold text-sm">
      <Languages className="w-4 h-4 text-[#E65F2B]" />
      <span className={lang === "mr" ? "mr" : ""}>{lang === "en" ? "English" : "मराठी"}</span>
    </button>
  );
}

export function TopBar({ onBack, title }) {
  const { user, lang } = useApp();
  return (
    <div className="sticky top-0 z-30 backdrop-blur-md bg-[#FAFAF8]/80 border-b border-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button onClick={onBack} data-testid="back-button" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <span className="font-head font-bold text-lg truncate">{title || "SpeakUp"}</span>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <div data-testid="streak-counter" className="flex items-center gap-1 h-10 px-3 rounded-full bg-white border border-slate-200">
              <Flame className={"w-4 h-4 " + (user.streak > 0 ? "text-[#E65F2B]" : "text-slate-300")} />
              <span className="font-bold text-sm">{user.streak || 0}</span>
            </div>
            <div data-testid="xp-badge" className="flex items-center gap-1 h-10 px-3 rounded-full bg-[#FEF3EC] border border-[#F8D9C7]">
              <Star className="w-4 h-4 text-[#E65F2B]" />
              <span className="font-bold text-sm text-[#C94F20]">{user.xp || 0}</span>
            </div>
            <LangToggle />
          </div>
        )}
      </div>
    </div>
  );
}

export function SpeakBtn({ text, lang = "en-US", className = "" }) {
  return (
    <button data-testid="speak-button" onClick={() => speak(text, lang)}
      className={"inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#FEF3EC] text-[#E65F2B] hover:bg-[#E65F2B] hover:text-white transition-colors shrink-0 " + className}
      aria-label="Play audio">
      <Volume2 className="w-4 h-4" />
    </button>
  );
}

// Renders passage text with every word tappable -> popover meaning
export function TappableText({ text, glossary = [] }) {
  const gmap = {};
  glossary.forEach((g) => { gmap[g.word.toLowerCase()] = g; });
  const tokens = text.split(/(\s+)/);
  return (
    <p className="text-lg sm:text-xl leading-loose text-slate-800">
      {tokens.map((tk, i) => {
        if (/^\s+$/.test(tk) || tk === "") return <span key={i}>{tk}</span>;
        const clean = tk.replace(/[.,!?;:"'()]/g, "");
        if (!clean) return <span key={i}>{tk}</span>;
        return <WordTap key={i} raw={tk} clean={clean} preset={gmap[clean.toLowerCase()]} />;
      })}
    </p>
  );
}

function WordTap({ raw, clean, preset }) {
  const [data, setData] = useState(preset || null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (data || loading) return;
    setLoading(true);
    try { const r = await api.post("/word/meaning", { word: clean }); setData(r.data); }
    catch { setData({ word: clean, en: "—", mr: "—" }); }
    setLoading(false);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className="word-tap" data-testid="reading-word-trigger" onClick={load}>{raw}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 su-card p-4" data-testid="word-meaning-popover">
        {loading && <Loader2 className="w-4 h-4 animate-spin text-[#E65F2B]" />}
        {data && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-head font-bold text-[#E65F2B]">{data.word || clean}</span>
              <SpeakBtn text={data.word || clean} />
            </div>
            <p className="text-sm text-slate-700">{data.en}</p>
            <p className="text-sm text-slate-500 mr">{data.mr}</p>
            {data.example && <p className="text-xs text-slate-400 italic pt-1">“{data.example}”</p>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ReviewCard({ review, extra }) {
  const { lang } = useApp();
  if (!review) return null;
  const rows = [
    { icon: CheckCircle2, color: "text-green-600 bg-green-50", label: "What went well · काय छान झाले", en: review.went_well, mr: review.went_well_mr },
    { icon: TrendingUp, color: "text-amber-600 bg-amber-50", label: "What to improve · काय सुधारावे", en: review.improve, mr: review.improve_mr },
    { icon: Lightbulb, color: "text-[#E65F2B] bg-[#FEF3EC]", label: "Tip · टिप", en: review.tip, mr: review.tip_mr },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="su-card p-6 space-y-4" data-testid="review-card">
      <h3 className="font-head font-bold text-xl">Review · <span className="mr">आढावा</span></h3>
      {typeof review.score === "number" && (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FEF3EC] text-[#C94F20] font-bold text-sm">Score: {review.score}/100</div>
      )}
      {extra}
      {rows.map((r, i) => r.en && (
        <div key={i} className="flex gap-3">
          <div className={"w-9 h-9 rounded-full flex items-center justify-center shrink-0 " + r.color}><r.icon className="w-5 h-5" /></div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{r.label}</p>
            <p className="text-slate-800">{r.en}</p>
            {r.mr && <p className="text-slate-500 text-sm mr">{r.mr}</p>}
          </div>
        </div>
      ))}
    </motion.div>
  );
}

export function ThemePicker({ value, onChange }) {
  const { lang } = useApp();
  return (
    <div className="flex flex-wrap gap-2" data-testid="theme-picker">
      {THEMES.map((th) => (
        <button key={th.id} onClick={() => onChange(th.id)} data-testid={`theme-${th.id}`}
          className={"h-11 px-4 rounded-full font-semibold text-sm border-2 transition-all active:scale-95 " +
            (value === th.id ? "bg-[#E65F2B] text-white border-[#E65F2B]" : "bg-white border-slate-200 hover:border-[#E65F2B] text-slate-700")}>
          <span className={lang === "mr" ? "mr" : ""}>{lang === "mr" ? th.mr : th.en}</span>
        </button>
      ))}
    </div>
  );
}

export function PrimaryBtn({ children, onClick, disabled, testid, className = "" }) {
  return (
    <button onClick={onClick} disabled={disabled} data-testid={testid}
      className={"inline-flex items-center justify-center gap-2 rounded-full bg-[#E65F2B] text-white font-semibold h-14 px-8 shadow-sm hover:bg-[#C94F20] transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed " + className}>
      {children}
    </button>
  );
}
