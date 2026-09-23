/**
 * SPlayer-Next Web 适配层 (Web Bridge)
 * 在纯浏览器环境下 Polyfill `window.electron` 与 `window.api`
 * 实现 Web Audio 播放、60FPS 实时频谱 FFT、MediaSession 系统集成与全量交互数据
 */

import { defaultSystemConfig } from "@shared/defaults/settings";
import { defaultHotkeyConfig } from "@shared/defaults/hotkeys";
import type {
  Track,
  TrackDetail,
  PlayerEvent,
  LoadOptions,
  AudioQuality,
} from "@shared/types/player";
import type { SystemConfig, LocaleCode } from "@shared/types/settings";
import {
  neteaseScrobbleThresholdMs,
  toNeteaseScrobbleTrack,
  type NeteaseScrobbleTrack,
} from "@shared/utils/neteaseScrobble";
import type { PlaylistCreateInput, PlaylistUpdateInput } from "@shared/types/playlist";
import type { HotkeyConfig, HotkeyActionId, HotkeyBinding } from "@shared/types/hotkey";
import type {
  PlayStatsSummary,
  LibraryStats,
  TopTrack,
  TopAlbum,
  TopArtist,
  DailyPlayStats,
  HourlyPlayStats,
  PlayEventInput,
  FavoriteEventInput,
} from "@shared/types/stats";


import type {
  StreamingServerConfig,
  StreamingServerInput,
  StreamingPingResult,
  StreamingConnectResult,
  StreamingLibrarySnapshot,
  StreamingSearchResult,
} from "../shared/types/streaming";
import { webDownloadManager } from "./services/download/webDownloadManager";
import { webPluginManager } from "./services/plugins/webPluginManager";
import { convertCjkText, convertCjkBatch } from "./utils/cjkConverter";
import { PITCH_SHIFTER_WORKLET_SOURCE } from "./services/pitchShifter.worklet";
import localforage from "localforage";

const statsDb = localforage.createInstance({ name: "splayer", storeName: "local_stats" });
const STATS_PLAY_EVENTS_KEY = "play_events";
const STATS_FAV_EVENTS_KEY = "fav_events";

const STREAMING_SERVERS_KEY = "splayer_streaming_servers";
const STREAMING_ACTIVE_KEY = "splayer_streaming_active_server";
const streamingLibraryListeners = new Set<(serverId: string) => void>();

export const CLIENT_SESSIONS_STORAGE_KEY = "splayer_web_client_sessions";

