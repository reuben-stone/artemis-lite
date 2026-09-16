interface Props {
  message: string | null
}

export function BottomStrip({ message }: Props) {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="bottom-strip">
      <span>{message ?? 'Ready'}</span>
      <span>{now}</span>
    </div>
  )
}
