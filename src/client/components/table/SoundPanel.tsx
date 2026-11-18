import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Music, Pause, Play, Trash2, Upload, Volume2 } from "lucide-react";
import type { CampaignAudioState, CampaignAudioTrack } from "../../../shared/types";
import { api, uploadAudio } from "../../api";
import { getSocket } from "../../socket";
import { errorMessage } from "../../stores";
import { IconButton } from "../ui";

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
  const currentTrack = tracks.find((track) => track.id === state.trackId) ?? null;
  const currentTrackId = currentTrack?.id ?? null;
  const currentTrackUrl = currentTrack?.url ?? null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

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
    if (Number.isFinite(target)) {
      // Newly loaded media has no seekable range yet. Remember the target and
      // apply it once metadata arrives instead of dropping the seek.
      if (audio.readyState >= 1) {
        if (Math.abs(audio.currentTime - target) > 1.5) {
          try {
            audio.currentTime = target;
          } catch {
            pendingSeek.current = target;
          }
        }
      } else {
        pendingSeek.current = target;
      }
    }
    if (state.playing && joined) {
      void audio.play().catch(() => setJoined(false));
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
    sendState(track.id, true, 0);
  };

  const togglePlay = () => {
    if (!isGm || !currentTrack) return;
    setJoined(true);
    sendState(currentTrack.id, !state.playing, audioRef.current?.currentTime ?? state.position);
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

  return (
    <div className="sound-panel">
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (!audio || pendingSeek.current === null) return;
          try {
            audio.currentTime = pendingSeek.current;
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
          {currentTrack ? (
            <button
              type="button"
              className="icon-btn"
              title={state.playing ? "Pause" : "Play"}
              onClick={isGm ? togglePlay : () => setJoined(true)}
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
      {state.playing && !joined ? (
        <button type="button" className="sound-join" onClick={() => setJoined(true)}>
          <Volume2 size={13} /> Join audio
        </button>
      ) : null}
      {open ? (
        <div className="sound-panel-body">
          {error ? <p className="field-error">{error}</p> : null}
          {isGm ? (
            <>
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="icon-btn"
                  title="Upload audio"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload size={14} />
                </button>
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
                <span className="tiny muted">
                  {uploading ? "Uploading…" : "MP3, OGG, WAV, or WebM · max 25 MB"}
                </span>
              </div>
            </>
          ) : null}
          <div className="sound-track-list">
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`sound-track ${track.id === state.trackId ? "is-active" : ""}`}
              >
                <button
                  type="button"
                  className="sound-track-play"
                  title={isGm ? `Play ${track.name}` : track.name}
                  onClick={isGm ? () => playTrack(track) : () => setJoined(true)}
                >
                  <Play size={12} />
                  <span>{track.name}</span>
                </button>
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
                  ? "Upload an ambient track or battle theme."
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
        </div>
      ) : null}
    </div>
  );
}