export const getClientSessions = (): Record<string, Record<string, string>> => {
  try {
    const raw = localStorage.getItem(CLIENT_SESSIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const saveClientSessions = (sessions: Record<string, Record<string, string>>): void => {
  try {
    localStorage.setItem(CLIENT_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch {}
};

export const updateClientSessionCookies = (patch: Record<string, Record<string, string>>): void => {
  if (!patch || Object.keys(patch).length === 0) return;
  const current = getClientSessions();
  for (const [platform, cookies] of Object.entries(patch)) {
    current[platform] = { ...(current[platform] || {}), ...cookies };
  }
  saveClientSessions(current);
};

// ─── 1. 音频合成与 Demo 数据 ───

/** 生成一个柔和的 Lo-Fi 和弦循环音频 WAV Blob URL */
function createDemoMusicWav(durationSeconds = 60): string {
  const sampleRate = 44100;
  const numChannels = 2;
  const numSamples = sampleRate * durationSeconds;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const chords = [
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [220.0, 261.63, 329.63, 392.0], // Am7
    [146.83, 174.61, 220.0, 261.63], // Dm7
    [196.0, 246.94, 293.66, 349.23], // G7
  ];
  const chordDuration = 3.0;

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const chordIndex = Math.floor((t % (chords.length * chordDuration)) / chordDuration);
    const chord = chords[chordIndex];
    const chordTime = t % chordDuration;
    const env = Math.sin((chordTime / chordDuration) * Math.PI);

    let sampleL = 0;
    let sampleR = 0;

    for (let c = 0; c < chord.length; c++) {
      const freq = chord[c];
      const tone = Math.sin(2 * Math.PI * freq * t) * 0.25;
      const harmonic = Math.sin(2 * Math.PI * freq * 2 * t) * 0.08;
      sampleL += (tone + harmonic) * env * 0.2;
      sampleR += (tone + harmonic) * env * 0.2;
    }

    const bassFreq = chord[0] / 2;
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.3 * env;
    sampleL += bass;
    sampleR += bass;

    const noise = (Math.random() * 2 - 1) * 0.005;
    sampleL += noise;
    sampleR += noise;

    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    view.setInt16(offset, clamp(sampleL) * 0x7fff, true);
    view.setInt16(offset + 2, clamp(sampleR) * 0x7fff, true);
    offset += 4;
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

let demoAudioUrl = "";
function getDemoAudioUrl(): string {
  if (!demoAudioUrl) {
    demoAudioUrl = createDemoMusicWav(90);
  }
  return demoAudioUrl;
}



const DEFAULT_QUALITY: AudioQuality = {
  sampleRate: 48000,
  channels: 2,
  bitsPerSample: 24,
  bitRate: 921000,
  codec: "FLAC (Web Hi-Res)",
};







// ─── 1.1 网易云云盘与收藏状态持久化 ───
let cloudStoreTracks: Track[] = [];
let cloudStoreSize = 0;
const cloudProgressListeners = new Set<(progress: any) => void>();
const webFileCache = new Map<string, File>();

let subscribedAlbumList: any[] = [];
let subscribedArtistList: any[] = [];
let subscribedVideoList: any[] = [];
let subscribedRadioList: any[] = [];

// ─── 2. 浏览器 Web Audio 播放引擎 ───

class WebAudioPlayerEngine {
  private audio: HTMLAudioElement;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private eventListeners: Set<(event: PlayerEvent) => void> = new Set();
  private fftRafId: number | null = null;
  private fftIntervalId: number | null = null;
  private isFftEnabled = true;
  private positionTimer: number | null = null;
  private currentTrack: Track | null = null;

  private fadeDurationMs = 200;
  private pauseOnDeviceSwitch = false;
  private isFadingOut = false;

  public repeatMode: "list" | "one" = "list";
  public shuffleMode: "on" | "off" = "off";

  public setPlayMode(repeatMode?: "list" | "one", shuffleMode?: "on" | "off"): void {
    if (repeatMode) this.repeatMode = repeatMode;
    if (shuffleMode) this.shuffleMode = shuffleMode;
  }

  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.crossOrigin = "anonymous";
    this.bindAudioEvents();
    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener("devicechange", () => {
        if (this.pauseOnDeviceSwitch && !this.audio.paused) {
          console.log("[WebAudio] Audio output device changed, pause on device switch triggered");
          this.pause();
        }
      });
    }
  }

  private compressorNode: DynamicsCompressorNode | null = null;
  private isNormalizationEnabled = false;
  private speed = 1.0;
  private pitchSync = true;
  private pitch = 0;
  private pitchNode: AudioWorkletNode | null = null;
  private pitchWorkletLoaded = false;

  // 均衡器 (10 段硬件级 BiquadFilter 链路与前级增益)
  private eqFilters: BiquadFilterNode[] = [];
  private preampNode: GainNode | null = null;
  private isEqualizerEnabled = false;
  private eqBands: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private preampGainDb = 0;

  private async loadPitchWorklet(): Promise<void> {
    if (!this.audioCtx || this.pitchWorkletLoaded) return;
    try {
      const blob = new Blob([PITCH_SHIFTER_WORKLET_SOURCE], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(blob);
      await this.audioCtx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);
      this.pitchWorkletLoaded = true;
      this.pitchNode = new AudioWorkletNode(this.audioCtx, "pitch-shifter-processor");
      this.pitchNode.port.postMessage({ pitch: this.pitchSync ? this.pitch : 0 });
      this.reconnectAudioGraph();
    } catch (e) {
      console.warn("[WebAudio] Failed to load pitch worklet:", e);
    }
  }

  private initAudioContext(): void {
    if (this.audioCtx) return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      void this.loadPitchWorklet();
      this.splitterNode = this.audioCtx.createChannelSplitter(2);
      this.analyserL = this.audioCtx.createAnalyser();
      this.analyserR = this.audioCtx.createAnalyser();
      this.analyserL.fftSize = 2048;
      this.analyserR.fftSize = 2048;
      this.analyserL.smoothingTimeConstant = 0.8;
      this.analyserR.smoothingTimeConstant = 0.8;
      this.analyserL.minDecibels = -85;
      this.analyserR.minDecibels = -85;
      this.analyserL.maxDecibels = -25;
      this.analyserR.maxDecibels = -25;
      this.analyser = this.analyserL;

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.audio.volume;

      this.compressorNode = this.audioCtx.createDynamicsCompressor();
      this.compressorNode.threshold.value = -24;
      this.compressorNode.knee.value = 30;
      this.compressorNode.ratio.value = 12;
      this.compressorNode.attack.value = 0.003;
      this.compressorNode.release.value = 0.25;

      const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      this.preampNode = this.audioCtx.createGain();
      this.preampNode.gain.value = Math.pow(10, this.preampGainDb / 20);

      this.eqFilters = EQ_FREQUENCIES.map((freq, index) => {
        const filter = this.audioCtx!.createBiquadFilter();
        if (index === 0) {
          filter.type = "lowshelf";
        } else if (index === EQ_FREQUENCIES.length - 1) {
          filter.type = "highshelf";
        } else {
          filter.type = "peaking";
          filter.Q.value = 1.4;
        }
        filter.frequency.value = freq;
        filter.gain.value = this.eqBands[index] ?? 0;
        return filter;
      });

      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);
      this.reconnectAudioGraph();

      this.startFftLoop();
    } catch (e) {
      console.warn("[WebAudio] AudioContext init failed:", e);
    }
  }

  private reconnectAudioGraph(): void {
    if (!this.sourceNode || !this.analyser || !this.gainNode || !this.audioCtx) return;
    try {
      this.sourceNode.disconnect();
      this.analyser.disconnect();
      if (this.analyserL) this.analyserL.disconnect();
      if (this.analyserR) this.analyserR.disconnect();
      if (this.splitterNode) this.splitterNode.disconnect();
      if (this.preampNode) this.preampNode.disconnect();
      for (const filter of this.eqFilters) {
        filter.disconnect();
      }
      if (this.compressorNode) this.compressorNode.disconnect();
      if (this.pitchNode) this.pitchNode.disconnect();
      this.gainNode.disconnect();

      this.sourceNode.connect(this.analyser);
      if (this.splitterNode && this.analyserL && this.analyserR) {
        try {
          this.sourceNode.connect(this.splitterNode);
          this.splitterNode.connect(this.analyserL, 0);
          this.splitterNode.connect(this.analyserR, 1);
        } catch {
          // ignore
        }
      }
      let lastNode: AudioNode = this.analyser;

      // 串接 10 段硬件级均衡器链路
      if (this.isEqualizerEnabled && this.preampNode && this.eqFilters.length > 0) {
        lastNode.connect(this.preampNode);
        lastNode = this.preampNode;
        for (const filter of this.eqFilters) {
          lastNode.connect(filter);
          lastNode = filter;
        }
      }

      // 串接响度均衡动态范围压缩器
      if (this.isNormalizationEnabled && this.compressorNode) {
        lastNode.connect(this.compressorNode);
        lastNode = this.compressorNode;
      }

      // 串接实时音调调节器
      if (this.pitchNode) {
        lastNode.connect(this.pitchNode);
        lastNode = this.pitchNode;
      }

      // 串接主输出增益与扬声器
      lastNode.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);
    } catch (e) {
      console.warn("[WebAudio] reconnectAudioGraph failed:", e);
    }
  }

  private bindAudioEvents(): void {
    this.audio.addEventListener("play", () => {
      this.notifyStatus();
      this.startPositionTimer();
      this.updateMediaSession();
      neteaseScrobble.setPlaying(true);
    });

    this.audio.addEventListener("pause", () => {
      this.notifyStatus();
      this.stopPositionTimer();
      this.updateMediaSession();
      neteaseScrobble.setPlaying(false);
    });

    this.audio.addEventListener("ended", () => {
      neteaseScrobble.end();
      this.stopPositionTimer();
      this.broadcast({ type: "ended" });
    });

    this.audio.addEventListener("timeupdate", () => {
      this.notifyPosition();
    });

    this.audio.addEventListener("volumechange", () => {
      this.notifyStatus();
    });
  }

  private startPositionTimer(): void {
    this.stopPositionTimer();
    this.positionTimer = window.setInterval(() => {
      this.notifyPosition();
    }, 200);
  }

  private stopPositionTimer(): void {
    if (this.positionTimer) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }
  }

  private startFftLoop(): void {
    if (this.fftIntervalId) return;

    const FFT_SIZE = 2048;
    const OUTPUT_BINS = 128;
    const MIN_FREQ = 80.0;
    const MAX_FREQ = 2000.0;
    const logMin = Math.log(MIN_FREQ);
    const logMax = Math.log(MAX_FREQ);

    const freqDataL = new Uint8Array(1024);
    const freqDataR = new Uint8Array(1024);

    const tick = () => {
      if (!this.isFftEnabled || this.audio.paused || !this.audioCtx) return;

      if (this.audioCtx.state === "suspended") {
        void this.audioCtx.resume();
      }

      if (this.analyserL && this.analyserR) {
        this.analyserL.getByteFrequencyData(freqDataL);
        this.analyserR.getByteFrequencyData(freqDataR);
      } else if (this.analyser) {
        this.analyser.getByteFrequencyData(freqDataL);
        freqDataR.set(freqDataL);
      }

      const sampleRate = this.audioCtx.sampleRate || 48000;
      const freqPerBin = sampleRate / FFT_SIZE;
      const minBin = Math.max(0, Math.floor(MIN_FREQ / freqPerBin));
      const maxBin = Math.min(1024, Math.ceil(MAX_FREQ / freqPerBin));

      const ldata = new Array(OUTPUT_BINS);
      const rdata = new Array(OUTPUT_BINS);

      let rHasSignal = false;
      for (let i = 0; i < OUTPUT_BINS; i++) {
        const freqLo = Math.exp(logMin + (logMax - logMin) * (i / OUTPUT_BINS));
        const freqHi = Math.exp(logMin + (logMax - logMin) * ((i + 1) / OUTPUT_BINS));

        const binLo = Math.max(minBin, Math.floor(freqLo / freqPerBin));
        const binHi = Math.min(maxBin, Math.max(binLo + 1, Math.ceil(freqHi / freqPerBin)));

        let sumL = 0;
        let sumR = 0;
        for (let j = binLo; j < binHi; j++) {
          sumL += freqDataL[j];
          sumR += freqDataR[j];
        }
        const avgL = sumL / (binHi - binLo);
        const avgR = sumR / (binHi - binLo);

        ldata[i] = Math.min(1.0, Math.max(0.0, avgL / 255));
        rdata[i] = Math.min(1.0, Math.max(0.0, avgR / 255));
        if (rdata[i] > 0.01) rHasSignal = true;
      }

      if (!rHasSignal) {
        for (let i = 0; i < OUTPUT_BINS; i++) {
          rdata[i] = ldata[i];
        }
      }

      this.broadcast({
        type: "fftData",
        data: {
          ldata,
          rdata,
        },
      });
    };

    this.fftIntervalId = window.setInterval(tick, 50);
  }

  public broadcast(event: PlayerEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[WebAudio] listener error:", err);
      }
    }
  }

  private notifyStatus(): void {
    const pos = Math.round(this.audio.currentTime * 1000);
    const dur = Math.round((this.audio.duration || 0) * 1000);
    this.broadcast({
      type: "status",
      data: {
        state: this.audio.paused ? "paused" : "playing",
        position: pos,
        duration: dur,
        volume: this.audio.volume,
        isFinished: this.audio.ended,
      },
    });
  }

  private notifyPosition(): void {
    const pos = Math.round(this.audio.currentTime * 1000);
    const dur = Math.round((this.audio.duration || 0) * 1000);
    this.broadcast({
      type: "position",
      data: {
        position: pos,
        duration: dur,
      },
    });
    neteaseScrobble.onPosition(pos);
  }

  public async load(
    source: string,
    options?: LoadOptions,
  ): Promise<{ success: boolean; data?: { detail: TrackDetail; mediaInfo: { duration: number } } }> {
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }

    let audioSrc = source;
    if (source.startsWith("demo:")) {
      audioSrc = getDemoAudioUrl();
    } else if (source.startsWith("blob:") || source.startsWith("data:") || source.startsWith("/")) {
      audioSrc = source;
    } else if (
      !source.startsWith("/api/proxy/stream") &&
      !source.includes("localhost:5173/api/proxy/stream")
    ) {
      audioSrc = `/api/proxy/stream?url=${encodeURIComponent(source)}`;
    }

    const trackId = options?.meta?.id || "";
    const detail = {
      quality: options?.meta?.quality || DEFAULT_QUALITY,
      embeddedLyric: "",
      externalLyrics: [],
    };

    this.currentTrack = options?.meta || null;

    this.audio.src = audioSrc;
    this.audio.currentTime = 0;

    const duration = options?.meta?.duration || 240000;
    neteaseScrobble.load(options?.meta || null, (options as any)?.context, duration, !!options?.autoPlay);

    if (options?.autoPlay) {
      this.audio.play().catch((e) => {
        console.log("[WebAudio] Autoplay blocked, user interaction required:", e);
      });
    }

    this.updateMediaSession();

    return {
      success: true,
      data: {
        detail,
        mediaInfo: {
          duration,
        },
      },
    };
  }

  public async play(): Promise<{ success: boolean; error?: string }> {
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
      } catch {}
    }
    if (this.audio.ended || (this.audio.duration > 0 && this.audio.currentTime >= this.audio.duration)) {
      this.audio.currentTime = 0;
    }
    this.isFadingOut = false;
    const targetVol = this.audio.volume;
    if (this.gainNode && this.audioCtx && this.fadeDurationMs > 0) {
      const now = this.audioCtx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(0.0001, now);
      this.gainNode.gain.linearRampToValueAtTime(targetVol, now + this.fadeDurationMs / 1000);
    } else if (this.gainNode) {
      this.gainNode.gain.value = targetVol;
    }
    try {
      await this.audio.play();
      this.notifyStatus();
      return { success: true };
    } catch (e: any) {
      console.warn("[WebAudio] Play failed, attempting re-decode from start:", e);
      try {
        if (this.audio.src) {
          this.audio.currentTime = 0;
          this.audio.load();
          await this.audio.play();
          this.notifyStatus();
          return { success: true };
        }
      } catch (retryErr: any) {
        console.warn("[WebAudio] Play retry failed:", retryErr);
      }
      return { success: false, error: e?.message || "PLAY_FAILED" };
    }
  }

  public pause(): { success: boolean } {
    if (this.audio.paused) return { success: true };
    if (this.gainNode && this.audioCtx && this.fadeDurationMs > 0 && !this.isFadingOut) {
      this.isFadingOut = true;
      const now = this.audioCtx.currentTime;
      const currentVol = this.gainNode.gain.value;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(currentVol, now);
      this.gainNode.gain.linearRampToValueAtTime(0.0001, now + this.fadeDurationMs / 1000);
      setTimeout(() => {
        if (this.isFadingOut) {
          this.audio.pause();
          if (this.gainNode) this.gainNode.gain.value = this.audio.volume;
          this.isFadingOut = false;
          this.notifyStatus();
        }
      }, this.fadeDurationMs);
      return { success: true };
    }
    this.audio.pause();
    this.notifyStatus();
    return { success: true };
  }

  public stop(): { success: boolean } {
    this.isFadingOut = false;
    this.audio.pause();
    this.audio.currentTime = 0;
    if (this.gainNode) this.gainNode.gain.value = this.audio.volume;
    this.notifyStatus();
    return { success: true };
  }

  public seek(positionMs: number): { success: boolean } {
    this.audio.currentTime = Math.max(0, positionMs / 1000);
    this.broadcast({
      type: "seek",
      data: { position: positionMs },
    });
    this.notifyPosition();
    return { success: true };
  }

  public setVolume(volume: number): { success: boolean } {
    this.audio.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode && !this.isFadingOut) {
      this.gainNode.gain.value = this.audio.volume;
    }
    this.notifyStatus();
    return { success: true };
  }

  public getVolume(): number {
    return this.audio.volume;
  }

  public setFadeDuration(durationMs: number): { success: boolean } {
    this.fadeDurationMs = Math.max(0, Number(durationMs) || 0);
    return { success: true };
  }

  public getFadeDuration(): number {
    return this.fadeDurationMs;
  }

  public setPauseOnDeviceSwitch(enabled: boolean): { success: boolean } {
    this.pauseOnDeviceSwitch = Boolean(enabled);
    return { success: true };
  }

  public getStatus() {
    return {
      state: this.audio.paused ? ("paused" as const) : ("playing" as const),
      position: Math.round(this.audio.currentTime * 1000),
      duration: Math.round((this.audio.duration || 0) * 1000),
      volume: this.audio.volume,
      isFinished: this.audio.ended,
    };
  }

  public onEvent(callback: (event: PlayerEvent) => void): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  public setFftEnabled(enabled: boolean): void {
    this.isFftEnabled = enabled;
  }

  public setSpeed(speed: number): { success: boolean } {
    const safe = Number.isFinite(speed) ? Math.max(0.5, Math.min(2.0, speed)) : 1.0;
    this.speed = safe;
    this.audio.playbackRate = safe;
    this.broadcast({
      type: "speed",
      data: { speed: safe },
    });
    return { success: true };
  }

  public setPitch(semitones: number): { success: boolean } {
    const safe = Number.isFinite(semitones) ? Math.max(-12, Math.min(12, semitones)) : 0;
    this.pitch = safe;
    if (!this.pitchNode && this.audioCtx && !this.pitchWorkletLoaded) {
      void this.loadPitchWorklet();
    } else if (this.pitchNode) {
      this.pitchNode.port.postMessage({ pitch: this.pitchSync ? this.pitch : 0 });
    }
    return { success: true };
  }

  public setPitchSync(on: boolean): { success: boolean } {
    this.pitchSync = on;
    if ("preservesPitch" in this.audio) {
      (this.audio as any).preservesPitch = on;
    } else if ("mozPreservesPitch" in this.audio) {
      (this.audio as any).mozPreservesPitch = on;
    } else if ("webkitPreservesPitch" in this.audio) {
      (this.audio as any).webkitPreservesPitch = on;
    }
    if (this.pitchNode) {
      this.pitchNode.port.postMessage({ pitch: on ? this.pitch : 0 });
    }
    return { success: true };
  }

  public setNormalizationEnabled(enabled: boolean): { success: boolean } {
    this.isNormalizationEnabled = enabled;
    this.reconnectAudioGraph();
    return { success: true };
  }

  public setEqualizerEnabled(enabled: boolean): { success: boolean } {
    this.isEqualizerEnabled = enabled;
    this.reconnectAudioGraph();
    return { success: true };
  }

  public setEqualizerBands(bands: number[]): { success: boolean } {
    this.eqBands = [...bands];
    if (this.eqFilters.length > 0) {
      this.eqFilters.forEach((filter, index) => {
        if (bands[index] !== undefined) {
          filter.gain.value = bands[index];
        }
      });
    }
    return { success: true };
  }

  public setPreampGain(gainDb: number): { success: boolean } {
    this.preampGainDb = gainDb;
    if (this.preampNode) {
      this.preampNode.gain.value = Math.pow(10, gainDb / 20);
    }
    return { success: true };
  }

  public async setOutputDevice(deviceId: string): Promise<{ success: boolean }> {
    try {
      if (typeof (this.audio as any).setSinkId === "function") {
        const targetId = deviceId === "default" || !deviceId ? "" : deviceId;
        await (this.audio as any).setSinkId(targetId);
      }
    } catch (err) {
      console.warn("[WebAudio] setSinkId failed:", err);
    }
    return { success: true };
  }

  private updateMediaSession(): void {
    if (!("mediaSession" in navigator) || !this.currentTrack) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.currentTrack.title,
        artist: this.currentTrack.artists.map((a) => a.name).join(", "),
        album: this.currentTrack.album?.name || "SPlayer Next",
        artwork: this.currentTrack.cover
          ? [
              { src: this.currentTrack.cover, sizes: "300x300", type: "image/jpeg" },
              { src: this.currentTrack.coverOriginal || this.currentTrack.cover, sizes: "512x512" },
            ]
          : [],
      });

      navigator.mediaSession.setActionHandler("play", () => void this.play());
      navigator.mediaSession.setActionHandler("pause", () => this.pause());
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime != null) this.seek(details.seekTime * 1000);
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        this.broadcast({ type: "prev" });
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        this.broadcast({ type: "next" });
      });
    } catch {}
  }
}

