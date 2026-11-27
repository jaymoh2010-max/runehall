import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToasts } from "../stores";

export function Toasts() {
  const { toasts, remove } = useToasts();
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
          aria-atomic="true"
        >
          {toast.kind === "success" ? (
            <CheckCircle2 size={17} color="var(--green)" />
          ) : toast.kind === "error" ? (
            <AlertCircle size={17} color="var(--red)" />
          ) : (
            <Info size={17} color="var(--blue)" />
          )}
          <span>{toast.message}</span>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => remove(toast.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
