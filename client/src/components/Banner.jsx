export default function Banner({ kind = "info", children, onDismiss }) {
  if (!children) return null;
  return (
    <div className={`banner ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span style={{ flex: 1 }}>{children}</span>
      {onDismiss && (
        <button className="ghost sm" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