class NeteaseScrobbleService {
  private current: NeteaseScrobbleTrack | null = null;
  private playedMs = 0;
  private playSince: number | null = null;
  private fired = false;
  private lastPositionMs = 0;

  private isScrobbleEnabled(): boolean {
    try {
      const cfg = getStoredConfig();
      return Boolean(cfg.system.neteaseScrobbleEnabled);
    } catch {
      return false;
    }
  }

  private scrobbleApi(): string {
    try {
      const cfg = getStoredConfig();
      return (cfg.system.neteaseScrobbleMode || "ncbl") === "ncbl" ? "scrobble_v1" : "scrobble";
    } catch {
      return "scrobble_v1";
    }
  }

  public load(
    track: Track | null,
    context: any,
    durationMs: number,
    autoPlay: boolean,
  ): void {
    this.current = toNeteaseScrobbleTrack(track, context, durationMs);
    this.playedMs = 0;
    this.fired = false;
    this.lastPositionMs = 0;
    this.playSince = this.current && autoPlay ? Date.now() : null;
  }

  public setPlaying(playing: boolean): void {
    if (!this.current) return;
    if (playing) {
      if (this.playSince == null) this.playSince = Date.now();
    } else if (this.playSince != null) {
      this.playedMs += Date.now() - this.playSince;
      this.playSince = null;
    }
    this.tick();
  }

  public onPosition(positionMs: number): void {
    if (!this.current) return;
    if (this.fired) {
      const limit = neteaseScrobbleThresholdMs(this.current.durationSec);
      if (
        positionMs < limit &&
        (this.lastPositionMs >= limit || positionMs + 1000 < this.lastPositionMs)
      ) {
        this.playedMs = 0;
        this.fired = false;
        this.playSince = this.playSince != null ? Date.now() : null;
      }
    }
    this.lastPositionMs = positionMs;
    this.tick();
  }

  public tick(): void {
    if (!this.current || this.fired) return;
    const elapsed =
      this.playedMs + (this.playSince != null ? Date.now() - this.playSince : 0);
    const limit = neteaseScrobbleThresholdMs(this.current.durationSec);
    if (elapsed < limit) return;
    if (!this.isScrobbleEnabled()) return;

    const cookies = getClientSessions();
    if (!cookies.netease?.MUSIC_U) return;

    this.fired = true;
    const track = this.current;
    const playedSec = Math.max(1, Math.min(track.durationSec, Math.round(elapsed / 1000)));
    const api = this.scrobbleApi();

    webApi.apis
      .call("netease", api, {
        id: track.id,
        sourceid: track.sourceId,
        source: track.sourceType,
        sourceType: track.sourceType,
        resourceType: track.resourceType,
        time: playedSec,
        total: track.durationSec,
        name: track.title,
        artist: track.artist,
        bitrate: track.bitrate,
        level: track.level,
        fee: track.fee,
      })
      .then((res: any) => {
        console.log(`[WebBridge] 听歌打卡(${api})成功: ${track.title}`, res);
      })
      .catch((err: any) => {
        console.warn(`[WebBridge] 听歌打卡(${api})失败:`, err);
      });
  }

  public end(): void {
    if (this.playSince != null) {
      this.playedMs += Date.now() - this.playSince;
      this.playSince = null;
    }
    this.tick();
    this.current = null;
    this.playedMs = 0;
    this.fired = false;
    this.lastPositionMs = 0;
  }
}

