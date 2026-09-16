interface Props {
  message: string | null
}

export function BottomStrip({ message }: Props) {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const isError = message?.toLowerCase().startsWith('error') || message?.toLowerCase().startsWith('failed')

  return (
    <div className="bottom-strip">
      <span style={isError ? { color: 'var(--status-danger)' } : undefined}>
        {message ?? 'Ready'}
      </span>
      <span>{now}</span>
    </div>
  )
}
