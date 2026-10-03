'use client'

import { useState, type FormEvent } from 'react'
import { CheckCircleIcon } from './icons'

/**
 * The form half of VehicleRequest. A plain POST to Formspree, so it still
 * works before (or without) JavaScript -- the shopper just lands on
 * Formspree's thank-you page instead of seeing the inline confirmation.
 * With JS it submits in place and never leaves the site.
 *
 * Every field here is named in the privacy policy. Adding one means
 * editing src/app/privacy/page.tsx in the same commit.
 */

const inputClass =
  'min-h-11 w-full rounded-md border border-navy/20 bg-cream px-3 text-base text-navy'
const labelClass = 'flex flex-col gap-1 text-left text-sm font-semibold text-navy'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function VehicleRequestForm({ endpoint }: { endpoint: string }) {
  const [status, setStatus] = useState<Status>('idle')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setStatus('sending')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`Formspree responded ${res.status}`)
      form.reset()
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div role="status" className="mx-auto mt-6 flex max-w-md flex-col items-center gap-2 text-navy">
        <CheckCircleIcon className="h-8 w-8 text-red" />
        <p className="font-semibold">Got it — thanks!</p>
        <p className="text-navy/70">We&apos;ll reach out when something like it comes in.</p>
      </div>
    )
  }

  return (
    <form
      action={endpoint}
      method="POST"
      onSubmit={onSubmit}
      className="mx-auto mt-6 grid w-full max-w-md gap-3"
    >
      <input type="hidden" name="_subject" value="Website: customer looking for a car" />
      {/* Honeypot: Formspree silently drops submissions that fill this in. */}
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <label className={labelClass}>
        What are you looking for?
        <textarea
          name="looking_for"
          required
          rows={3}
          placeholder="e.g. 2015 or newer Honda CR-V, under 120k miles"
          className={`${inputClass} py-2`}
        />
      </label>
      <label className={labelClass}>
        Budget <span className="font-normal text-navy/60">(optional)</span>
        <input name="budget" inputMode="numeric" placeholder="e.g. $12,000" className={inputClass} />
      </label>
      <label className={labelClass}>
        Your name
        <input name="name" required autoComplete="name" className={inputClass} />
      </label>
      <label className={labelClass}>
        Phone number
        <input name="phone" type="tel" required autoComplete="tel" className={inputClass} />
      </label>
      <label className={labelClass}>
        Email <span className="font-normal text-navy/60">(optional)</span>
        <input name="email" type="email" autoComplete="email" className={inputClass} />
      </label>

      <button
        type="submit"
        disabled={status === 'sending'}
        className="flex min-h-12 cursor-pointer items-center justify-center rounded-md bg-red px-5 text-base font-bold text-cream hover:bg-red-dark disabled:cursor-wait disabled:opacity-70"
      >
        {status === 'sending' ? 'Sending…' : 'Let me know when one comes in'}
      </button>

      {status === 'error' && (
        <p role="alert" className="text-sm text-red">
          That didn&apos;t go through. Please try again, or call or text us below.
        </p>
      )}
      <p className="text-xs text-navy/60">
        We&apos;ll only use this to contact you about this request. No mailing lists.
      </p>
    </form>
  )
}