const neteaseScrobble = new NeteaseScrobbleService();

const playerEngine = new WebAudioPlayerEngine();

// ─── 3. LocalStorage 配置与持久化 ───

const STORAGE_KEY_CONFIG = "splayer_web_config";
const STORAGE_KEY_PLAYLISTS = "splayer_web_playlists";

function getStoredConfig(): SystemConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) return JSON.parse(raw);
  } catch {}
  const cfg = structuredClone(defaultSystemConfig);
  // Web 初始状态默认已完成引导，直接进入主界面
  cfg.system.onboardingCompleted = true;
  return cfg;
}

function saveStoredConfig(cfg: SystemConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg));
  } catch {}
}

function getStoredPlaylists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PLAYLISTS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveStoredPlaylists(playlists: unknown[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(playlists));
  } catch {}
}

let currentHotkeyConfig: HotkeyConfig = {
  ...defaultHotkeyConfig,
  bindings: { ...defaultHotkeyConfig.bindings },
};

try {
  const savedHotkey = typeof localStorage !== "undefined" ? localStorage.getItem("hotkeys") : null;
  if (savedHotkey) {
    const parsed = JSON.parse(savedHotkey);
    if (parsed && typeof parsed === "object") {
      currentHotkeyConfig = { ...currentHotkeyConfig, ...parsed };
    }
  }
} catch (e) {}

const hotkeyConflictSubscribers = new Set<(conflicts: any[]) => void>();
const hotkeyTriggerSubscribers = new Set<(id: HotkeyActionId) => void>();

// ─── 4. 构建 window.api 完整门面 ───

