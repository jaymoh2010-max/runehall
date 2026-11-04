import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dices, EyeOff, Loader2, Megaphone, MessageSquare, Send, Sparkles, Swords } from "lucide-react";
import type { ChatMessage, PublicUser, RollRequest, RollResult, PresenceUser } from "../../../shared/types";
import { DEGREE_LABELS, validateFormula } from "../../../shared/dice";
import { formatTime } from "../../api";
import { Avatar, Badge, Button, Input, Tag } from "../ui";

interface ChatPanelProps {
  messages: ChatMessage[];
  presence: PresenceUser[];
  user: PublicUser;
  isGm: boolean;
  onSend: (text: string, gmOnly: boolean) => void;
  onRoll: (formula: string, label: string, dc: number | null, gmOnly: boolean) => void;
  onRequest: (formula: string, label: string, dc: number | null) => void;
  disabled?: boolean;
}

export function ChatPanel({ messages, presence, user, isGm, onSend, onRoll, onRequest, disabled }: ChatPanelProps) {
  const [tab, setTab] = useState<"chat" | "dice">("chat");
  const [text, setText] = useState("");
  const [formula, setFormula] = useState("1d20+5");
  const [label, setLabel] = useState("Check");
  const [dc, setDc] = useState("");
  const [gmOnly, setGmOnly] = useState(false);
  const [rollError, setRollError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages.length, tab]);

  const send = (event: FormEvent) => {
    event.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    onSend(clean, gmOnly);
    setText("");
  };

  const validate = () => {
    const validation = validateFormula(formula);
    if (!validation.ok) {
      setRollError(validation.error ?? "Invalid formula.");
      return false;
    }
    setRollError("");
    return true;
  };

  const roll = () => {
    if (!validate()) return;
    onRoll(formula.trim(), label.trim() || "Roll", dc.trim() ? Number(dc) : null, gmOnly);
  };

  const requestRoll = () => {
    if (!validate()) return;
    onRequest(formula.trim(), label.trim() || "Roll", dc.trim() ? Number(dc) : null);
  };

  const applyRequest = (request: RollRequest) => {
    setFormula(request.formula);
    setLabel(request.label);
    setDc(request.dc === null ? "" : String(request.dc));
    setRollError("");
    setTab("dice");
  };

  return (
    <div className="chat-panel">
      <div className="chat-tabs">
        <button type="button" className={tab === "chat" ? "is-active" : ""} onClick={() => setTab("chat")}>
          <MessageSquare size={14} /> Table talk
        </button>
        <button type="button" className={tab === "dice" ? "is-active" : ""} onClick={() => setTab("dice")}>
          <Dices size={14} /> Dice tray
        </button>
      </div>

      {tab === "dice" ? (
        <div className="dice-tray">
          <div className="dice-tray-head">
            <div>
              <h3>Roll the bones</h3>
              <p className="tiny muted">The server rolls and records the result.</p>
            </div>
            <Sparkles size={17} className="gold-text" />
          </div>
          <div className="dice-formula">
            <Input
              value={formula}
              onChange={(event) => setFormula(event.target.value)}
              placeholder="1d20+5"
              className="dice-formula-input"
              onKeyDown={(event) => {
                if (event.key === "Enter") roll();
              }}
            />
            <Button variant="primary" icon={<Dices size={15} />} onClick={roll} disabled={disabled}>Roll</Button>
          </div>
          {rollError ? <div className="auth-error">{rollError}</div> : null}
          <div className="quick-dice">
            {[4, 6, 8, 10, 12, 20].map((sides) => (
              <button key={sides} type="button" onClick={() => setFormula(`1d${sides}`)}>d{sides}</button>
            ))}
          </div>
          <div className="dice-options">
            <label>
              <span className="tiny muted">Label</span>
              <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Perception" />
            </label>
            <label>
              <span className="tiny muted">DC (optional)</span>
              <Input type="number" value={dc} onChange={(event) => setDc(event.target.value)} placeholder="15" />
            </label>
          </div>
          <label className={`gm-toggle-row ${gmOnly ? "is-on" : ""}`}>
            <input type="checkbox" checked={gmOnly} onChange={(event) => setGmOnly(event.target.checked)} />
            <EyeOff size={14} />
            <span>{isGm ? "Secret GM roll" : "Whisper roll to GM"}</span>
          </label>
          <div className="dice-presets">
            <button type="button" onClick={() => { setFormula("1d20"); setLabel("Check"); }}><Swords size={13} /> d20 check</button>
            <button type="button" onClick={() => { setFormula("1d20+5"); setLabel("Attack"); }}><Swords size={13} /> Attack +5</button>
            <button type="button" onClick={() => { setFormula("1d8+3"); setLabel("Damage"); }}><Dices size={13} /> 1d8+3 damage</button>
          </div>
          {isGm ? (
            <div className="dice-request-row">
              <span className="tiny muted">Ask the table to make this roll. Requests are always public.</span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Megaphone size={13} />}
                onClick={requestRoll}
                disabled={disabled || gmOnly}
                title={gmOnly ? "Clear the secret roll option to request an open roll." : "Send this roll request to the table"}
              >
                Request roll
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="chat-messages" ref={listRef}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <MessageSquare size={24} />
              <p>No messages yet. Say hello to the table.</p>
            </div>
          ) : null}
          {messages.map((message) => (
            <ChatMessageRow
              key={message.id}
              message={message}
              self={message.userId === user.id}
              onUseRequest={applyRequest}
            />
          ))}
        </div>
      )}

      <form className="chat-compose" onSubmit={send}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={tab === "dice" ? "Send a message to the table…" : "Message the table…"}
          rows={2}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              const form = event.currentTarget.form;
              form?.requestSubmit();
            }
          }}
        />
        <div className="chat-compose-foot">
          <label className={`whisper-small ${gmOnly ? "is-on" : ""}`}>
            <input type="checkbox" checked={gmOnly} onChange={(event) => setGmOnly(event.target.checked)} />
            <EyeOff size={12} /> {isGm ? "GM only" : "Whisper GM"}
          </label>
          <Button type="submit" variant="primary" size="sm" icon={<Send size={14} />} disabled={!text.trim() || disabled}>Send</Button>
        </div>
      </form>

      <div className="chat-presence">
        {presence.slice(0, 8).map((person) => (
          <span key={person.socketId} className="chat-presence-person" title={`${person.displayName} (${person.role === "gm" ? "GM" : "player"})`}>
            <Avatar name={person.displayName} src={person.avatarUrl} size={24} />
            <span className="presence-dot" />
          </span>
        ))}
        <span className="tiny muted">{presence.length} online</span>
      </div>
    </div>
  );
}

