import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { useAppStore } from "../state/store";
import { useT } from "../state/useT";
import { appInfo, type AppInfo } from "../lib/system/info";
import { APP_VERSION } from "../lib/version";

/** What the app is running on — the first thing to ask for in a bug report. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const env = useAppStore((s) => s.env);
  const t = useT();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    appInfo()
      .then(setInfo)
      .catch((e) => setError(String(e)));
  }, []);

  // The frontend and the Rust bundle carry the version separately; `bun run
  // version` keeps them in step, so a difference means a stale build.
  const mismatch = info != null && info.version !== APP_VERSION;

  const rows: [string, string][] = [
    [t("about.version"), APP_VERSION],
    ...(info
      ? ([
          [t("about.bundle"), `${info.version}${info.debug ? " (debug)" : ""}`],
          [t("about.identifier"), info.identifier],
          [t("about.tauri"), info.tauri],
          [t("about.platform"), `${info.os} · ${info.arch}`],
        ] as [string, string][])
      : []),
    [
      t("about.database"),
      env.dbSchema != null ? `schema v${env.dbSchema}` : t("about.unavailable"),
    ],
    [t("about.ffmpeg"), env.ffmpeg ?? t("about.unavailable")],
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <h2>
          <Info size={16} /> {t("about.title")}
          <span className="spacer" />
          <button className="icon-only" title={t("settings.close")} onClick={onClose}>
            <X size={14} />
          </button>
        </h2>

        <div className="about-head">
          <img className="about-logo" src="/logo-srt-editor.png" alt="" />
          <div>
            <strong>{t("app.name")}</strong>
            <p className="muted">{t("about.tagline")}</p>
          </div>
        </div>

        <dl className="about-grid">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {mismatch && <p className="form-error">{t("about.mismatch")}</p>}
        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <span className="spacer" />
          <button className="primary" onClick={onClose}>
            {t("settings.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