const webApi = {
  config: {
    get: async (keyPath: string) => {
      const cfg = getStoredConfig() as unknown as Record<string, unknown>;
      const parts = keyPath.split(".");
      let cur: unknown = cfg;
      for (const p of parts) {
        if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[p];
        else return undefined;
      }
      return cur;
    },
    set: async (keyPath: string, value: unknown) => {
      const cfg = getStoredConfig() as unknown as Record<string, unknown>;
      const parts = keyPath.split(".");
      let cur = cfg;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
        cur = cur[p] as Record<string, unknown>;
      }
      cur[parts[parts.length - 1]] = value;
      saveStoredConfig(cfg as unknown as SystemConfig);
    },
    getAll: async () => getStoredConfig(),
    reset: async () => {
      const cfg = structuredClone(defaultSystemConfig);
      cfg.system.onboardingCompleted = true;
      saveStoredConfig(cfg);
      return getStoredConfig();
    },
    replaceAll: async (config: unknown) => {
      saveStoredConfig(config as SystemConfig);
    },
    exportToFile: async (payload: unknown) => {
      try {
        const jsonStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `splayer-settings-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { ok: true };
      } catch {
        return { ok: false, reason: "writeFailed" as const };
      }
    },
    importFromFile: async () => {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.style.display = "none";
        document.body.appendChild(input);

        input.onchange = async (e: Event) => {
          const target = e.target as HTMLInputElement;
          const file = target.files?.[0];
          document.body.removeChild(input);
          if (!file) {
            resolve({ ok: false, reason: "canceled" });
            return;
          }
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            resolve({ ok: true, data });
          } catch {
            resolve({ ok: false, reason: "parseFailed" });
          }
        };

        input.oncancel = () => {
          document.body.removeChild(input);
          resolve({ ok: false, reason: "canceled" });
        };

        input.click();
      });
    },
  },

  player: {
    load: (source: string, options?: LoadOptions) => playerEngine.load(source, options),
    play: async () => playerEngine.play(),
    pause: async () => playerEngine.pause(),
    stop: async () => playerEngine.stop(),
    seek: async (pos: number) => playerEngine.seek(pos),
    setVolume: async (vol: number) => playerEngine.setVolume(vol),
    getVolume: async () => ({ success: true, data: playerEngine.getVolume() }),
    getStatus: async () => ({ success: true, data: playerEngine.getStatus() }),
    getFftData: async () => ({ success: true, data: { ldata: [], rdata: [] } }),
    setFftEnabled: async (enabled: boolean) => {
      playerEngine.setFftEnabled(enabled);
      return { success: true };
    },
    setPauseOnDeviceSwitch: async (enabled: boolean) =>
      playerEngine.setPauseOnDeviceSwitch(enabled),
    setFadeDuration: async (duration: number) =>
      playerEngine.setFadeDuration(duration),
    getFadeDuration: async () => ({ success: true, data: playerEngine.getFadeDuration() }),
    setNormalizationEnabled: async (enabled: boolean) =>
      playerEngine.setNormalizationEnabled(enabled),
    setEqualizerEnabled: async (enabled: boolean) =>
      playerEngine.setEqualizerEnabled(enabled),
    setEqualizerBands: async (bands: number[]) =>
      playerEngine.setEqualizerBands(bands),
    setPreampGain: async (gain: number) =>
      playerEngine.setPreampGain(gain),
    setSpeed: async (speed: number) => playerEngine.setSpeed(speed),
    setPitch: async (semitones: number) => playerEngine.setPitch(semitones),
    setPitchSync: async (on: boolean) => playerEngine.setPitchSync(on),
    reinit: async () => ({ success: true }),
    getOutputDevices: async () => {
      try {
        if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioOutputs = devices.filter((d) => d.kind === "audiooutput");
          if (audioOutputs.length > 0) {
            return {
              success: true,
              data: audioOutputs.map((d, index) => ({
                id: d.deviceId || (index === 0 ? "default" : `device-${index}`),
                name: d.label || (d.deviceId === "default" ? "系统默认音频输出" : `音频输出设备 ${index + 1}`),
                isDefault: d.deviceId === "default" || index === 0,
              })),
            };
          }
        }
      } catch (err) {
        console.warn("[WebAudio] getOutputDevices error:", err);
      }
      return {
        success: true,
        data: [{ id: "default", name: "系统默认音频输出", isDefault: true }],
      };
    },
    getDefaultDeviceName: async () => ({ success: true, data: "系统默认音频输出" }),
    setOutputDevice: async (deviceId: string | null, _pauseBeforeSwitch?: boolean) => {
      await playerEngine.setOutputDevice(deviceId || "");
      return { success: true };
    },
    getSelectedDeviceName: async () => ({ success: true, data: "系统默认音频输出" }),
    getCoverRaw: async () => ({ success: false, data: null }),
    readLyricFile: async () => ({ success: false, data: null }),
    syncPlayMode: (repeatMode?: "list" | "one", shuffleMode?: "on" | "off") => {
      playerEngine.setPlayMode(repeatMode, shuffleMode);
    },
    syncLikeState: () => {},
    dispatch: (type: string, data?: any) => {
      playerEngine.broadcast({ type, data } as any);
    },
    onEvent: (callback: (event: PlayerEvent) => void) => playerEngine.onEvent(callback),
  },

  system: {
    installType: "portable" as const,
    platform: "win32" as NodeJS.Platform,
    osInfo: {
      type: "Web Browser",
      arch: "wasm/js",
      release: typeof navigator !== "undefined" ? navigator.userAgent : "Web",
    },
    toggleDevTools: async () => {},
    showInExplorer: async (filePath?: string) => {
      toast.info(`下载文件保存在系统的“下载”文件夹中${filePath ? ` (${filePath})` : ""}`);
    },
    openLogsDir: async () => "",
    setLocale: (locale: LocaleCode) => {
      localStorage.setItem("splayer_web_locale", locale);
    },
    focusMainWindow: async () => {},
    openSettings: async () => {},
    onOpenSettings: () => () => {},
    listFonts: async () => [
      "PingFang SC",
      "Microsoft YaHei",
      "Inter",
      "Segoe UI",
      "system-ui",
      "sans-serif",
    ],
    fetchRemoteBytes: async (url: string) => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        return { success: true, data: Array.from(new Uint8Array(buf)) };
      } catch {
        return { success: false, data: null };
      }
    },
    saveFile: async (data: ArrayBuffer, defaultName: string) => {
      const blob = new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true };
    },
    relaunch: async () => {
      window.location.reload();
    },
    testNetworkProxy: async () => {
      try {
        const res = await fetch("/api/proxy/stream?url=" + encodeURIComponent("https://music.163.com"), { method: "HEAD" });
        return res.ok || res.status < 500;
      } catch {
        return false;
      }
    },
    onProtocolUrl: () => () => {},
    consumePendingProtocolUrl: async () => null,
    onOpenFiles: () => () => {},
    consumePendingAudioFiles: async () => [],
    getPathForFile: (file: File) => file.name,
  },

  library: {
    scan: async () => ({ success: true }),
    cancelScan: async () => ({ success: true }),
    getTracks: async () => ({ success: true, data: [] }),
    getAlbums: async () => ({
      success: true,
      data: [],
    }),
    getArtists: async () => ({
      success: true,
      data: [],
    }),
    getAlbumTracks: async (_albumName: string) => ({
      success: true,
      data: [],
    }),
    getArtistTracks: async (_artistName: string) => ({
      success: true,
      data: [],
    }),
    getTracksByIds: async (_ids: string[]) => ({
      success: true,
      data: [],
    }),
    searchTracks: async (_query: string) => ({
      success: true,
      data: [],
    }),
    getTrackCount: async () => ({ success: true, data: 0 }),
    getRandomTrack: async () => ({ success: true, data: null }),
    getRandomTracks: async (_limit: number) => ({
      success: true,
      data: [],
    }),
    isScanning: async () => ({ success: true, data: false }),
    getScanDirs: async () => ({ success: true, data: [] }),
    addScanDir: async () => ({ success: true, data: "" }),
    removeScanDir: async () => ({ success: true }),
    deleteTracks: async () => ({ success: true, data: { deleted: 0, failed: 0 } }),
    readTags: async () => ({
      success: false,
      data: null,
    }),
    writeTags: async () => ({ success: true, data: [] }),
    pickCoverImage: async () => ({
      success: false,
      data: null,
    }),
    fetchArtistAvatar: async () => ({ success: false, data: null }),
    prefetchArtistAvatars: async () => ({ success: true, data: {} }),
    onScanProgress: () => () => {},
  },

  playlist: {
    list: async () => getStoredPlaylists(),
    get: async (id: string) => {
      const playlists = getStoredPlaylists();
      const pl = playlists.find((p: { id: string }) => p.id === id);
      if (!pl) return null;
      return {
        ...pl,
        tracks: pl.tracks || [],
      };
    },
    create: async (input: PlaylistCreateInput) => {
      const playlists = getStoredPlaylists();
      const newPl = {
        id: `pl_${Date.now()}`,
        name: input.name,
        cover: "/images/album.jpg",
        description: input.description || "",
        trackCount: 0,
        trackIds: [],
        tracks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      playlists.push(newPl);
      saveStoredPlaylists(playlists);
      return newPl;
    },
    update: async (id: string, input: PlaylistUpdateInput) => {
      const playlists = getStoredPlaylists();
      const idx = playlists.findIndex((p: { id: string }) => p.id === id);
      if (idx !== -1) {
        Object.assign(playlists[idx], input);
        saveStoredPlaylists(playlists);
        return playlists[idx];
      }
      return null;
    },
    remove: async (id: string) => {
      const playlists = getStoredPlaylists().filter((p: { id: string }) => p.id !== id);
      saveStoredPlaylists(playlists);
    },
    addTracks: async (id: string, tracks: Track[]) => {
      const playlists = getStoredPlaylists();
      const pl = playlists.find((p: { id: string }) => p.id === id);
      if (pl) {
        pl.trackIds = Array.from(new Set([...(pl.trackIds || []), ...tracks.map((t) => t.id)]));
        const existingTracks = pl.tracks || [];
        const newTracks = tracks.filter((t: Track) => !existingTracks.some((et: Track) => et.id === t.id));
        pl.tracks = [...existingTracks, ...newTracks];
        pl.trackCount = pl.trackIds.length;
        saveStoredPlaylists(playlists);
        return tracks.length;
      }
      return 0;
    },
    removeTracks: async (id: string, trackIds: string[]) => {
      const playlists = getStoredPlaylists();
      const pl = playlists.find((p: { id: string }) => p.id === id);
      if (pl) {
        pl.trackIds = (pl.trackIds || []).filter((tid: string) => !trackIds.includes(tid));
        pl.tracks = (pl.tracks || []).filter((t: Track) => !trackIds.includes(t.id));
        pl.trackCount = pl.trackIds.length;
        saveStoredPlaylists(playlists);
        return trackIds.length;
      }
      return 0;
    },
    importLegacy: async () => 0,
    clear: async () => {
      saveStoredPlaylists([]);
    },
  },

  window: {
    minimize: () => {},
    toggleMaximize: () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    },
    maximize: () => {},
    unmaximize: () => {},
    close: () => {},
    isMaximized: async () => false,
    onMaximizeChange: (_callback: (maximized: boolean) => void) => () => {},
    toggleFullscreen: () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    },
    isFullscreen: async () => !!document.fullscreenElement,
    isFullScreen: async () => !!document.fullscreenElement,
    toggleFullScreen: async () => {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen().catch(() => {});
      } else {
        await document.exitFullscreen().catch(() => {});
      }
    },
    onFullscreenChange: (callback: (fullscreen: boolean) => void) => {
      const handler = () => callback(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", handler);
      return () => document.removeEventListener("fullscreenchange", handler);
    },
    isDesktopLyricOpen: async () => false,
    isDynamicIslandOpen: async () => false,
    isTaskbarLyricOpen: async () => false,
    toggleDesktopLyric: async () => false,
    closeDesktopLyric: async () => {},
    toggleDynamicIsland: async () => false,
    closeDynamicIsland: async () => {},
    toggleTaskbarLyric: async () => false,
    closeTaskbarLyric: async () => {},
    onDesktopLyricVisibilityChange: () => () => {},
    onDynamicIslandVisibilityChange: () => () => {},
    onTaskbarLyricVisibilityChange: () => () => {},
    openDesktopLyric: async () => {},
    openDynamicIsland: async () => {},
    toggleDesktopLyricLock: async () => {},
    setDesktopLyricMouseThrough: async () => {},
    getDesktopLyricBounds: async () => null,
    setDesktopLyricBounds: async () => {},
    getDesktopLyricUnlockButtonBounds: async () => null,
    hide: () => {},
    quit: () => {},
  },

  desktopLyric: {
    onConfigChange: () => () => {},
    setHeight: async (_height: number) => {},
    setUnlockButtonBounds: (_bounds: unknown) => {},
    move: (_x: number, _y: number) => {},
    saveState: () => {},
    onCursorInside: () => () => {},
    updateConfig: async () => {},
  },
  dynamicIsland: {
    onConfigChange: () => () => {},
    move: (_x: number, _y: number) => {},
    saveState: () => {},
    resize: (_width: number) => {},
    setShape: (_width: number | null) => {},
    setHeight: (_height: number) => {},
    getMode: async () => "snapped" as const,
    onModeChange: () => () => {},
    onCursorInside: () => () => {},
    updateConfig: async () => {},
  },
  taskbarLyric: {
    setContentWidth: (_width: number) => {},
    onLayout: () => () => {},
    onConfigChange: () => () => {},
    updateConfig: async () => {},
  },

  nowPlaying: {
    update: () => {},
    requestSnapshot: async () => ({ lyricOffsetMs: 0, track: null }),
    onLyricOffsetChange: () => () => {},
    setLyricOffset: async () => {},
    onTrackChange: () => () => {},
    onLyricChange: () => () => {},
    onPositionSync: () => () => {},
  },

  plugins: {
    list: async () => webPluginManager.list(),
    getList: async () => webPluginManager.list(),
    install: async () => ({ success: false }),
    pickAndInstall: async () => null,
    installFromUrl: async () => ({ success: false }),
    uninstall: async (id: string) => webPluginManager.uninstall(id),
    toggle: async (id: string, enabled: boolean) => webPluginManager.setEnabled(id, enabled),
    setEnabled: async (id: string, enabled: boolean) => webPluginManager.setEnabled(id, enabled),
    setSetting: async (id: string, key: string, value: unknown) =>
      webPluginManager.setSetting(id, key, value),
    checkUpdate: async (id: string) => webPluginManager.checkUpdate(id),
    applyUpdate: async (id: string) => webPluginManager.applyUpdate(id),
    resolveUrl: async (params: any) => {
      try {
        const plugins = await webPluginManager.list();
        const plugin = plugins.find((p) => p.manifest.id === params.pluginId);
        const res = await fetch("/api/plugins/resolveUrl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...params,
            settings: plugin?.settingsValues || {},
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.url) return data;
          if (data && data.error && !data.ok) return data;
        }
      } catch (err) {
        console.warn("[web-bridge] server resolveUrl failed, falling back to client:", err);
      }
      return webPluginManager.resolveUrl(params);
    },
    invokeMenu: async () => {},
    matchLyric: async () => ({ ok: false }),
    matchCover: async () => ({ ok: false }),
    market: async () => [],
    onStatus: (fn: any) => webPluginManager.onStatus(fn),
    onListChange: () => () => {},
  },

  apis: {
    call: async (platform: string, name: string, params?: unknown) => {
      const cookies = getClientSessions();
      try {
        const res = await fetch("/api/apis/call", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-splayer-cookies": encodeURIComponent(JSON.stringify(cookies)),
          },
          body: JSON.stringify({ platform, name, params, cookies }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.cookiePatch) {
            updateClientSessionCookies(data.cookiePatch);
          }
          return data;
        }
        return { ok: false, error: `HTTP ${res.status}` };
      } catch (err: any) {
        console.warn(`[web-bridge] apis.call ${platform}.${name} error:`, err);
        return { ok: false, error: err?.message || "网络异常，无法连接音乐服务" };
      }
    },

    clearSession: async (platform: string) => {
      const current = getClientSessions();
      delete current[platform];
      saveClientSessions(current);
      try {
        await fetch("/api/apis/clearSession", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform }),
        });
      } catch {}
      return true;
    },

    openLoginWeb: async (platform: string = "netease") => {
      try {
        const res = await fetch("/api/apis/openLoginWeb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.cookiePatch) {
            updateClientSessionCookies(data.cookiePatch);
          }
          if (data.ok) {
            return { ok: true };
          }
          if (data.code === "NO_LOCAL_BROWSER") {
            window.open("https://music.163.com/#/login", "_blank");
            return {
              ok: false,
              error: "当前服务端环境无法调起本地窗口。已在新标签页为您打开网易云登录页，登录后复制 MUSIC_U，在「手动输入 Cookie」中粘贴即可登录",
            };
          }
          return { ok: false, error: data.error || "canceled" };
        }
        return { ok: false, error: `HTTP ${res.status}` };
      } catch (err: any) {
        console.warn(`[web-bridge] openLoginWeb ${platform} error:`, err);
        return { ok: false, error: err?.message || "canceled" };
      }
    },

    setCookie: async (platform: string, raw: string) => {
      const cookies = getClientSessions();
      try {
        const res = await fetch("/api/apis/setCookie", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-splayer-cookies": encodeURIComponent(JSON.stringify(cookies)),
          },
          body: JSON.stringify({ platform, raw, cookies }),
        });
        const data = await res.json();
        if (data.ok && data.cookiePatch) {
          updateClientSessionCookies(data.cookiePatch);
        }
        return data;
      } catch (err: any) {
        return { ok: false, error: err?.message || "设置 Cookie 失败" };
      }
    },
  },

  cloud: {
    pickSongs: async () => {
      return new Promise<Array<{ path: string; name: string; size: number }>>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "audio/*";
        input.multiple = true;
        input.style.display = "none";
        document.body.appendChild(input);

        let resolved = false;
        const cleanup = () => {
          if (input.parentNode) input.parentNode.removeChild(input);
          window.removeEventListener("focus", handleCancel);
        };

        const handleCancel = () => {
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              cleanup();
              resolve([]);
            }
          }, 600);
        };

        window.addEventListener("focus", handleCancel, { once: true });

        input.onchange = () => {
          resolved = true;
          cleanup();
          const files = Array.from(input.files || []);
          const picked = files.map((file) => {
            const id = `web_file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            webFileCache.set(id, file);
            return {
              path: id,
              name: file.name.replace(/\.[^/.]+$/, ""),
              size: file.size,
            };
          });
          resolve(picked);
        };

        input.click();
      });
    },
    uploadSong: async (filePath: string, uploadId: string) => {
      const file = webFileCache.get(filePath);
      const fileName = file ? file.name.replace(/\.[^/.]+$/, "") : filePath || "未知音频";
      const fileSize = file ? file.size : 15 * 1024 * 1024;

      cloudProgressListeners.forEach((cb) =>
        cb({ uploadId, stage: "reading", loaded: 0, total: fileSize })
      );
      await new Promise((r) => setTimeout(r, 250));

      cloudProgressListeners.forEach((cb) =>
        cb({ uploadId, stage: "uploading", loaded: Math.floor(fileSize * 0.45), total: fileSize })
      );
      await new Promise((r) => setTimeout(r, 350));

      cloudProgressListeners.forEach((cb) =>
        cb({ uploadId, stage: "uploading", loaded: Math.floor(fileSize * 0.9), total: fileSize })
      );
      await new Promise((r) => setTimeout(r, 250));

      cloudProgressListeners.forEach((cb) =>
        cb({ uploadId, stage: "finishing", loaded: fileSize, total: fileSize })
      );
      await new Promise((r) => setTimeout(r, 150));

      const newTrackId = `cloud_up_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const audioBlobUrl = file ? URL.createObjectURL(file) : getDemoAudioUrl();
      const newTrack: Track = {
        id: newTrackId,
        source: "netease",
        title: fileName,
        artists: [{ id: "6452", name: "未知歌手" }],
        album: { id: "album_cloud", name: "我的音乐云盘", cover: "/images/album.jpg" },
        duration: 210000,
        cover: "/images/album.jpg",
        coverOriginal: "/images/album.jpg",
        cloud: true,
        path: audioBlobUrl,
      };

      cloudStoreTracks.unshift(newTrack);
      cloudStoreSize += fileSize;

      return { success: true, songId: newTrackId };
    },
    upload: async () => {},
    getProgress: async () => null,
    onUploadProgress: (callback: (progress: any) => void) => {
      cloudProgressListeners.add(callback);
      return () => {
        cloudProgressListeners.delete(callback);
      };
    },
    getTasks: async () => [],
  },

  lyrics: {
    matchById: async (platform: string, id: string) => {
      try {
        const res = await fetch("/api/lyrics/matchById", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, id }),
        });
        return await res.json();
      } catch (err: any) {
        return { ok: false, error: err?.message || "获取歌词失败" };
      }
    },
    matchByQuery: async (platform: string, track: unknown) => {
      try {
        const res = await fetch("/api/lyrics/matchByQuery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, track }),
        });
        return await res.json();
      } catch (err: any) {
        return { ok: false, error: err?.message || "匹配歌词失败" };
      }
    },
    fetchTTMLOverlay: async (track: unknown, platform: string) => {
      try {
        const res = await fetch("/api/lyrics/fetchTTMLOverlay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track, platform }),
        });
        return await res.json();
      } catch (err: any) {
        return { ok: false, error: err?.message || "获取 TTML 逐字歌词失败" };
      }
    },
    matchLocalTTML: async () => ({ ok: false, error: "Web 环境不支持本地 TTML 库" }),
    pickLyricRepoDir: async () => null,
  },

  opencc: {
    convert: async (text: string, mode = "s2t") => convertCjkText(text, mode),
    convertBatch: async (texts: string[], mode = "s2t") => convertCjkBatch(texts, mode),
  },

  comments: {
    sources: async () => {
      try {
        const res = await fetch("/api/comments/sources");
        const json = await res.json();
        return json?.ok && Array.isArray(json.data) ? json.data : [];
      } catch (err) {
        console.warn("[web-bridge] fetch comment sources error:", err);
        return [];
      }
    },
    get: async (query: unknown) => {
      try {
        const res = await fetch("/api/comments/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(query),
        });
        return await res.json();
      } catch (err: any) {
        return { ok: false, error: err?.message || "获取评论失败" };
      }
    },
    getSongComments: async (query: unknown) => {
      try {
        const res = await fetch("/api/comments/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(query),
        });
        return await res.json();
      } catch (err: any) {
        return { ok: false, error: err?.message || "获取评论失败" };
      }
    },
  },

  download: {
    start: async (req: any) => webDownloadManager.start(req),
    startMany: async (reqs: any) => webDownloadManager.startMany(reqs),
    cancel: async (taskId: string) => webDownloadManager.cancel(taskId),
    retry: async (req: any) => webDownloadManager.retry(req),
    remove: async (taskId: string) => webDownloadManager.remove(taskId),
    clearFinished: async () => webDownloadManager.clearFinished(),
    list: async () => webDownloadManager.list(),
    pickDir: async () => ({ ok: false, dir: "" }),
    getDir: async () => "系统默认下载文件夹",
    resetDir: async () => "系统默认下载文件夹",
    submitResolution: async () => {},
    failResolution: async () => {},
    onProgress: (fn: any) => webDownloadManager.onProgress(fn),
    onState: (fn: any) => webDownloadManager.onState(fn),
    onResolve: () => () => {},
    addTask: async (req: any) => webDownloadManager.start(req),
    getTasks: async () => webDownloadManager.list(),
  },

  theme: {
    pickBackgroundImage: async () => {
      return new Promise<string | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        };
        input.click();
      });
    },
    clearBackgroundImages: async () => {},
  },

  cache: {
    getStats: async () => {
      let storageUsage = 1024 * 1024 * 6;
      try {
        if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (estimate.usage) storageUsage = estimate.usage;
        }
      } catch {}
      return [
        { id: "local_cache", kind: "file" as const, path: "浏览器内部存储 (IndexedDB / LocalStorage)", size: storageUsage },
      ];
    },
    clear: async () => {
      try {
        await localforage.clear();
        if (typeof window !== "undefined" && "caches" in window) {
          const keys = await window.caches.keys();
          for (const key of keys) await window.caches.delete(key);
        }
      } catch (e) {
        console.warn("[Cache] clear failed:", e);
      }
    },
    clearAllByKind: async () => {
      try {
        await localforage.clear();
        if (typeof window !== "undefined" && "caches" in window) {
          const keys = await window.caches.keys();
          for (const key of keys) await window.caches.delete(key);
        }
      } catch (e) {
        console.warn("[Cache] clearAllByKind failed:", e);
      }
    },
    getDir: async () => "浏览器内部存储 (IndexedDB / LocalStorage)",
    pickDir: async () => ({ ok: false, dir: "" }),
    resetDir: async () => "浏览器内部存储",
    song: {
      lookup: async () => null,
      fetch: async () => null,
      cancel: async () => {},
    },
  },

  stats: {
    recordPlay: async (event: PlayEventInput) => {
      if (!event?.track?.id || !event.listenedMs || event.listenedMs < 1000) return;
      try {
        const events: PlayEventInput[] = (await statsDb.getItem(STATS_PLAY_EVENTS_KEY)) || [];
        events.unshift(event);
        if (events.length > 5000) events.length = 5000;
        await statsDb.setItem(STATS_PLAY_EVENTS_KEY, events);
      } catch (e) {
        console.warn("[web-bridge] recordPlay error:", e);
      }
    },

    recordFavorite: async (event: FavoriteEventInput) => {
      if (!event?.track?.id) return;
      try {
        const events: FavoriteEventInput[] = (await statsDb.getItem(STATS_FAV_EVENTS_KEY)) || [];
        events.unshift(event);
        if (events.length > 2000) events.length = 2000;
        await statsDb.setItem(STATS_FAV_EVENTS_KEY, events);
      } catch (e) {
        console.warn("[web-bridge] recordFavorite error:", e);
      }
    },

    getStatsSummary: async (): Promise<PlayStatsSummary> => {
      let events: PlayEventInput[] = [];
      let favEvents: FavoriteEventInput[] = [];
      try {
        events = (await statsDb.getItem(STATS_PLAY_EVENTS_KEY)) || [];
        favEvents = (await statsDb.getItem(STATS_FAV_EVENTS_KEY)) || [];
      } catch {}

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const sevenDaysAgo = Date.now() - 7 * 86400000;
      const fourteenDaysAgo = Date.now() - 14 * 86400000;

      let todayListenedMs = 0;
      let weekListenedMs = 0;
      let lastWeekListenedMs = 0;
      let totalListenedMs = 0;
      let weekPlayCount = 0;
      const totalPlayCount = events.length;

      const daySet = new Set<string>();

      for (const ev of events) {
        const ms = ev.listenedMs || 0;
        const t = ev.startedAt || 0;
        totalListenedMs += ms;

        if (t >= startOfToday) {
          todayListenedMs += ms;
        }
        if (t >= sevenDaysAgo) {
          weekListenedMs += ms;
          weekPlayCount++;
        } else if (t >= fourteenDaysAgo) {
          lastWeekListenedMs += ms;
        }

        if (t > 0) {
          daySet.add(new Date(t).toISOString().slice(0, 10));
        }
      }

      let weekFavoriteAdds = 0;
      for (const fav of favEvents) {
        if (fav.action === "add") {
          weekFavoriteAdds++;
        }
      }

      let streakDays = 0;
      let checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      while (true) {
        const dateStr = checkDate.toISOString().slice(0, 10);
        if (daySet.has(dateStr)) {
          streakDays++;
          checkDate = new Date(checkDate.getTime() - 86400000);
        } else {
          if (streakDays === 0) {
            checkDate = new Date(checkDate.getTime() - 86400000);
            const yesterdayStr = checkDate.toISOString().slice(0, 10);
            if (daySet.has(yesterdayStr)) {
              streakDays++;
              checkDate = new Date(checkDate.getTime() - 86400000);
              continue;
            }
          }
          break;
        }
      }

      return {
        todayListenedMs,
        weekListenedMs,
        lastWeekListenedMs,
        totalListenedMs,
        weekPlayCount,
        totalPlayCount,
        weekFavoriteAdds,
        streakDays,
      };
    },

    getLibraryStats: async (): Promise<LibraryStats> => {
      let events: PlayEventInput[] = [];
      try {
        events = (await statsDb.getItem(STATS_PLAY_EVENTS_KEY)) || [];
      } catch {}

      const trackMap = new Map<string, Track>();
      const albumSet = new Set<string>();
      const artistSet = new Set<string>();
      let totalDurationMs = 0;
      const codecCounts: Record<string, number> = {};

      for (const ev of events) {
        const tr = ev.track;
        if (!tr?.id) continue;
        const key = `${tr.source}:${tr.id}`;
        if (!trackMap.has(key)) {
          trackMap.set(key, tr);
          totalDurationMs += tr.duration || 0;
          if (tr.album?.name || tr.album?.id) {
            albumSet.add(tr.album.name || String(tr.album.id));
          }
          for (const ar of tr.artists || []) {
            if (ar.name) artistSet.add(ar.name);
          }
          const codec = tr.format || "FLAC";
          codecCounts[codec] = (codecCounts[codec] || 0) + 1;
        }
      }

      const codecs = Object.entries(codecCounts)
        .map(([codec, count]) => ({ codec, count }))
        .sort((a, b) => b.count - a.count);

      return {
        trackCount: trackMap.size,
        albumCount: albumSet.size,
        artistCount: artistSet.size,
        totalDurationMs,
        totalFileSize: trackMap.size * 25 * 1024 * 1024,
        codecs,
      };
    },

    getPlayHistoryDaily: async (days: number): Promise<DailyPlayStats[]> => {
      let events: PlayEventInput[] = [];
      try {
        events = (await statsDb.getItem(STATS_PLAY_EVENTS_KEY)) || [];
      } catch {}

      const formatLocalDate = (d: Date): string =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      const counts: Record<string, number> = {};
      for (const ev of events) {
        if (!ev.startedAt) continue;
        const dStr = formatLocalDate(new Date(ev.startedAt));
        counts[dStr] = (counts[dStr] || 0) + 1;
      }

      const list: DailyPlayStats[] = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayStr = formatLocalDate(d);
        list.push({
          day: dayStr,
          playCount: counts[dayStr] || 0,
        });
      }
      return list;
    },

    getPlayHistoryHourly: async (): Promise<HourlyPlayStats[]> => {
      let events: PlayEventInput[] = [];
      try {
        events = (await statsDb.getItem(STATS_PLAY_EVENTS_KEY)) || [];
      } catch {}

      const counts = new Array(24).fill(0);
      for (const ev of events) {
        if (!ev.startedAt) continue;
        const hour = new Date(ev.startedAt).getHours();
        if (hour >= 0 && hour < 24) {
          counts[hour]++;
        }
      }
      return counts.map((playCount, hour) => ({ hour, playCount }));
    },

    getTopTracks: async (limit: number): Promise<TopTrack[]> => {
      let events: PlayEventInput[] = [];
      try {
        events = (await statsDb.getItem(STATS_PLAY_EVENTS_KEY)) || [];
      } catch {}

      const map = new Map<string, { track: Track; playCount: number }>();
      for (const ev of events) {
        const tr = ev.track;
        if (!tr?.id) continue;
        const key = `${tr.source}:${tr.id}`;
        const existing = map.get(key);
        if (existing) {
          existing.playCount++;
        } else {
          map.set(key, { track: tr, playCount: 1 });
        }
      }
      return Array.from(map.values())
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, limit);
    },

    getTopAlbums: async (limit: number): Promise<TopAlbum[]> => {
      let events: PlayEventInput[] = [];
      try {
        events = (await statsDb.getItem(STATS_PLAY_EVENTS_KEY)) || [];
      } catch {}

      const map = new Map<string, { track: Track; playCount: number }>();
      for (const ev of events) {
        const tr = ev.track;
        if (!tr?.album?.name) continue;
        const key = `${tr.source}:${tr.album.name}`;
        const existing = map.get(key);
        if (existing) {
          existing.playCount++;
        } else {
          map.set(key, { track: tr, playCount: 1 });
        }
      }
      return Array.from(map.values())
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, limit);
    },

    getTopArtists: async (limit: number): Promise<TopArtist[]> => {
      let events: PlayEventInput[] = [];
      try {
        events = (await statsDb.getItem(STATS_PLAY_EVENTS_KEY)) || [];
      } catch {}

      const map = new Map<string, { artist: any; track: Track; playCount: number }>();
      for (const ev of events) {
        const tr = ev.track;
        const ar = tr?.artists?.[0];
        if (!ar?.name) continue;
        const key = `${tr.source}:${ar.name}`;
        const existing = map.get(key);
        if (existing) {
          existing.playCount++;
        } else {
          map.set(key, { artist: ar, track: tr, playCount: 1 });
        }
      }
      return Array.from(map.values())
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, limit);
    },

    recordPlayEvent: async () => {},
    recordFavoriteEvent: async () => {},
    getOverview: async () => {
      const summary = await webApi.stats.getStatsSummary();
      return {
        totalPlayTime: Math.round(summary.totalListenedMs / 1000),
        totalPlays: summary.totalPlayCount,
        favoriteCount: summary.weekFavoriteAdds,
      };
    },
    getRecentPlays: async () => [],
  },

  hotkey: {
    getAll: async (): Promise<HotkeyConfig> => ({ ...currentHotkeyConfig }),
    getConflicts: async () => [],
    onConflicts: (cb: (conflicts: any[]) => void) => {
      hotkeyConflictSubscribers.add(cb);
      return () => hotkeyConflictSubscribers.delete(cb);
    },
    onTrigger: (cb: (id: HotkeyActionId) => void) => {
      hotkeyTriggerSubscribers.add(cb);
      return () => hotkeyTriggerSubscribers.delete(cb);
    },
    set: async (id: HotkeyActionId, binding: HotkeyBinding): Promise<HotkeyConfig> => {
      currentHotkeyConfig.bindings[id] = binding;
      try {
        localStorage.setItem("hotkeys", JSON.stringify(currentHotkeyConfig));
      } catch (e) {}
      return { ...currentHotkeyConfig };
    },
    reset: async (id?: HotkeyActionId): Promise<HotkeyConfig> => {
      if (id && defaultHotkeyConfig.bindings[id]) {
        currentHotkeyConfig.bindings[id] = { ...defaultHotkeyConfig.bindings[id] };
      } else if (!id) {
        currentHotkeyConfig = {
          ...defaultHotkeyConfig,
          bindings: { ...defaultHotkeyConfig.bindings },
        };
      }
      try {
        localStorage.setItem("hotkeys", JSON.stringify(currentHotkeyConfig));
      } catch (e) {}
      return { ...currentHotkeyConfig };
    },
    setGlobalEnabled: async (enabled: boolean): Promise<HotkeyConfig> => {
      currentHotkeyConfig.globalEnabled = enabled;
      try {
        localStorage.setItem("hotkeys", JSON.stringify(currentHotkeyConfig));
      } catch (e) {}
      return { ...currentHotkeyConfig };
    },
    probe: async (_accelerator: string): Promise<boolean> => true,
    getBindings: async () => [],
    saveBinding: async () => true,
    resetBindings: async () => [],
    detectConflict: async () => null,
  },

  recognition: {
    isSupported: async () => false,
    start: async () => {},
    stop: async () => {},
    cancel: async () => {},
    submitPcm: async () => {},
    onEvent: () => () => {},
  },

  lastfm: {
    connect: async () => {},
    cancelConnect: async () => {},
    disconnect: async () => {},
    getStatus: async () => ({ authenticated: false }),
    love: async () => {},
    scrobble: async () => {},
  },

  externalApi: {
    getStatus: async () => ({
      listening: false,
      allowLan: false,
      host: null,
      port: null,
      error: null,
    }),
    restart: async () => ({
      listening: false,
      allowLan: false,
      host: null,
      port: null,
      error: null,
    }),
    onStatus: () => () => {},
  },

  mcp: {
    getStatus: async () => ({ connected: false, tools: [] }),
    restart: async () => ({ connected: false, tools: [] }),
    getClientConfigParams: async () => ({}),
    detectAgents: async () => [],
    injectAgentConfig: async () => false,
    onStatus: () => () => {},
  },

  aiModel: {
    list: async () => [],
    save: async () => true,
    remove: async () => true,
    setActive: async () => true,
    getConfig: async () => null,
    saveConfig: async () => true,
  },

  update: {
    check: async () => null,
    download: async () => {},
    install: async () => {},
    openDownloadPage: async () => {},
    onEvent: () => () => {},
  },

  streaming: {
    loadServers: async (): Promise<{ servers: StreamingServerConfig[]; activeServerId: string | null }> => {
      let servers: StreamingServerConfig[] = [];
      try {
        const raw = localStorage.getItem(STREAMING_SERVERS_KEY);
        if (raw) {
          servers = JSON.parse(raw);
        }
      } catch {
        servers = [];
      }
      if (!Array.isArray(servers)) {
        servers = [];
      }
      let activeServerId = localStorage.getItem(STREAMING_ACTIVE_KEY);
      if (!activeServerId || !servers.some((s) => s.id === activeServerId)) {
        activeServerId = servers[0]?.id ?? null;
        if (activeServerId) {
          try {
            localStorage.setItem(STREAMING_ACTIVE_KEY, activeServerId);
          } catch {}
        }
      }
      return { servers, activeServerId };
    },

    addServer: async (input: StreamingServerInput): Promise<StreamingServerConfig> => {
      const { servers } = await (window.api?.streaming?.loadServers ? window.api.streaming.loadServers() : webApi.streaming.loadServers());
      const id = `streaming-server-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newServer: StreamingServerConfig = {
        id,
        name: input.name?.trim() || `${input.type} 服务器`,
        type: input.type,
        url: input.url?.trim() || "",
        username: input.username?.trim() || "",
        hasPassword: Boolean(input.password),
        lastConnected: Date.now(),
      };
      const nextServers = [...servers, newServer];
      try {
        localStorage.setItem(STREAMING_SERVERS_KEY, JSON.stringify(nextServers));
      } catch {}
      return newServer;
    },

    updateServer: async (serverId: string, input: StreamingServerInput): Promise<StreamingServerConfig> => {
      const { servers } = await (window.api?.streaming?.loadServers ? window.api.streaming.loadServers() : webApi.streaming.loadServers());
      const idx = servers.findIndex((s) => s.id === serverId);
      const updated: StreamingServerConfig = {
        id: serverId,
        name: input.name?.trim() || (idx >= 0 ? servers[idx].name : `${input.type} 服务器`),
        type: input.type,
        url: input.url?.trim() || (idx >= 0 ? servers[idx].url : ""),
        username: input.username?.trim() || (idx >= 0 ? servers[idx].username : ""),
        hasPassword: input.password ? true : (idx >= 0 ? servers[idx].hasPassword : false),
        lastConnected: Date.now(),
      };
      if (idx >= 0) {
        servers[idx] = updated;
      } else {
        servers.push(updated);
      }
      try {
        localStorage.setItem(STREAMING_SERVERS_KEY, JSON.stringify(servers));
      } catch {}
      return updated;
    },

    removeServer: async (serverId: string): Promise<void> => {
      const { servers, activeServerId } = await (window.api?.streaming?.loadServers ? window.api.streaming.loadServers() : webApi.streaming.loadServers());
      const nextServers = servers.filter((s) => s.id !== serverId);
      try {
        localStorage.setItem(STREAMING_SERVERS_KEY, JSON.stringify(nextServers));
        if (activeServerId === serverId) {
          const nextActive = nextServers[0]?.id ?? null;
          if (nextActive) {
            localStorage.setItem(STREAMING_ACTIVE_KEY, nextActive);
          } else {
            localStorage.removeItem(STREAMING_ACTIVE_KEY);
          }
        }
      } catch {}
    },

    setActiveServer: async (serverId: string | null): Promise<void> => {
      try {
        if (serverId) {
          localStorage.setItem(STREAMING_ACTIVE_KEY, serverId);
        } else {
          localStorage.removeItem(STREAMING_ACTIVE_KEY);
        }
      } catch {}
    },

    testConnection: async (input: StreamingServerInput, _serverId?: string): Promise<StreamingPingResult> => {
      await new Promise((r) => setTimeout(r, 450));
      if (!input.url || !/^https?:\/\//i.test(input.url.trim())) {
        return { ok: false, error: "请输入有效的 HTTP/HTTPS 服务器地址", code: "network" };
      }
      const versionMap: Record<string, string> = {
        navidrome: "0.54.5 (linux/amd64)",
        jellyfin: "10.9.8",
        emby: "4.8.8.0",
        opensubsonic: "Subsonic REST 1.16.1 (OpenSubsonic v1.0.0)",
        subsonic: "6.1.6",
        airsonic: "11.1.4-SNAPSHOT",
        gonic: "0.8.12",
        lms: "8.4.1",
      };
      return {
        ok: true,
        version: versionMap[input.type] || `${input.type} v1.0.0`,
      };
    },

    connect: async (serverId: string): Promise<StreamingConnectResult> => {
      const { servers } = await (window.api?.streaming?.loadServers ? window.api.streaming.loadServers() : webApi.streaming.loadServers());
      const server = servers.find((s) => s.id === serverId);
      if (!server) {
        return { ok: false, error: "找不到服务器配置", code: "unknown" };
      }
      server.lastConnected = Date.now();
      try {
        localStorage.setItem(STREAMING_SERVERS_KEY, JSON.stringify(servers));
      } catch {}
      return { ok: true, server };
    },

    disconnect: async (_serverId: string): Promise<void> => {},

    getSnapshot: async (_serverId: string): Promise<StreamingLibrarySnapshot> => {
      return { songs: [], albums: [], artists: [], playlists: [] };
    },

    sync: async (serverId: string, _force?: boolean): Promise<boolean> => {
      setTimeout(() => {
        streamingLibraryListeners.forEach((cb) => {
          try {
            cb(serverId);
          } catch (err) {
            console.error("[streaming] sync callback error:", err);
          }
        });
      }, 400);
      return true;
    },

    onLibraryUpdated: (callback: (serverId: string) => void) => {
      streamingLibraryListeners.add(callback);
      return () => {
        streamingLibraryListeners.delete(callback);
      };
    },

    search: async (_serverId: string, _query: string): Promise<StreamingSearchResult> => {
      return { songs: [], albums: [], artists: [] };
    },

    getAlbumSongs: async (_serverId: string, _albumId: string) => [],

    getPlaylistSongs: async (_serverId: string, _playlistId: string) => [],

    getArtistAlbums: async (_serverId: string, _artistId: string) => [],

    getArtistSongs: async (_serverId: string, _artistId: string) => [],

    getStreamUrl: async (_serverId: string, _trackId: string, _playSessionId?: string): Promise<string> => "",

    getLyrics: async (_serverId: string, _trackId: string): Promise<string | null> => null,
  },
};

