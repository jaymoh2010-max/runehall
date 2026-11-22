import { Check, ClipboardList, X } from "lucide-react";
import type { CampaignRequest } from "../../../shared/types";
import { CAMPAIGN_REQUEST_KIND_LABELS, campaignRequestStatusLabel } from "../../../shared/requests";
import { formatDate } from "../../api";
import { Badge, Button, Card, Tag } from "../ui";

function requestTone(request: CampaignRequest): "neutral" | "gold" | "green" | "red" | "blue" {
  if (request.status === "approved") return "green";
  if (request.status === "denied") return "red";
  if (request.status === "withdrawn") return "neutral";
  return "gold";
}

export function PlayerRequestsCard({
  requests,
  isGm,
  withdrawBusy,
  onReview,
  onWithdraw,
}: {
  requests: CampaignRequest[];
  isGm: boolean;
  withdrawBusy: string | null;
  onReview: (request: CampaignRequest) => void;
  onWithdraw: (request: CampaignRequest) => void;
}) {
  const pending = requests.filter((request) => request.status === "pending");
  return (
    <Card className="request-card">
      <div className="row-between request-card-head">
        <div>
          <div className="row wrap" style={{ gap: 8 }}>
            <h3>{isGm ? "Player requests" : "Your requests"}</h3>
            {pending.length ? (
              <Badge tone="gold">
                {pending.length} awaiting {isGm ? "your review" : "the GM"}
              </Badge>
            ) : (
              <Badge tone="neutral">Nothing pending</Badge>
            )}
          </div>
          <p className="tiny muted">
            {isGm
              ? "Player-initiated level-ups, downtime, and journal entries wait here for approval."
              : "Ask the GM for a level-up, downtime, or a journal entry. Nothing changes until they approve it."}
          </p>
        </div>
        <ClipboardList size={20} aria-hidden />
      </div>
      {requests.length ? (
        <div className="request-list">
          {requests.map((request) => (
            <div className="request-row" key={request.id}>
              <div className="request-row-main">
                <div className="row wrap" style={{ gap: 7 }}>
                  <Tag tone="violet">{CAMPAIGN_REQUEST_KIND_LABELS[request.kind]}</Tag>
                  <Tag tone={requestTone(request)}>
                    {campaignRequestStatusLabel(request.status)}
                  </Tag>
                  {isGm ? <span className="tiny muted">From {request.playerName}</span> : null}
                  <span className="tiny muted">{formatDate(request.createdAt)}</span>
                </div>
                <strong>{request.title}</strong>
                <p className="tiny muted">{request.detail}</p>
                {request.note ? <p className="request-note">“{request.note}”</p> : null}
                {request.payload.content && isGm && request.status === "pending" ? (
                  <div className="request-proposal">
                    <span className="tiny muted">Proposed entry</span>
                    <p>{request.payload.content}</p>
                  </div>
                ) : null}
                {request.status !== "pending" ? (
                  <p className="tiny muted">
                    {campaignRequestStatusLabel(request.status)}
                    {request.resolvedByName ? ` by ${request.resolvedByName}` : ""}
                    {request.gmNote ? ` — “${request.gmNote}”` : ""}
                  </p>
                ) : null}
              </div>
              {request.status === "pending" ? (
                <div className="request-row-actions">
                  {isGm ? (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Check size={14} />}
                      onClick={() => onReview(request)}
                    >
                      Review
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<X size={14} />}
                      loading={withdrawBusy === request.id}
                      onClick={() => onWithdraw(request)}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">
          {isGm
            ? "No player requests yet. They can ask from the Party tab or the Journal."
            : "Nothing yet. Use the request buttons on your party card or propose a journal entry."}
        </p>
      )}
    </Card>
  );
}
