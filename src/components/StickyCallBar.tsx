import { DEALER } from '@/lib/dealer'
import { MessageIcon, PhoneIcon } from './icons'

/**
 * Tap-to-call is the #1 conversion action for this audience -- mobile,
 * often on cellular data, more likely to call than fill out a form. This
 * bar keeps a `tel:` link reachable with a thumb from every screen on
 * mobile. Hidden at md and up, where the header's call button is already
 * always visible.
 */
export function StickyCallBar() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-sticky-call-bar border-t border-navy/10 bg-cream/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex gap-2 p-2">
        <a
          href={DEALER.smsHref}
          className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-navy px-3 text-sm font-bold text-navy"
        >
          <MessageIcon className="h-4 w-4" />
          Text Us
        </a>
        <a
          href={DEALER.phoneTel}
          className="flex min-h-11 flex-[2] cursor-pointer items-center justify-center gap-2 rounded-md bg-red px-3 text-sm font-bold text-cream"
        >
          <PhoneIcon className="h-4 w-4" />
          Call {DEALER.phoneDisplay}
        </a>
      </div>
    </div>
  )
}
