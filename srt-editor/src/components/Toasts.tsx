import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useToasts, type ToastKind } from "../state/toasts";

const ICONS: Record<ToastKind, React.ReactNode> = {
  ok: <CheckCircle2 size={15} />,
  err: <AlertCircle size={15} />,
  info: <Info size={15} />,
};

/** Bottom-right stack; click a toast to dismiss it early. */
export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          className={`toast toast-${t.kind}`}
          onClick={() => dismiss(t.id)}
        >
          <span className="toast-icon">{ICONS[t.kind]}</span>
          <span className="toast-msg">{t.message}</span>
        </button>
      ))}
    </div>
  );
}
