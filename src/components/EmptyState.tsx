import Link from 'next/link'
import type { ReactNode } from 'react'
import { CarIcon } from './icons'

type EmptyStateProps = {
  title: string
  message: string
  action?: { href: string; label: string }
  icon?: ReactNode
}

export function EmptyState({ title, message, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-navy/10 bg-white/40 px-6 py-16 text-center">
      <div className="text-navy/30">{icon ?? <CarIcon className="h-12 w-12" />}</div>
      <h2 className="font-display text-xl uppercase tracking-tight text-navy">{title}</h2>
      <p className="max-w-sm text-navy/70">{message}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-2 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-red px-5 text-sm font-bold text-cream hover:bg-red-dark"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
