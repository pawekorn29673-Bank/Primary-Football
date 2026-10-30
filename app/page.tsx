"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle, ArrowDownToLine, CalendarDays, Check, ChevronRight,
  CircleDot, Download, Flag, RotateCcw, Settings2, Trophy, X,
} from "lucide-react";
import {
  TEAM_COLORS, calculateStandings, completedMatchCount, countPairs,
  createFixtures, emptyMatch, hasValidScore, isCounted, maxRounds,
  type Fixture, type MatchResult, type Standing,
} from "@/lib/league";
import { T } from "@/lib/ui-text";

type Tab = "matches" | "table";
type Filter = "all" | "pending" | "completed";
type LeagueData = {
  teamCount: number;
  roundCount: number;
  names: string[];
  results: Record<number, MatchResult>;
};

const STORAGE_KEY = "matchday-league-v1";
const NAME_MAX = 32;

function defaultLeague(): LeagueData {
  return { teamCount: 5, roundCount: 5, names: ["", "", "", "", ""], results: {} };
}

function sanitizeScore(value: string): string {
  return value.replace(/\D/g, "").slice(0, 2);
}

function loadLeague(): LeagueData {
  const initial = defaultLeague();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return initial;
    const obj = data as Record<string, unknown>;
    const teamCount = typeof obj.teamCount === "number" && Number.isInteger(obj.teamCount) && obj.teamCount >= 2 && obj.teamCount <= 5
      ? obj.teamCount : 5;
    const roundCount = typeof obj.roundCount === "number" && Number.isInteger(obj.roundCount) && obj.roundCount >= 1
      ? Math.min(obj.roundCount, maxRounds(teamCount)) : maxRounds(teamCount);
    const names = Array.from({ length: 5 }, (_, i) => {
      const name = Array.isArray(obj.names) ? obj.names[i] : undefined;
      return typeof name === "string" ? name.slice(0, NAME_MAX) : "";
    });
    const results: Record<number, MatchResult> = {};
    if (obj.results && typeof obj.results === "object" && !Array.isArray(obj.results)) {
      const saved = obj.results as Record<string, unknown>;
      for (let id = 1; id <= 50; id++) {
        const item = saved[String(id)];
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const r = item as Record<string, unknown>;
        results[id] = {
          homeScore: typeof r.homeScore === "string" ? sanitizeScore(r.homeScore) : "",
          awayScore: typeof r.awayScore === "string" ? sanitizeScore(r.awayScore) : "",
          completed: r.completed === true,
        };
      }
    }
    return { teamCount, roundCount, names, results };
  } catch {
    return initial;
  }
}

function teamName(names: string[], id: number): string {
  return names[id - 1]?.trim() || `${T.team} ${id}`;
}

function saveCSV(filename: string, rows: Array<Array<string | number>>): void {
  const text = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function TeamLabel({ id, name }: { id: number; name: string }) {
  const color = TEAM_COLORS[id - 1];
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black"
        style={{ backgroundColor: color.bg, color: color.text, border: `1px solid ${color.ring}` }}>{id}</span>
      <span className="min-w-0 break-words text-[15px] font-extrabold leading-snug text-[#1d3943]">{name}</span>
    </span>
  );
}

function ScoreTeam({ id, name, value, matchId, side, onScore }: {
  id: number; name: string; value: string; matchId: number;
  side: "homeScore" | "awayScore";
  onScore: (id: number, side: "homeScore" | "awayScore", value: string) => void;
}) {
  const color = TEAM_COLORS[id - 1];
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="flex min-h-[45px] w-full min-w-0 items-center justify-center gap-2 px-0.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] text-[13px] font-black sm:h-10 sm:w-10 sm:text-[16px]"
          style={{ backgroundColor: color.bg, color: color.text, border: `1px solid ${color.ring}` }}>{id}</span>
        <span title={name} className="line-clamp-2 min-w-0 break-words text-[14px] font-bold leading-snug text-[#17353d] sm:text-[16px]">{name}</span>
      </div>
      <input
        className="score-field mt-2"
        aria-label={`${T.games} ${matchId} ${T.score} ${name}`}
        autoComplete="off"
        inputMode="numeric"
        pattern="[0-9]*"
        type="text"
        maxLength={2}
        placeholder="-"
        value={value}
        onChange={(e) => onScore(matchId, side, sanitizeScore(e.target.value))}
      />
    </div>
  );
}

