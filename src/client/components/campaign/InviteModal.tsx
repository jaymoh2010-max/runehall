import { useEffect, useMemo, useState } from "react";
import { Copy, Link2, Share2, UserPlus } from "lucide-react";
import { api, copyText } from "../../api";
import { errorMessage, useToasts } from "../../stores";
import { Badge, Button, Input, Modal } from "../ui";

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  campaign: { id: string; name: string; inviteCode: string } | null;
}

interface NetworkInfo {
  addresses: { name: string; address: string }[];
  port: number;
}

export function InviteModal({ open, onClose, campaign }: InviteModalProps) {
  const toast = useToasts((state) => state.push);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [networkError, setNetworkError] = useState("");

  useEffect(() => {
    if (!open) return;
    setNetworkError("");
    api<NetworkInfo>("/api/system/network")
      .then(setNetwork)
      .catch((err) => setNetworkError(errorMessage(err)));
  }, [open]);

  const links = useMemo(() => {
    if (!campaign) return { primary: "", lan: [] as string[], current: "", isLoopback: false };
    const code = campaign.inviteCode;
    const origin = window.location.origin;
    const current = `${origin}/join/${encodeURIComponent(code)}`;
    const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const protocol = window.location.protocol;
    const port = window.location.port ? `:${window.location.port}` : "";
    const lan = isLoopback && network
      ? network.addresses.map((entry) => `${protocol}//${entry.address}${port}/join/${encodeURIComponent(code)}`)
      : [];
    return { primary: lan[0] || current, lan, current, isLoopback };
  }, [campaign, network]);

  if (!campaign) return null;

  const copy = async (value: string, label: string) => {
    const copied = await copyText(value);
    toast(
      copied ? `${label} copied.` : "Could not copy. Select the text and copy it manually.",
      copied ? "success" : "error",
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite players"
      subtitle={`Grow the table for ${campaign.name}.`}
      wide
    >
      <div className="invite-modal">
        <div className="invite-modal-hero">
          <div className="invite-modal-icon"><UserPlus size={22} /></div>
          <div>
            <h3>Send them a seat</h3>
            <p>New players will create an account or sign in, then choose or create a character before joining the campaign.</p>
          </div>
        </div>

        <div className="invite-block">
          <div className="row-between">
            <div>
              <span className="field-label">Invite link</span>
              <p className="tiny muted">The easiest option for friends.</p>
            </div>
            <Badge tone="gold">Recommended</Badge>
          </div>
          <div className="invite-field-row">
            <Input readOnly value={links.primary} onFocus={(event) => event.currentTarget.select()} />
            <Button variant="primary" icon={<Copy size={14} />} onClick={() => copy(links.primary, "Invite link")}>
              Copy
            </Button>
          </div>
          {links.lan.length > 1 ? (
            <div className="invite-lan-list">
              <span className="tiny muted">Other network addresses:</span>
              {links.lan.slice(1).map((link) => (
                <button key={link} type="button" onClick={() => copy(link, "Invite link")}>
                  <Link2 size={12} /> {link}
                </button>
              ))}
            </div>
          ) : null}
          {links.isLoopback ? (
            links.lan.length ? (
              <p className="invite-note">
                This link uses a local network address. Friends must be on the same network or connected to your VPN.
              </p>
            ) : network ? (
              <p className="invite-note">
                No LAN address was detected. This localhost link will only work on this machine. Connect to your network or use your machine&apos;s LAN address before sharing.
              </p>
            ) : (
              <p className="invite-note">Finding a shareable local network address…</p>
            )
          ) : null}
        </div>

        <div className="invite-block">
          <div>
            <span className="field-label">Invite code</span>
            <p className="tiny muted">For players who prefer to enter a code from My Campaigns.</p>
          </div>
          <div className="invite-field-row">
            <Input readOnly value={campaign.inviteCode} onFocus={(event) => event.currentTarget.select()} className="invite-code-input" />
            <Button icon={<Copy size={14} />} onClick={() => copy(campaign.inviteCode, "Invite code")}>
              Copy code
            </Button>
          </div>
        </div>

        {networkError ? <p className="invite-note">LAN addresses unavailable: {networkError}</p> : null}

        <div className="invite-modal-foot">
          <p className="tiny muted">
            Players join as members of this campaign. Their campaigns and characters remain under <strong>My Campaigns</strong> until the GM deletes the campaign.
          </p>
          {typeof navigator.share === "function" ? (
            <Button
              variant="ghost"
              icon={<Share2 size={14} />}
              onClick={() =>
                navigator
                  .share({ title: `Join ${campaign.name}`, text: `Join our Pathfinder table: ${links.primary}` })
                  .catch(() => undefined)
              }
            >
              Share
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
