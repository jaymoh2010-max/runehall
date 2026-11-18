import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Library,
  Music,
  Pause,
  Play,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import type {
  AudioLibraryTrack,
  AudioMood,
  CampaignAudioState,
  CampaignAudioTrack,
} from "../../../shared/types";
import { AUDIO_MOODS, audioMoodLabel } from "../../../shared/audio";
import { api, uploadAudio } from "../../api";
import { getSocket } from "../../socket";
import { errorMessage } from "../../stores";
import { Button, IconButton, Modal } from "../ui";

export function SoundPanel({
  campaignId,
  isGm,
  tracks,
  state,
  onTracksChange,
}: {
  campaignId: string;
  isGm: boolean;
  tracks: CampaignAudioTrack[];
  state: CampaignAudioState;
  onTracksChange: (tracks: CampaignAudioTrack[]) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const receivedRef = useRef<{ key: string; at: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [joined, setJoined] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTracks, setLibraryTracks] = useState<AudioLibraryTrack[]>([]);
  const [libraryMood, setLibraryMood] = useState<AudioMood | "all">("all");
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const currentTrack = tracks.find((track) => track.id === state.trackId) ?? null;
  const currentTrackId = currentTrack?.id ?? null;
  const currentTrackUrl = currentTrack?.url ?? null;
  const campaignUrls = new Set(tracks.map((track) => track.url));
  const filteredLibrary = libraryTracks.filter(
    (track) => libraryMood === "all" || track.mood === libraryMood
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = true;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentTrackId || !currentTrackUrl) {
      pendingSeek.current = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    if (audio.getAttribute("src") !== currentTrackUrl) {
      audio.src = currentTrackUrl;
      audio.load();
    }
    const stateKey = `${state.serverTime}:${state.updatedAt}:${state.position}:${state.playing}`;
    if (!receivedRef.current || receivedRef.current.key !== stateKey) {
      receivedRef.current = { key: stateKey, at: Date.now() };
    }
    // Measure elapsed time from the server's clock so a skewed local clock
    // cannot seek players to the wrong point in the track.
    const serverNow = state.serverTime
      ? state.serverTime + (Date.now() - receivedRef.current.at)
      : Date.now();
    const elapsed =
      state.playing && state.updatedAt ? Math.max(0, (serverNow - state.updatedAt) / 1000) : 0;
    const target = Math.max(0, state.position + elapsed);
    const loopTarget =
      audio.loop && Number.isFinite(audio.duration) && audio.duration > 0
        ? target % audio.duration
        : target;
    if (Number.isFinite(loopTarget)) {
      // Newly loaded media has no seekable range yet. Remember the target and
      // apply it once metadata arrives instead of dropping the seek.
      if (audio.readyState >= 1) {
        if (Math.abs(audio.currentTime - loopTarget) > 1.5) {
          try {
            audio.currentTime = loopTarget;
          } catch {
            pendingSeek.current = loopTarget;
          }
        }
      } else {
        pendingSeek.current = loopTarget;
      }
    }
    if (state.playing && joined) {
      void audio
        .play()
        .then(() => setPlaybackError(""))
        .catch(() => {
          setPlaybackError(
            "Your browser blocked playback. Use your browser's audio permission and click Leave audio, then Join audio again."
          );
        });
    } else if (!state.playing) {
      audio.pause();
    }
  }, [
    currentTrackId,
    currentTrackUrl,
    state.playing,
    state.position,
    state.updatedAt,
    state.serverTime,
    joined,
  ]);

  const sendState = (trackId: string | null, playing: boolean, position: number) => {
    if (!isGm) return;
    getSocket().emit("audio:update", {
      campaignId,
      trackId,
      playing,
      position: Math.max(0, Math.round(position * 10) / 10),
    });
  };

  const playTrack = (track: CampaignAudioTrack) => {
    setJoined(true);
    setPlaybackError("");
    sendState(track.id, true, 0);
  };

  const togglePlay = () => {
    if (!isGm || !currentTrack) return;
    setJoined(true);
    setPlaybackError("");
    sendState(currentTrack.id, !state.playing, audioRef.current?.currentTime ?? state.position);
  };

  const enableListening = () => {
    setPlaybackError("");
    setJoined(true);
    const audio = audioRef.current;
    if (audio && state.playing) {
      void audio.play().catch(() => {
        setPlaybackError(
          "Your browser blocked playback. Use your browser's audio permission and click Leave audio, then Join audio again."
        );
      });
    }
  };

  const leaveListening = () => {
    audioRef.current?.pause();
    setJoined(false);
    setPlaybackError("");
  };

  const upload = async (file: File | null) => {
    if (!file || !isGm) return;
    setUploading(true);
    setError("");
    try {
      const result = await uploadAudio(file, campaignId);
      onTracksChange([...tracks, result.track]);
      setOpen(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (track: CampaignAudioTrack) => {
    if (!isGm) return;
    if (!window.confirm(`Remove “${track.name}” from the soundtrack?`)) return;
    setError("");
    try {
      await api(`/api/campaigns/${campaignId}/audio/${track.id}`, { method: "DELETE" });
      onTracksChange(tracks.filter((entry) => entry.id !== track.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const openLibrary = async () => {
    if (!isGm) return;
    setLibraryOpen(true);
    setLibraryError("");
    setLibraryLoading(true);
    try {
      const result = await api<{ tracks: AudioLibraryTrack[] }>(
        `/api/campaigns/${campaignId}/audio/library`
      );
      setLibraryTracks(result.tracks);
    } catch (err) {
      setLibraryError(errorMessage(err));
    } finally {
      setLibraryLoading(false);
    }
  };

  const addLibraryTrack = async (track: AudioLibraryTrack) => {
    setAddingId(track.id);
    setLibraryError("");
    try {
      const result = await api<{ track: CampaignAudioTrack }>(
        `/api/campaigns/${campaignId}/audio/library/${encodeURIComponent(track.id)}`,
        { method: "POST" }
      );
      onTracksChange([...tracks, result.track]);
      setLibraryTracks((current) =>
        current.map((entry) => (entry.id === track.id ? { ...entry, added: true } : entry))
      );
    } catch (err) {
      setLibraryError(errorMessage(err));
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="sound-panel">
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (!audio || pendingSeek.current === null) return;
          const duration = audio.duration;
          const target =
            audio.loop && Number.isFinite(duration) && duration > 0
              ? pendingSeek.current % duration
              : pendingSeek.current;
          try {
            audio.currentTime = target;
          } catch {
            // Ignore a late seek; playback can continue from the browser's position.
          }
          pendingSeek.current = null;
        }}
      />
      <div className="sound-panel-head">
        <span className="sound-panel-title">
          <Music size={14} /> Soundtrack
        </span>
        <div className="row" style={{ gap: 5 }}>
          {isGm && currentTrack ? (
            <button
              type="button"
              className="icon-btn"
              title={state.playing ? "Pause" : "Play"}
              onClick={togglePlay}
            >
              {state.playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
          ) : null}
          <IconButton
            label={open ? "Hide soundtrack" : "Show soundtrack"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </IconButton>
        </div>
      </div>
      <p className="sound-panel-now tiny muted">
        {currentTrack
          ? `${currentTrack.name}${state.playing ? " · playing" : " · paused"}`
          : "No track selected"}
      </p>
      {currentTrack && (!isGm || (state.playing && !joined)) ? (
        <button
          type="button"
          className={`sound-join ${joined ? "is-on" : ""}`}
          aria-pressed={joined}
          onClick={() => (joined ? leaveListening() : enableListening())}
        >
          {joined ? <Volume2 size={13} /> : <VolumeX size={13} />}
          {joined ? "Leave audio" : "Join audio"}
        </button>
      ) : null}
      {playbackError ? <p className="tiny field-error">{playbackError}</p> : null}
      {open ? (
        <div className="sound-panel-body">
          {error ? <p className="field-error">{error}</p> : null}
          {isGm ? (
            <>
              <input
                ref={fileRef}
                type="file"
                aria-label="Upload soundtrack"
                accept="audio/mpeg,audio/ogg,audio/wav,audio/webm"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  void upload(file);
                }}
              />
              <div className="sound-upload-row">
                <Button
                  size="sm"
                  icon={<Upload size={14} />}
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  Upload audio
                </Button>
                <Button size="sm" icon={<Library size={14} />} onClick={() => void openLibrary()}>
                  Music library
                </Button>
              </div>
              <span className="tiny muted">
                {uploading ? "Uploading…" : "MP3, OGG, WAV, or WebM · max 25 MB"}
              </span>
            </>
          ) : null}
          <div className="sound-track-list">
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`sound-track ${track.id === state.trackId ? "is-active" : ""}`}
              >
                {isGm ? (
                  <button
                    type="button"
                    className="sound-track-play"
                    title={`Play ${track.name}`}
                    onClick={() => playTrack(track)}
                  >
                    <Play size={12} />
                    <span>{track.name}</span>
                  </button>
                ) : (
                  <span className="sound-track-play is-static" title={track.name}>
                    <Music size={12} />
                    <span>{track.name}</span>
                  </span>
                )}
                {isGm ? (
                  <button
                    type="button"
                    className="icon-btn"
                    title={`Remove ${track.name}`}
                    onClick={() => void remove(track)}
                  >
                    <Trash2 size={12} />
                  </button>
                ) : null}
              </div>
            ))}
            {!tracks.length ? (
              <p className="tiny muted">
                {isGm
                  ? "Upload an ambient track, battle theme, or choose one from the music library."
                  : "The GM hasn't shared a soundtrack yet."}
              </p>
            ) : null}
          </div>
          <label className="sound-volume">
            <Volume2 size={13} />
            <input
              type="range"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </label>
          <p className="tiny muted">
            {isGm
              ? "The track and pause state are shared with everyone at the table."
              : "Audio is local to you. Join or leave without changing the table's music."}
          </p>
        </div>
      ) : null}

      {isGm ? (
        <Modal
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          title="Music library"
          subtitle="Bundled CC0 fantasy music for your campaign. Add a track, then press play for the table."
          wide
          footer={
            <Button variant="ghost" onClick={() => setLibraryOpen(false)}>
              Close
            </Button>
          }
        >
          {libraryError ? <div className="auth-error">{libraryError}</div> : null}
          <div className="audio-mood-filter">
            <button
              type="button"
              className={libraryMood === "all" ? "is-active" : ""}
              onClick={() => setLibraryMood("all")}
            >
              All moods
            </button>
            {AUDIO_MOODS.map((mood) => (
              <button
                key={mood.id}
                type="button"
                className={libraryMood === mood.id ? "is-active" : ""}
                title={mood.hint}
                onClick={() => setLibraryMood(mood.id)}
              >
                {mood.label}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            {libraryMood === "all"
              ? "Battle, exploration, tavern, relaxing, and mystery tracks."
              : AUDIO_MOODS.find((mood) => mood.id === libraryMood)?.hint}
          </p>
          {libraryLoading ? (
            <p className="muted small">Loading the music library…</p>
          ) : (
            <div className="audio-library-list">
              {filteredLibrary.map((track) => {
                const added = Boolean(track.added) || campaignUrls.has(track.url);
                return (
                  <div key={track.id} className="audio-library-row">
                    <div className="grow">
                      <strong>{track.title}</strong>
                      <p className="tiny muted">
                        {track.author} · {track.license} · {audioMoodLabel(track.mood)}
                      </p>
                    </div>
                    <a
                      href={track.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="icon-btn"
                      title={`Source for ${track.title}`}
                      aria-label={`Source for ${track.title}`}
                    >
                      <ExternalLink size={13} />
                    </a>
                    <Button
                      size="sm"
                      variant={added ? "ghost" : "secondary"}
                      disabled={added || addingId === track.id}
                      loading={addingId === track.id}
                      onClick={() => void addLibraryTrack(track)}
                    >
                      {added ? "Added" : "Add"}
                    </Button>
                  </div>
                );
              })}
              {!filteredLibrary.length ? (
                <p className="muted small">No tracks in this mood yet.</p>
              ) : null}
            </div>
          )}
          <p className="tiny muted" style={{ marginTop: 12 }}>
            All bundled tracks are CC0 1.0. Author and source links are stored with each track; see
            THIRD_PARTY_NOTICES.md for the full list.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