function MatchCard({ fixture, result, names, isNext, onScore, onCompleted }: {
  fixture: Fixture;
  result: MatchResult;
  names: string[];
  isNext: boolean;
  onScore: (id: number, side: "homeScore" | "awayScore", value: string) => void;
  onCompleted: (id: number, checked: boolean) => void;
}) {
  const missingScore = result.completed && !hasValidScore(result);
  return (
    <article id={`match-${fixture.id}`} className={`match-card scroll-mt-28 rounded-[23px] border p-3.5 sm:p-5 ${
      isNext ? "border-[#a6c994] bg-[#f6fbed] shadow-[0_7px_26px_rgba(69,109,58,.09)]" :
      result.completed ? "border-[#e0e9e6] bg-[#fbfcfb]" : "border-[#e4eaed] bg-white"
    }`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="rounded-lg bg-[#183f46] px-2.5 py-1 text-[13px] font-black tabular-nums text-white">#{String(fixture.id).padStart(2, "0")}</span>
          <span className="text-[12px] font-bold text-[#91a0a5]">{T.round} {fixture.round}</span>
        </div>
        {isNext ? <span className="inline-flex items-center gap-1 rounded-full bg-[#dcefb8] px-3 py-1 text-[11px] font-black tracking-wide text-[#386147]"><Flag size={12} /> NEXT</span> :
          result.completed && hasValidScore(result) ? <span className="rounded-full bg-[#e2f3e7] px-3 py-1 text-[11px] font-bold text-[#33815a]">{T.complete}</span> : null}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-start gap-1.5 sm:grid-cols-[minmax(0,1fr)_38px_minmax(0,1fr)] sm:gap-3">
        <ScoreTeam id={fixture.home} name={teamName(names, fixture.home)} value={result.homeScore}
          matchId={fixture.id} side="homeScore" onScore={onScore} />
        <span aria-hidden="true" className="pt-[74px] text-center text-[19px] font-black text-[#a0afb2]">:</span>
        <ScoreTeam id={fixture.away} name={teamName(names, fixture.away)} value={result.awayScore}
          matchId={fixture.id} side="awayScore" onScore={onScore} />
      </div>
      <label className={`mt-3.5 flex min-h-[49px] cursor-pointer items-center justify-between rounded-[14px] px-4 transition-colors ${
        result.completed ? "bg-[#e6f4e8] text-[#236d4c]" : "bg-[#f0f3f5] text-[#617881]"
      }`}>
        <span className="text-[14px] font-extrabold">{result.completed ? T.done : T.pending}</span>
        <input type="checkbox" className="peer sr-only" checked={result.completed}
          aria-label={`${T.games} ${fixture.id} ${T.done}`}
          onChange={(e) => onCompleted(fixture.id, e.target.checked)} />
        <span className={`flex h-7 w-7 items-center justify-center rounded-[9px] border-2 transition-all peer-focus-visible:ring-4 peer-focus-visible:ring-[#a4cd8d] ${
          result.completed ? "border-[#2e855a] bg-[#2e855a] text-white" : "border-[#b9c7ca] bg-white"
        }`}>{result.completed && <Check size={19} strokeWidth={3} />}</span>
      </label>
      {missingScore && <div className="mt-2 flex items-center gap-1.5 px-1 text-[12px] font-bold text-[#aa762d]"><AlertCircle size={14} /> {T.missing}</div>}
    </article>
  );
}

function MobileStandings({ standings, names }: { standings: Standing[]; names: string[] }) {
  return (
    <div className="grid gap-3 sm:hidden">
      {standings.map((row) => (
        <article key={row.team} className="rounded-[22px] border border-[#e3eaed] bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[17px] font-black ${row.rank === 1 ? "bg-[#dcf1b0] text-[#36583e]" : "bg-[#eef2f3] text-[#6f8490]"}`}>{row.rank}</span>
              <div className="min-w-0"><TeamLabel id={row.team} name={teamName(names, row.team)} /></div>
            </div>
            <div className="shrink-0 text-right"><div className="text-[27px] font-black leading-none tabular-nums text-[#173c43]">{row.points}</div><div className="mt-1 text-[11px] font-semibold text-[#8b9da1]">{T.points}</div></div>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-0.5 rounded-xl bg-[#f5f8f8] p-2.5">
            {[
              [T.played, row.played], [T.wins, row.wins], [T.draws, row.draws], [T.losses, row.losses],
              [T.for, row.goalsFor], [T.against, row.goalsAgainst], [T.diff, row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference],
            ].map(([label, value]) => <div key={label} className="min-w-0 text-center"><div className="text-[10px] font-bold text-[#8b9da4]">{label}</div><div className="mt-1 text-[14px] font-extrabold tabular-nums text-[#294650]">{value}</div></div>)}
          </div>
        </article>
      ))}
    </div>
  );
}

function DesktopStandings({ standings, names }: { standings: Standing[]; names: string[] }) {
  return (
    <div className="hidden overflow-hidden rounded-[24px] border border-[#e4eaed] bg-white shadow-sm sm:block">
      <table className="w-full border-collapse text-left">
        <thead className="bg-[#f3f7f6] text-[12px] font-bold text-[#71858e]"><tr>
          <th scope="col" className="px-5 py-4 text-center">#</th>
          <th scope="col" className="px-3 py-4">{T.team}</th>
          {[T.played,T.wins,T.draws,T.losses,T.for,T.against,T.diff,T.points].map((x) => <th key={x} scope="col" className="px-2 py-4 text-center">{x}</th>)}
        </tr></thead>
        <tbody>{standings.map((row) => <tr key={row.team} className="border-t border-[#e9eff0]">
          <td className="px-5 py-4 text-center text-[18px] font-black text-[#3e6470]">{row.rank}</td>
          <td className="px-3 py-4"><TeamLabel id={row.team} name={teamName(names, row.team)} /></td>
          {[row.played,row.wins,row.draws,row.losses,row.goalsFor,row.goalsAgainst,row.goalDifference,row.points].map((val,i) =>
            <td key={i} className={`px-2 py-4 text-center text-[15px] font-bold tabular-nums ${i===7 ? "bg-[#f4f9eb] text-[22px] text-[#2a6b4a]" : "text-[#46606a]"}`}>{i===6&&val>0?"+":""}{val}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  );
}

export default function Page() {
  const [league, setLeague] = useState<LeagueData>(defaultLeague);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("matches");
  const [selectedRound, setSelectedRound] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [draftTeamCount, setDraftTeamCount] = useState(5);
  const [draftRounds, setDraftRounds] = useState(5);
  const [draftNames, setDraftNames] = useState<string[]>(["", "", "", "", ""]);
  const [confirmTeamChange, setConfirmTeamChange] = useState(false);
  const [jumpTo, setJumpTo] = useState<number | null>(null);

  useEffect(() => { setLeague(loadLeague()); setHydrated(true); }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(league)); } catch { /* Storage may be disabled. */ }
  }, [league, hydrated]);
  useEffect(() => {
    if (!settingsOpen && !resetOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSettingsOpen(false); setResetOpen(false); }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [settingsOpen, resetOpen]);

  const fixtures = useMemo(() => createFixtures(league.teamCount, league.roundCount), [league.teamCount, league.roundCount]);
  const standings = useMemo(() => calculateStandings(league.teamCount, fixtures, league.results), [fixtures, league]);
  const completed = completedMatchCount(fixtures, league.results);
  const counted = fixtures.filter((f) => isCounted(league.results[f.id])).length;
  const nextMatch = fixtures.find((f) => !league.results[f.id]?.completed);
  const progress = fixtures.length ? Math.round((completed / fixtures.length) * 100) : 0;
  const filtered = fixtures.filter((f) =>
    (selectedRound === "all" || f.round === Number(selectedRound)) &&
    (filter === "all" || (filter === "completed" ? !!league.results[f.id]?.completed : !league.results[f.id]?.completed))
  );
  const shownRounds = Array.from(new Set(filtered.map((f) => f.round)));

  useEffect(() => {
    if (jumpTo === null || activeTab !== "matches") return;
    document.getElementById(`match-${jumpTo}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setJumpTo(null);
  }, [jumpTo, activeTab, selectedRound, filter]);

  const updateScore = (id: number, side: "homeScore" | "awayScore", value: string) => {
    setLeague((prev) => ({ ...prev, results: {
      ...prev.results, [id]: { ...(prev.results[id] || emptyMatch()), [side]: value },
    } }));
  };
  const updateCompleted = (id: number, checked: boolean) => {
    setLeague((prev) => ({ ...prev, results: {
      ...prev.results, [id]: { ...(prev.results[id] || emptyMatch()), completed: checked },
    } }));
  };
  const goToNext = () => {
    if (!nextMatch) return;
    setActiveTab("matches");
    setSelectedRound("all");
    setFilter("all");
    setJumpTo(nextMatch.id);
  };
  const openSettings = () => {
    setDraftTeamCount(league.teamCount);
    setDraftRounds(league.roundCount);
    setDraftNames([...league.names]);
    setConfirmTeamChange(false);
    setSettingsOpen(true);
  };
  const applySettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const changedCount = league.teamCount !== draftTeamCount;
    const hasData = Object.values(league.results).some((r) => r.completed || r.homeScore || r.awayScore);
    if (changedCount && hasData && !confirmTeamChange) { setConfirmTeamChange(true); return; }
    const teamCount = draftTeamCount;
    const roundCount = Math.max(1, Math.min(draftRounds, maxRounds(teamCount)));
    const newLength = roundCount * countPairs(teamCount);
    const results = changedCount ? {} : Object.fromEntries(Object.entries(league.results).filter(([id]) => Number(id) <= newLength));
    setLeague({ teamCount, roundCount, names: draftNames.map((n) => n.trim().slice(0, NAME_MAX)), results });
    setSelectedRound("all");
    setFilter("all");
    setSettingsOpen(false);
  };
  const resetAll = () => {
    setLeague(defaultLeague());
    setActiveTab("matches");
    setSelectedRound("all");
    setFilter("all");
    setResetOpen(false);
    setSettingsOpen(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Reset in memory is sufficient. */ }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const exportMatches = () => saveCSV("matchday-matches.csv", [
    ["Match", "Round", "Team A", "Score A", "Score B", "Team B", "Completed", "Counted"],
    ...fixtures.map((f) => { const r = league.results[f.id] || emptyMatch(); return [
      f.id, f.round, teamName(league.names, f.home), r.homeScore, r.awayScore,
      teamName(league.names, f.away), r.completed ? "Yes" : "No", isCounted(r) ? "Yes" : "No",
    ]; }),
  ]);
  const exportStandings = () => saveCSV("matchday-table.csv", [
    ["Rank", "Team", "Played", "Win", "Draw", "Loss", "GF", "GA", "GD", "Points"],
    ...standings.map((r) => [r.rank, teamName(league.names, r.team), r.played, r.wins, r.draws, r.losses,
      r.goalsFor, r.goalsAgainst, r.goalDifference, r.points]),
  ]);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#f3f6f5] pb-[105px] text-[#17353d] sm:pb-10">
      <header className="safe-top sticky top-0 z-30 border-b border-[#e4ebe9] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[65px] max-w-[1120px] items-center justify-between gap-2 px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#173e46] text-[#c4ea8e]"><CircleDot size={25} strokeWidth={2.5} /></span>
            <span className="text-[21px] font-black tracking-[-0.07em]">MATCH<span className="text-[#55a078]">DAY</span></span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={T.reset} title={T.reset} onClick={() => setResetOpen(true)} className="header-action"><RotateCcw size={20} /></button>
            <button type="button" aria-label={T.settings} title={T.settings} onClick={openSettings} className="header-action"><Settings2 size={21} /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] px-3.5 pt-5 sm:px-7 sm:pt-7">
        <nav role="tablist" aria-label="Match and Table" className="bottom-tabs safe-bottom z-40 mx-auto flex w-full max-w-[1120px] gap-2 border-t border-[#e5ebed] bg-white/95 px-4 pt-3 pb-3 shadow-[0_-4px_30px_rgba(19,53,61,.06)] backdrop-blur-xl sm:mb-7 sm:w-fit sm:rounded-2xl sm:border sm:p-1.5 sm:shadow-sm">
          <button id="tab-matches" type="button" role="tab" aria-selected={activeTab === "matches"} aria-controls="panel-matches" onClick={() => setActiveTab("matches")}
            className={`tab-button ${activeTab === "matches" ? "tab-button-active" : "tab-button-idle"}`}>
            <CalendarDays size={21} /> <span>Match</span>
          </button>
          <button id="tab-table" type="button" role="tab" aria-selected={activeTab === "table"} aria-controls="panel-table" onClick={() => setActiveTab("table")}
            className={`tab-button ${activeTab === "table" ? "tab-button-active" : "tab-button-idle"}`}>
            <Trophy size={21} /> <span>Table</span>
          </button>
        </nav>

        {activeTab === "matches" ? (
          <section id="panel-matches" role="tabpanel" aria-labelledby="tab-matches">
            <div className="mb-4 flex items-end justify-between gap-3 sm:mb-5">
              <div>
                <h1 className="text-[26px] font-black leading-tight tracking-tight sm:text-[34px]">{T.matches}</h1>
                <div className="mt-1 text-[13px] font-semibold text-[#8499a0]">{completed} / {fixtures.length} {T.done}</div>
              </div>
              <button type="button" aria-label="Download matches CSV" title="Download CSV" onClick={exportMatches} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] border border-[#e3eae9] bg-white text-[#60818b] active:scale-95"><Download size={20} /></button>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-[#e2eae7]" role="progressbar" aria-valuemin={0} aria-valuemax={fixtures.length} aria-valuenow={completed} aria-label={T.done}>
              <div className="h-full rounded-full bg-[#78ac76] transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
            <div className="mb-5 flex items-center justify-between gap-2 rounded-[19px] bg-[#183e46] p-3.5 text-white sm:px-5 sm:py-4">
              {nextMatch ? <>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black tracking-[.18em] text-[#bfdca1]">NEXT #{String(nextMatch.id).padStart(2,"0")}</div>
                  <div className="mt-1 truncate text-[15px] font-extrabold sm:text-[18px]">{teamName(league.names, nextMatch.home)} <span className="mx-1 text-[#8eaeb3]">vs</span> {teamName(league.names, nextMatch.away)}</div>
                </div>
                <button type="button" onClick={goToNext} className="flex h-11 shrink-0 items-center gap-1.5 rounded-[13px] bg-[#ceef97] px-3.5 text-[12px] font-black text-[#285640] active:scale-95 sm:px-5"><Flag size={16} /> {T.goNext}</button>
              </> : <div className="flex items-center gap-2 text-[16px] font-extrabold text-[#d1efb0]"><Check size={19} /> {T.allDone}</div>}
            </div>
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none" aria-label={T.round}>
              <button type="button" className={`round-chip ${selectedRound === "all" ? "round-chip-active" : "round-chip-idle"}`} onClick={() => setSelectedRound("all")}>{T.allRounds}</button>
              {Array.from({ length: league.roundCount }, (_, i) => i + 1).map((round) => (
                <button type="button" key={round} className={`round-chip ${selectedRound === String(round) ? "round-chip-active" : "round-chip-idle"}`} onClick={() => setSelectedRound(String(round))}>{T.round} {round}</button>
              ))}
            </div>
            <div className="mb-5 grid grid-cols-3 gap-2 rounded-[15px] bg-[#e6edeb] p-1.5">
              {(["all", "pending", "completed"] as const).map((status) => <button key={status} type="button" aria-pressed={filter === status} onClick={() => setFilter(status)}
                className={`min-h-[43px] rounded-[11px] px-2 text-[13px] font-extrabold transition ${filter === status ? "bg-white text-[#235349] shadow-sm" : "text-[#83999e]"}`}>{status === "all" ? T.all : status === "pending" ? T.pending : T.done}</button>)}
            </div>
            {filtered.length ? (
              <div className="space-y-6">
                {shownRounds.map((round) => {
                  const rows = filtered.filter((f) => f.round === round);
                  const roundMatches = fixtures.filter((f) => f.round === round);
                  const finished = roundMatches.filter((f) => league.results[f.id]?.completed).length;
                  return <section key={round} aria-label={`${T.round} ${round}`}>
                    <div className="mb-3 flex items-center justify-between gap-3 px-1">
                      <h2 className="text-[17px] font-black text-[#2a4b53]">{T.round} {round}</h2>
                      <span className="rounded-full bg-[#e4ece9] px-3 py-1 text-[12px] font-bold tabular-nums text-[#577a7b]">{finished}/{roundMatches.length}</span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
                      {rows.map((f) => <MatchCard key={f.id} fixture={f} names={league.names} result={league.results[f.id] || emptyMatch()}
                        isNext={nextMatch?.id === f.id} onScore={updateScore} onCompleted={updateCompleted} />)}
                    </div>
                  </section>;
                })}
              </div>
            ) : <div className="rounded-[22px] border border-[#e4eaed] bg-white px-5 py-12 text-center">
              <div className="font-extrabold text-[#55747a]">{T.empty}</div>
              <button type="button" className="mt-4 rounded-xl bg-[#e5f3dc] px-5 py-3 text-[14px] font-bold text-[#467a59]" onClick={() => { setSelectedRound("all"); setFilter("all"); }}>{T.allMatches}</button>
            </div>}
            {completed > counted && <div className="mt-6 flex items-center gap-2 rounded-xl bg-[#fff2db] px-4 py-3 text-[13px] font-bold text-[#956826]"><AlertCircle size={17} /> {completed-counted} {T.games}: {T.missing}</div>}
          </section>
        ) : (
          <section id="panel-table" role="tabpanel" aria-labelledby="tab-table">
            <div className="mb-5 flex items-center justify-between gap-2">
              <div><h1 className="text-[26px] font-black tracking-tight sm:text-[34px]">{T.table}</h1><span className="text-[13px] font-semibold text-[#83999f]">{counted} / {fixtures.length} {T.games}</span></div>
              <button type="button" aria-label="Download standings CSV" title="Download CSV" onClick={exportStandings} className="flex h-11 w-11 items-center justify-center rounded-[15px] border border-[#e3eae9] bg-white text-[#60818b] active:scale-95"><ArrowDownToLine size={21} /></button>
            </div>
            <MobileStandings standings={standings} names={league.names} />
            <DesktopStandings standings={standings} names={league.names} />
          </section>
        )}
      </main>

      {settingsOpen && <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }} className="sheet-overlay">
        <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="bottom-sheet">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e9eeef] bg-white px-5 py-4 sm:px-7">
            <h2 id="settings-title" className="text-[21px] font-black">{T.settings}</h2>
            <button type="button" className="sheet-close" aria-label={T.close} onClick={() => setSettingsOpen(false)}><X size={21} /></button>
          </div>
          <form className="px-5 pt-5 pb-7 sm:px-7" onSubmit={applySettings}>
            <div className="grid grid-cols-2 gap-3">
              <label className="min-w-0"><span className="mb-2 block text-[13px] font-bold text-[#617a82]">{T.teams}</span>
                <select className="setting-input w-full" value={draftTeamCount} onChange={(e) => { const n = Number(e.target.value); setDraftTeamCount(n); setDraftRounds(maxRounds(n)); setConfirmTeamChange(false); }}>
                  {[2,3,4,5].map((count) => <option value={count} key={count}>{count} {T.team}</option>)}
                </select>
              </label>
              <label className="min-w-0"><span className="mb-2 block text-[13px] font-bold text-[#617a82]">{T.roundCount}</span>
                <select className="setting-input w-full" value={draftRounds} onChange={(e) => setDraftRounds(Number(e.target.value))}>
                  {Array.from({ length: maxRounds(draftTeamCount) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {T.round}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4 rounded-xl bg-[#ebf5e6] px-4 py-3 text-center text-[13px] font-extrabold text-[#507a57]">{draftRounds * countPairs(draftTeamCount)} {T.games} / {draftTeamCount} {T.team}</div>
            <h3 className="mb-3 mt-6 text-[16px] font-black">{T.teamNames}</h3>
            <div className="space-y-3">
              {Array.from({ length: draftTeamCount }, (_, i) => i + 1).map((id) => <label key={id} className="flex min-h-[57px] items-center gap-3 rounded-[15px] border border-[#e3ebed] bg-white px-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black" style={{ background: TEAM_COLORS[id - 1].bg, color: TEAM_COLORS[id - 1].text }}>{id}</span>
                <input type="text" maxLength={NAME_MAX} aria-label={`${T.team} ${id}`} className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold outline-none placeholder:text-[#aebfc2]" placeholder={`${T.team} ${id}`}
                  value={draftNames[id - 1] || ""} onChange={(e) => setDraftNames((prev) => prev.map((s, i) => i === id-1 ? e.target.value : s))} />
              </label>)}
            </div>
            {confirmTeamChange && <div className="mt-5 rounded-xl bg-[#fff0e4] px-4 py-3 text-[13px] font-semibold text-[#af6838]">{T.confirmChange}</div>}
            <button type="submit" className="mt-6 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[16px] bg-[#183e46] px-4 text-[15px] font-black text-white">
              <Check size={19} /> {confirmTeamChange ? T.confirmSave : T.save}
            </button>
            <button type="button" className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[15px] bg-[#fff0ee] text-[14px] font-extrabold text-[#bb6458]" onClick={() => { setSettingsOpen(false); setResetOpen(true); }}><RotateCcw size={17} /> {T.resetAll}</button>
          </form>
        </section>
      </div>}

      {resetOpen && <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setResetOpen(false); }} className="sheet-overlay">
        <section role="alertdialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-body" className="bottom-sheet max-w-[440px] px-5 py-7 sm:px-7">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ffede7] text-[#bb6256]"><RotateCcw size={28} /></div>
          <h2 id="reset-title" className="text-[23px] font-black">{T.resetTitle}</h2>
          <p id="reset-body" className="mt-2 text-[14px] leading-7 text-[#7b9299]">{T.resetBody}</p>
          <div className="mt-7 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setResetOpen(false)} className="min-h-[51px] rounded-[14px] bg-[#edf2f3] text-[14px] font-extrabold text-[#57737c]">{T.cancel}</button>
            <button type="button" onClick={resetAll} className="min-h-[51px] rounded-[14px] bg-[#bd665b] text-[14px] font-extrabold text-white">{T.resetAll}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
