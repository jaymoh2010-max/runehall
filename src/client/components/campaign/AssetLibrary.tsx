import { useEffect, useMemo, useState } from "react";
import { Eye, ImageOff, Images, RefreshCw, Trash2 } from "lucide-react";
import type { CampaignAsset } from "../../../shared/types";
import { api, formatDate } from "../../api";
import { errorMessage } from "../../stores";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageEyebrow,
  Spinner,
  Tag,
} from "../ui";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AssetLibrary({
  campaignId,
  toast,
}: {
  campaignId: string;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [assets, setAssets] = useState<CampaignAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unused" | "used">("all");
  const [preview, setPreview] = useState<CampaignAsset | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ assets: CampaignAsset[] }>(`/api/campaigns/${campaignId}/assets`);
      setAssets(result.assets);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const unused = useMemo(() => assets.filter((asset) => asset.unused), [assets]);
  const visible = useMemo(
    () =>
      assets.filter((asset) =>
        filter === "all" ? true : filter === "unused" ? asset.unused : !asset.unused,
      ),
    [assets, filter],
  );
  const reclaimableBytes = useMemo(
    () =>
      assets
        .filter((asset) => asset.unused && asset.deletable)
        .reduce((total, asset) => total + asset.size, 0),
    [assets],
  );

  const remove = async (asset: CampaignAsset) => {
    if (!asset.deletable) return;
    if (!window.confirm(`Delete “${asset.name}”? This removes the image file permanently.`)) return;
    setDeleting(asset.filename);
    try {
      await api(`/api/campaigns/${campaignId}/assets/${encodeURIComponent(asset.filename)}`, {
        method: "DELETE",
      });
      setAssets((current) => current.filter((entry) => entry.filename !== asset.filename));
      toast("Unused image deleted.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="page-inner asset-page">
      <div className="section-title">
        <div>
          <PageEyebrow>GM preparation</PageEyebrow>
          <h2>Assets</h2>
          <p>
            Images uploaded for this campaign. Reuse one in a handout from the journal editor, or
            remove files that are no longer referenced anywhere.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<RefreshCw size={14} />}
          loading={loading}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>

      {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

      <div className="asset-summary">
        <div className="asset-summary-stat">
          <span>Images</span>
          <strong>{assets.length}</strong>
        </div>
        <div className="asset-summary-stat">
          <span>Unused</span>
          <strong>{unused.length}</strong>
        </div>
        <div className="asset-summary-stat">
          <span>Reclaimable</span>
          <strong>{formatBytes(reclaimableBytes)}</strong>
        </div>
        <div className="asset-summary-hint">
          <Images size={15} />
          <span>Journal → edit entry → <strong>From library</strong></span>
        </div>
      </div>

      <div className="segmented asset-filter">
        <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>
          All
        </button>
        <button type="button" className={filter === "unused" ? "is-active" : ""} onClick={() => setFilter("unused")}>
          Unused
        </button>
        <button type="button" className={filter === "used" ? "is-active" : ""} onClick={() => setFilter("used")}>
          In use
        </button>
      </div>

      {loading ? (
        <Spinner label="Reading the asset library…" />
      ) : !visible.length ? (
        <EmptyState
          icon={assets.length ? <ImageOff size={28} /> : <Images size={28} />}
          title={assets.length ? "Nothing in this filter" : "No campaign images yet"}
          description={
            assets.length
              ? "Try another filter."
              : "Upload scene art, token images, portraits, or handout images and they will appear here."
          }
        />
      ) : (
        <div className="asset-grid">
          {visible.map((asset) => (
            <Card key={asset.filename} className="asset-card">
              <button type="button" className="asset-thumb" onClick={() => setPreview(asset)}>
                <img src={asset.url} alt={asset.name} loading="lazy" />
              </button>
              <div className="asset-card-body">
                <div className="row-between" style={{ gap: 8, alignItems: "flex-start" }}>
                  <strong title={asset.name}>{asset.name}</strong>
                  {asset.unused ? (
                    <Badge tone="gold">Unused</Badge>
                  ) : (
                    <Badge tone="green">{asset.usage.length} use{asset.usage.length === 1 ? "" : "s"}</Badge>
                  )}
                </div>
                <span className="tiny muted">
                  {formatBytes(asset.size)} · {formatDate(asset.createdAt)}
                </span>
                <div className="chip-row asset-usage">
                  {asset.usage.slice(0, 3).map((usage) => (
                    <Tag key={usage} tone="neutral">{usage}</Tag>
                  ))}
                  {asset.usage.length > 3 ? <Tag tone="neutral">+{asset.usage.length - 3}</Tag> : null}
                  {asset.usedElsewhere ? <Tag tone="violet">Used elsewhere</Tag> : null}
                </div>
              </div>
              <div className="asset-actions">
                <Button size="sm" variant="ghost" icon={<Eye size={13} />} onClick={() => setPreview(asset)}>
                  Preview
                </Button>
                {asset.deletable ? (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 size={13} />}
                    loading={deleting === asset.filename}
                    onClick={() => void remove(asset)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.name}
        subtitle={preview ? `${formatBytes(preview.size)} · ${formatDate(preview.createdAt)}` : undefined}
        wide
      >
        {preview ? (
          <>
            <img className="asset-preview" src={preview.url} alt={preview.name} />
            <div className="tiny muted" style={{ marginTop: 10 }}>
              {preview.usage.length ? `Used by ${preview.usage.join(", ")}` : "Not used by any record yet."}
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