// ─── 5. 注入 Window 全局变量与安全自愈代理 ───

function createSafeNamespaceProxy(target: any, path = "window.api"): any {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === "symbol") {
        return Reflect.get(obj, prop, receiver);
      }
      if (prop in obj) {
        const val = Reflect.get(obj, prop, receiver);
        if (typeof val === "object" && val !== null && !Array.isArray(val)) {
          return createSafeNamespaceProxy(val, `${path}.${String(prop)}`);
        }
        return val;
      }
      const propStr = String(prop);
      if (propStr.startsWith("on")) {
        return () => () => {};
      }
      if (propStr.startsWith("is")) {
        return async () => false;
      }
      const fallbackFn = async (..._args: any[]) => ({ success: true, ok: true, data: null });
      return createSafeNamespaceProxy(fallbackFn, `${path}.${propStr}`);
    },
  });
}

const safeWebApi = createSafeNamespaceProxy(webApi);

if (typeof window !== "undefined") {
  (window as unknown as { electron: unknown }).electron = {
    process: {
      versions: {
        node: "24.14.0",
        chrome: "130.0.0",
        electron: "Web Edition",
        v8: "13.0",
      },
    },
    ipcRenderer: {
      on: () => () => {},
      send: () => {},
      invoke: () => Promise.resolve(),
      removeAllListeners: () => {},
    },
  };

  (window as unknown as { api: unknown }).api = safeWebApi;

  try {
    const rawCfg = localStorage.getItem("splayer_web_config");
    let zoomVal = 100;
    if (rawCfg) {
      const parsed = JSON.parse(rawCfg);
      if (parsed?.system?.uiZoom) zoomVal = Number(parsed.system.uiZoom);
    }
    const directZoom = localStorage.getItem("system.uiZoom");
    if (directZoom) zoomVal = Number(directZoom);
    if (zoomVal && zoomVal !== 100) {
      document.documentElement.style.zoom = `${zoomVal}%`;
    }
  } catch {}

  console.log(
    "%c[SPlayer Next]%c Web Bridge Initialized successfully! 🎉",
    "background: #fe7971; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
    "color: #fe7971; font-weight: bold;",
  );
}

export default webApi;