function ChatMessageRow({
  message,
  self,
  onUseRequest,
}: {
  message: ChatMessage;
  self: boolean;
  onUseRequest: (request: RollRequest) => void;
}) {
  const data = message.data;
  if (message.type === "request" && data && !("total" in data)) {
    return (
      <div className={`chat-message chat-request ${self ? "is-self" : ""}`}>
        <div className="chat-message-head">
          <Avatar name={message.authorName} size={23} />
          <strong>{message.authorName}</strong>
          <span className="tiny muted">{formatTime(message.createdAt)}</span>
        </div>
        <RequestCard data={data} onUse={() => onUseRequest(data)} />
      </div>
    );
  }
  if (message.type === "roll" && data && "total" in data) {
    return (
      <div className={`chat-message chat-roll ${self ? "is-self" : ""} ${message.visibility === "gm" ? "is-private" : ""}`}>
        <div className="chat-message-head">
          <Avatar name={message.authorName} size={23} />
          <strong>{message.authorName}</strong>
          <span className="tiny muted">{formatTime(message.createdAt)}</span>
          {message.visibility === "gm" ? <Badge tone="gold"><EyeOff size={10} /> private</Badge> : null}
        </div>
        <RollCard data={data} />
      </div>
    );
  }
  return (
    <div className={`chat-message ${self ? "is-self" : ""} ${message.visibility === "gm" ? "is-private" : ""}`}>
      <div className="chat-message-head">
        <Avatar name={message.authorName} size={23} />
        <strong>{message.authorName}</strong>
        <span className="tiny muted">{formatTime(message.createdAt)}</span>
        {message.visibility === "gm" ? <Badge tone="gold"><EyeOff size={10} /> private</Badge> : null}
      </div>
      <p className="chat-text">{message.content}</p>
    </div>
  );
}

function RequestCard({ data, onUse }: { data: RollRequest; onUse: () => void }) {
  return (
    <div className="roll-request-card">
      <div className="roll-request-head">
        <span><Megaphone size={12} /> Roll requested</span>
        {data.dc !== null ? <Badge tone="gold">DC {data.dc}</Badge> : null}
      </div>
      <div className="roll-request-body">
        <div>
          <strong>{data.label}</strong>
          <span className="mono tiny muted">{data.formula}</span>
        </div>
        <Button size="sm" variant="secondary" icon={<Dices size={13} />} onClick={onUse}>
          Open dice tray
        </Button>
      </div>
    </div>
  );
}

export function RollCard({ data }: { data: RollResult }) {
  const tone =
    data.degree === "critical-success" || data.degree === "success"
      ? "success"
      : data.degree === "failure" || data.degree === "critical-failure"
        ? "failure"
        : "neutral";
  return (
    <div className={`roll-card ${tone} ${data.degree ?? ""}`}>
      <div className="roll-card-head">
        <span>{data.label || "Roll"}</span>
        <span className="mono tiny muted">{data.formula}</span>
      </div>
      <div className="roll-card-main">
        <strong>{data.total}</strong>
        {data.degree ? <Badge tone={tone === "success" ? "green" : tone === "failure" ? "red" : "neutral"}>{DEGREE_LABELS[data.degree]}</Badge> : null}
        {data.dc !== null ? <span className="tiny muted">vs DC {data.dc}</span> : null}
      </div>
      <div className="roll-card-breakdown">{data.breakdown}</div>
    </div>
  );
}
