export function LoadingState({ label = "正在加载数据…" }: { label?: string }) {
  return <div className="async-state" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function EmptyState({ label = "当前筛选下暂无数据" }: { label?: string }) {
  return <div className="async-state" role="status">{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="async-state error-state" role="alert">
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry}>重试</button>}
    </div>
  );
}
