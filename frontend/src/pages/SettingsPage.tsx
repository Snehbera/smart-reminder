import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Copy,
  Laptop,
  LogIn,
  LogOut,
  Moon,
  Play,
  Send,
  ShieldCheck,
  Smartphone,
  Sun,
  User as UserIcon,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useState } from 'react';
import { getDeviceId } from '../lib/api';
import type { PushState } from '../lib/push';
import {
  SOUND_OPTIONS,
  getSoundPreference,
  getSoundVolume,
  isSoundEnabled,
  playNotificationSound,
  setSoundEnabled,
  setSoundPreference,
  setSoundVolume,
  type SoundType,
} from '../lib/sound';
import type { User } from '../lib/types';

interface Props {
  user: User | null;
  onOpenAuth: () => void;
  onLogout: () => Promise<void>;
  pushState: PushState;
  pushBusy: boolean;
  onEnablePush: () => Promise<void>;
  onTestPush: () => Promise<void>;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  totalReminders: number;
}

export function SettingsPage({
  user,
  onOpenAuth,
  onLogout,
  pushState,
  pushBusy,
  onEnablePush,
  onTestPush,
  theme,
  onToggleTheme,
  totalReminders,
}: Props) {
  const [copied, setCopied] = useState(false);
  const deviceId = getDeviceId();

  const [soundEnabled, setSoundEnabledState] = useState(() => isSoundEnabled());
  const [selectedSound, setSelectedSoundState] = useState<SoundType>(() => getSoundPreference());
  const [volume, setVolumeState] = useState(() => Math.round(getSoundVolume() * 100));
  const [previewingSound, setPreviewingSound] = useState<SoundType | null>(null);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabledState(next);
    setSoundEnabled(next);
    if (next) {
      void playNotificationSound(selectedSound, volume / 100);
    }
  };

  const handleSelectSound = (sound: SoundType) => {
    setSelectedSoundState(sound);
    setSoundPreference(sound);
    if (sound !== 'none' && soundEnabled) {
      setPreviewingSound(sound);
      void playNotificationSound(sound, volume / 100);
      setTimeout(() => setPreviewingSound(null), 800);
    }
  };

  const handleVolumeChange = (newVal: number) => {
    setVolumeState(newVal);
    setSoundVolume(newVal / 100);
  };

  const handlePreview = (e: React.MouseEvent, sound: SoundType) => {
    e.stopPropagation();
    setPreviewingSound(sound);
    void playNotificationSound(sound, volume / 100);
    setTimeout(() => setPreviewingSound(null), 800);
  };

  const handleCopyDevice = () => {
    navigator.clipboard.writeText(deviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl mx-auto">
      <div>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Settings & Account
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage your account, web push notifications, and device preferences
        </p>
      </div>

      {/* Account Section */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-indigo-500" />
          <span>Account & Multi-Device Sync</span>
        </h3>

        {user ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-900 dark:text-white">
                  {user.name || 'Account User'}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/60">
                  <ShieldCheck className="h-3 w-3" /> Synced
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>

            <button
              onClick={onLogout}
              className="btn-ghost text-xs text-red-600 hover:text-red-700 dark:text-red-400 !py-2 !px-3 self-start sm:self-auto"
            >
              <LogOut className="h-3.5 w-3.5 mr-1" /> Sign Out
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50/60 to-purple-50/60 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-100 dark:border-indigo-900/40 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-indigo-600 text-white shrink-0 mt-0.5">
                <Laptop className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                  Sync across phone, tablet, and computer
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  You are currently using guest mode. Creating an account lets you access and receive alerts on any browser or device.
                </p>
              </div>
            </div>
            <button
              onClick={onOpenAuth}
              className="btn-primary !py-2 !px-4 text-xs font-semibold w-full sm:w-auto"
            >
              <LogIn className="h-3.5 w-3.5 mr-1.5" /> Sign In or Create Account
            </button>
          </div>
        )}
      </div>

      {/* Push Notifications Section */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Bell className="h-4 w-4 text-indigo-500" />
          <span>Web Push Notifications</span>
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                Notification Delivery Status
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                {pushState === 'active' ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Active & Registered
                  </span>
                ) : pushState === 'connecting' ? (
                  <span className="text-indigo-600 dark:text-indigo-400">Connecting...</span>
                ) : pushState === 'denied' ? (
                  <span className="text-red-600 dark:text-red-400">Blocked in Browser Settings</span>
                ) : pushState === 'needs-install' ? (
                  <span className="text-amber-600 dark:text-amber-400">Add to Home Screen (iOS)</span>
                ) : (
                  <span className="text-slate-500">Not enabled</span>
                )}
              </span>
            </div>

            {pushState !== 'active' && pushState !== 'denied' && (
              <button
                onClick={onEnablePush}
                disabled={pushBusy}
                className="btn-primary !py-2 !px-3.5 text-xs font-semibold"
              >
                Enable Push
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Test whether pinned alerts can reach this browser right now.
            </p>
            <button
              onClick={onTestPush}
              disabled={pushBusy}
              className="btn-ghost !py-2 !px-3.5 text-xs font-medium shrink-0 flex items-center justify-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5 text-indigo-500" />
              <span>Send Test Notification</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notification Sound Section */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Notification Sounds & Chimes
            </h3>
          </div>

          <button
            type="button"
            onClick={handleToggleSound}
            role="switch"
            aria-checked={soundEnabled}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              soundEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                soundEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Play a specific audible chime when reminders trigger or alerts arrive.
        </p>

        {soundEnabled ? (
          <div className="space-y-4 pt-1">
            {/* Volume control */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              {volume === 0 ? (
                <VolumeX className="h-4 w-4 text-slate-400 shrink-0" />
              ) : (
                <Volume2 className="h-4 w-4 text-indigo-500 shrink-0" />
              )}
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Volume</span>
                  <span className="text-slate-500 font-mono text-[11px]">{volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>

            {/* Sound Tones Selector */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Choose Alert Chime
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {SOUND_OPTIONS.filter((s) => s.id !== 'none').map((opt) => {
                  const isSelected = selectedSound === opt.id;
                  const isPlaying = previewingSound === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => handleSelectSound(opt.id)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2.5 ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 ring-1 ring-indigo-500/30'
                          : 'border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-semibold ${
                              isSelected
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {opt.label}
                          </span>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {opt.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handlePreview(e, opt.id)}
                        title={`Preview ${opt.label}`}
                        className={`p-1.5 rounded-lg text-xs font-medium transition shrink-0 flex items-center gap-1 ${
                          isPlaying
                            ? 'bg-indigo-600 text-white animate-pulse'
                            : isSelected
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 hover:bg-indigo-200'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        <Play className="h-3 w-3" />
                        <span className="text-[10px] hidden sm:inline">Play</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <VolumeX className="h-4 w-4 shrink-0 text-slate-400" />
            <span>Sound alerts are turned off. Notifications will arrive silently.</span>
          </div>
        )}
      </div>

      {/* Appearance & Preferences */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Sun className="h-4 w-4 text-amber-500" />
          <span>Appearance</span>
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 block">
              Color Theme
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Switch between Light and Dark mode
            </span>
          </div>

          <button
            onClick={onToggleTheme}
            className="btn-ghost !py-2 !px-3 text-xs font-semibold flex items-center gap-2"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-4 w-4 text-amber-500" /> <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4 text-indigo-500" /> <span>Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Device & Diagnostics Info */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-slate-500" />
          <span>Device Identity & Database</span>
        </h3>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Total Configured Reminders</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{totalReminders}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Database Engine</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">Cloudflare D1 (SQLite)</span>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="truncate max-w-[200px] sm:max-w-xs">
              <span className="text-slate-500 dark:text-slate-400 block">Device UUID</span>
              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate block">
                {deviceId}
              </span>
            </div>
            <button
              onClick={handleCopyDevice}
              className="btn-ghost !p-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white"
              title="Copy Device ID"
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
