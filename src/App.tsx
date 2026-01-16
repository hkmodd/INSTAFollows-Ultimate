import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ghost, FileJson, Scan, Users, UserMinus,
  Clock, Shield, Zap, AlertCircle, Download, Search, HelpCircle, Instagram, Briefcase, Lock as LockIcon
} from "lucide-react";
import { ThreatMeter } from "./components/ThreatMeter";
import { GlassPanel, StatusIndicator, TechInput, cn } from "./components/ui";
import { useTranslation } from "./i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TraitorList, Profile } from "./components/TraitorList";
import { ProxiedAvatar } from "./components/ProxiedAvatar";
import { OnboardingWizard } from "./components/OnboardingWizard";
import "./App.css";

// ============================================
// TYPES
// ============================================

interface ScanResult {
  traitors: Profile[];
  total_followers: number;
  total_following: number;
  scan_time_ms: number;
}

type AppStatus = "OFFLINE" | "READY" | "PREPARING" | "SCANNING" | "COMPLETE";

interface ScanProgress {
  stage: "followers" | "following";
  current: number;
  total: number;
}

// ============================================
// MAIN APP
// ============================================

function App() {
  // State
  const [status, setStatus] = useState<AppStatus>("OFFLINE");
  const [integrity, setIntegrity] = useState(100);
  const [sessionPath, setSessionPath] = useState("");
  const [targetUsername, setTargetUsername] = useState("");
  const [traitors, setTraitors] = useState<Profile[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [loggedUserId, setLoggedUserId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [filter, setFilter] = useState<"all" | "personal" | "business" | "private">("all");
  const [sortOrder, setSortOrder] = useState<"default" | "alpha_asc" | "alpha_desc">("default");
  const [searchQuery, setSearchQuery] = useState("");
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { t } = useTranslation();

  // Filtered and Sorted traitors
  const filteredTraitors = useMemo(() => {
    let result = traitors.filter((p) => {
      // Search Filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.username.toLowerCase().includes(q) && !p.full_name.toLowerCase().includes(q)) {
          return false;
        }
      }

      if (filter === "all") return true;
      if (filter === "business") {
        return p.is_business_account ||
          p.is_verified ||
          p.is_professional_account ||
          (p.category_name && p.category_name.length > 0);
      }
      if (filter === "private") return p.is_private;
      return !(p.is_business_account ||
        p.is_verified ||
        p.is_professional_account ||
        (p.category_name && p.category_name.length > 0)) && !p.is_private;
    });

    if (sortOrder === "alpha_asc") {
      result.sort((a, b) => a.username.localeCompare(b.username));
    } else if (sortOrder === "alpha_desc") {
      result.sort((a, b) => b.username.localeCompare(a.username));
    }
    return result;
  }, [traitors, filter, sortOrder, searchQuery]);

  // Poll integrity every 30 seconds
  useEffect(() => {
    const poll = async () => {
      try {
        const value = await invoke<number>("get_integrity");
        setIntegrity(value);
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, []);

  // Warmup connection on mount
  useEffect(() => {
    invoke("warmup_connection").catch(() => { });
  }, []);

  // Listen for scan progress
  useEffect(() => {
    const unlisten = listen<ScanProgress>("scan_progress", (event) => {
      setScanProgress(event.payload);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Auto-Restore Session on Start
  useEffect(() => {
    const restore = async () => {
      try {
        const result = await invoke<string>("restore_session");
        console.log("Restored:", result);

        // Fetch User and Profile
        const userId = await invoke<string | null>("get_logged_user_id");
        setLoggedUserId(userId);

        try {
          const profile = await invoke<Profile>("get_current_user");
          setCurrentUser(profile);
        } catch (e) { console.warn(e); }

        setSessionPath("Session Restored");
        setStatus("READY");
        setIntegrity(100);
      } catch (err) {
        console.log("No previous session found", err);
      }
    };

    // Slight delay to ensure backend is ready
    setTimeout(restore, 500);
  }, []);

  // Handle session file selection
  const handlePickSession = useCallback(async () => {
    try {
      const file = await openFile({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (file) {
        const path = file as string;
        await loadSession(path);
      }
    } catch (e) {
      setError(String(e));
      setStatus("OFFLINE");
    }
  }, []);

  // Logic to load session and fetch profile
  const loadSession = async (path: string) => {
    setSessionPath(path);
    setIsLoading(true);
    setError("");
    try {
      const result = await invoke<string>("load_session", { path });
      console.log("Session loaded:", result);

      const userId = await invoke<string | null>("get_logged_user_id");
      setLoggedUserId(userId);

      // Fetch Current User Profile (Safe Fail)
      try {
        const profile = await invoke<Profile>("get_current_user");
        setCurrentUser(profile);
      } catch (err) {
        console.warn("Failed to fetch profile details:", err);
        // Don't fail the whole session load!
      }

      // Persist
      localStorage.setItem("saved_session_path", path);

      setStatus("READY");
    } catch (e) {
      setError(String(e));
      setStatus("OFFLINE");
      localStorage.removeItem("saved_session_path");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle scan
  const handleScan = useCallback(async () => {
    if (integrity < 20) {
      setError(t('errors.integrityLow'));
      return;
    }

    setIsLoading(true);
    setStatus("SCANNING");
    setError("");
    setScanProgress(null);

    try {
      // Determine target user ID
      let userId = loggedUserId;

      if (targetUsername.trim()) {
        // Scan a specific user
        userId = await invoke<string>("get_user_id", { username: targetUsername.trim() });
      }

      if (!userId) {
        throw new Error(t('errors.noUserId'));
      }

      // Perform scan
      const result = await invoke<ScanResult>("scan_traitors", { userId });
      setScanResult(result);
      setTraitors(result.traitors);
      setStatus("COMPLETE");

      // Update integrity after scan
      const newIntegrity = await invoke<number>("get_integrity");
      setIntegrity(newIntegrity);
    } catch (e) {
      setError(String(e));
      setStatus("READY");
    } finally {
      setIsLoading(false);
    }
  }, [integrity, loggedUserId, targetUsername]);

  // Handle unfollow - calls Instagram API
  const handleUnfollow = useCallback(async (profile: Profile) => {
    try {
      setError("");
      await invoke<boolean>("unfollow_user", { userId: profile.id });

      // Remove from traitors list
      setTraitors((prev) => prev.filter((p) => p.id !== profile.id));

      // Update integrity (unfollowing costs stealth)
      const newIntegrity = await invoke<number>("get_integrity");
      setIntegrity(newIntegrity);
    } catch (e) {
      setError(`Unfollow failed: ${e}`);
    }
  }, []);

  // Calculate percentage
  const progressPercent = scanProgress
    ? Math.min(100, Math.round((scanProgress.current / Math.max(1, scanProgress.total)) * 100))
    : 0;

  const progressLabel = scanProgress?.stage === "followers"
    ? t('status.scanningFollowers')
    : scanProgress?.stage === "following"
      ? t('status.scanningFollowing')
      : t('status.initializing');

  return (
    <div className="h-screen w-screen bg-midnight text-white font-sans overflow-hidden select-none flex">
      <OnboardingWizard
        visible={showOnboarding}
        onClose={() => {
          setShowOnboarding(false);
          localStorage.setItem("instafollows_onboarding_done", "true");
        }}
        onComplete={() => {
          setShowOnboarding(false);
          localStorage.setItem("instafollows_onboarding_done", "true");
        }}
      />
      {/* Grid Background */}
      <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />

      {/* LEFT SIDEBAR */}
      <aside className="w-[340px] shrink-0 flex flex-col gap-4 p-4 border-r border-white/5">
        {/* HEADER */}
        <header className="flex items-center justify-between mb-8 p-4 bg-black/40 border border-white/5 rounded-2xl backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-pink-500/20">
                <Ghost className="text-white" size={24} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-black animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-widest">{t('app.title')}</h1>
              <p className="text-[10px] text-cyan-400 font-bold tracking-[0.2em]">{t('app.subtitle')} v2</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOnboarding(true)}
              className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
              title={t('app.help')}
            >
              <HelpCircle size={20} />
            </button>
          </div>
        </header>

        {/* THREAT METER */}
        <GlassPanel className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-gray-500 tracking-wider flex items-center gap-2">
              <Shield size={14} className={integrity > 50 ? "text-emerald-500" : "text-red-500"} />
              {t('threat.title')}
            </h2>
            <span className={cn(
              "text-xs font-black",
              integrity > 80 ? "text-emerald-400" : integrity > 50 ? "text-amber-400" : "text-red-500 line-through decoration-2"
            )}>
              {integrity > 80 ? t('threat.optimal') : t('threat.risk')}
            </span>
          </div>

          <ThreatMeter
            integrity={integrity}
            isScanning={status === "SCANNING" || status === "PREPARING"}
          />
        </GlassPanel>

        {/* SESSION */}
        <GlassPanel className="p-4 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-gray-500 flex items-center gap-2">
              <Shield size={12} /> {t('session.title')}
            </span>
            <StatusIndicator status={status} />
          </div>

          <div className="flex gap-2 mb-3">
            <button
              onClick={() => openUrl('https://chromewebstore.google.com/detail/export-cookie-json-file-f/nmckokihipjgplolmcmjakknndddifde')}
              className="flex-1 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold hover:bg-cyan-500/20 transition-colors flex items-center justify-center gap-2"
            >
              <Download size={12} /> {t('actions.extension')}
            </button>
            <button
              onClick={() => openUrl('https://www.instagram.com/')}
              className="flex-1 py-2 rounded-lg bg-pink-500/10 border border-pink-500/30 text-pink-400 text-[10px] font-bold hover:bg-pink-500/20 transition-colors flex items-center justify-center gap-2"
            >
              <Instagram size={12} /> {t('actions.instagram')}
            </button>
          </div>

          <div
            onClick={currentUser ? undefined : handlePickSession}
            className={cn(
              "relative overflow-hidden rounded-xl transition-all group border border-white/10",
              currentUser ? "bg-black/40 p-3" : "h-14 flex items-center gap-3 px-4 bg-black/40 hover:border-cyan-500/50 cursor-pointer",
              isLoading && "opacity-50 cursor-wait"
            )}
          >
            {currentUser ? (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full border-2 border-pink-500 overflow-hidden shadow-lg shadow-pink-500/20 relative">
                  <ProxiedAvatar url={currentUser.profile_pic_url} username={currentUser.username} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{currentUser.username}</h3>
                  <p className="text-xs text-gray-400 truncate">{currentUser.full_name}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePickSession(); }}
                  className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                  title={t('session.switch')}
                >
                  <Users size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                  <FileJson className="text-gray-500 group-hover:text-cyan-500 transition-colors" size={20} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[10px] text-gray-500 font-bold">{t('session.file')}</p>
                  <p className="text-xs text-gray-300 truncate">
                    {isLoading ? t('session.loading') : sessionPath ? t('session.loaded') : t('session.select')}
                  </p>
                </div>
              </>
            )}
          </div>


          <TechInput
            label="Target Username (optional)"
            value={targetUsername}
            onChange={setTargetUsername}
            placeholder={t('filters.placeholder')}
          />
        </GlassPanel>

        {/* SCAN BUTTON */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleScan}
          disabled={status === "OFFLINE" || status === "SCANNING" || integrity < 20}
          className={cn(
            "h-16 rounded-xl font-bold text-sm tracking-widest",
            "flex items-center justify-center gap-3 transition-all",
            status === "SCANNING"
              ? "bg-amber-500/20 border border-amber-500 text-amber-500 animate-pulse"
              : integrity < 20
                ? "bg-red-500/10 border border-red-500/30 text-red-500/50 cursor-not-allowed"
                : status === "OFFLINE"
                  ? "bg-white/5 border border-white/10 text-gray-600 cursor-not-allowed"
                  : "bg-gradient-to-r from-pink-500 to-cyan-500 text-white border-0 shadow-lg glow-pink hover:shadow-xl"
          )}
        >
          {status === "SCANNING" ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Scan size={20} />
              </motion.div>
              {t('actions.scanning')}
            </>
          ) : (
            <>
              <Ghost size={20} />
              {t('actions.scan')}
            </>
          )}
        </motion.button>

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl"
            >
              <p className="text-xs text-red-400 flex items-center gap-2">
                <AlertCircle size={14} /> {error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </aside >

      {/* MAIN CONTENT */}
      < main className="flex-1 flex flex-col p-4 min-w-0" >
        {/* STATS BAR */}
        {
          scanResult && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4 mb-4"
            >
              <GlassPanel className="flex-1 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Users size={20} className="text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-black text-white">{scanResult.total_followers.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 font-bold">{t('stats.followers')}</p>
                </div>
              </GlassPanel>

              <GlassPanel className="flex-1 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                  <Download size={20} className="text-cyan-500" />
                </div>
                <div>
                  <p className="text-2xl font-black text-white">{(scanResult.total_following - (scanResult.traitors.length - traitors.length)).toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 font-bold">{t('stats.following')}</p>
                </div>
              </GlassPanel>

              <GlassPanel className="flex-1 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
                  <UserMinus size={20} className="text-pink-500" />
                </div>
                <div>
                  <p className="text-2xl font-black text-pink-400">{traitors.length.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 font-bold">{t('stats.traitors')}</p>
                </div>
              </GlassPanel>

              <GlassPanel className="flex-1 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Clock size={20} className="text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-black text-white">{(scanResult.scan_time_ms / 1000).toFixed(1)}s</p>
                  <p className="text-[10px] text-gray-500 font-bold">{t('stats.time')}</p>
                </div>
              </GlassPanel>
            </motion.div>
          )
        }

        {/* TRAITOR LIST */}
        <GlassPanel className="flex-1 flex flex-col min-h-0">
          <div className="p-4 border-b border-white/10 flex items-center justify-between gap-4">
            <h2 className="text-md font-bold text-pink-500 flex items-center gap-2">
              <Ghost size={18} /> {t('list.title')}
              <span className="ml-2 px-2 py-0.5 bg-pink-500/20 rounded-full text-xs text-pink-400">
                {filteredTraitors.length}/{traitors.length}
              </span>
            </h2>

            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('filters.search')}
                  className="bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-pink-500/50 w-32 focus:w-48 transition-all"
                />
              </div>

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as "default" | "alpha_asc" | "alpha_desc")}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-pink-500/50"
              >
                <option value="default">{t('filters.sort')}</option>
                <option value="alpha_asc">A-Z</option>
                <option value="alpha_desc">Z-A</option>
              </select>

              <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                {(["all", "personal", "business", "private"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                      filter === f
                        ? f === "all" ? "bg-white/10 text-white"
                          : f === "personal" ? "bg-pink-500/20 text-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.3)]"
                            : f === "business" ? "bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                              : "bg-amber-500/20 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                        : "text-gray-500 hover:text-gray-300"
                    )}
                  >
                    {f === "all" ? t('filters.all') :
                      f === "personal" ? (
                        <span className="flex items-center gap-1"><Users size={10} /> {t('filters.personal')}</span>
                      ) :
                        f === "business" ? (
                          <span className="flex items-center gap-1"><Briefcase size={10} /> {t('filters.business')}</span>
                        ) : (
                          <span className="flex items-center gap-1"><LockIcon size={10} /> {t('filters.private')}</span>
                        )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 relative">
            {status === "OFFLINE" ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6">
                  <Zap size={40} className="text-gray-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-400 mb-2">{t('status.loadSession')}</h3>
                <p className="text-sm text-gray-600 max-w-xs">
                  {t('status.loadInstructions')}
                </p>
              </div>
            ) : status === "READY" ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-24 h-24 rounded-full bg-pink-500/10 flex items-center justify-center mb-6 animate-pulse">
                  <Ghost size={40} className="text-pink-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{t('status.sessionLoaded')}</h3>
                <p className="text-sm text-gray-500 max-w-xs mb-8">
                  {t('status.readyToAnalyze')}
                </p>
                <button
                  onClick={handleScan}
                  className="px-8 py-3 bg-pink-500 hover:bg-pink-600 active:scale-95 text-white font-bold rounded-xl shadow-lg shadow-pink-500/20 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Ghost size={20} />
                  {t('actions.startScan')}
                </button>
              </div>
            ) : status === "SCANNING" ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16 px-12">
                <div className="mb-8 relative w-24 h-24">
                  <div className="absolute inset-0 bg-pink-500/20 rounded-full animate-pulse" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Ghost size={40} className="text-pink-500 animate-bounce" />
                  </div>
                </div>

                <h3 className="text-xl font-bold text-white mb-2">{progressLabel}</h3>

                <div className="w-full max-w-md bg-gray-800 h-4 rounded-full overflow-hidden mt-4 relative border border-white/10">
                  <motion.div
                    className="h-full bg-gradient-to-r from-pink-600 to-pink-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                  {/* Stripes animation */}
                  <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9InAiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgNDBMODAgMEg0MEwwIDQwWiIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC4xIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI3ApIi8+PC9zdmc+')] opacity-20 animate-[slide_1s_linear_infinite]" />
                </div>

                <p className="text-base font-bold text-pink-400 mt-3">
                  {scanProgress ? `${scanProgress.current.toLocaleString()} / ${scanProgress.total.toLocaleString()}` : t('status.preparing')}
                </p>
                <p className="text-xs text-gray-500 mt-2 font-mono">
                  {progressPercent}%
                </p>
              </div>
            ) : (
              <TraitorList traitors={filteredTraitors} onUnfollow={handleUnfollow} />
            )}
          </div>
        </GlassPanel>
      </main >
    </div >
  );
}

export default App;
