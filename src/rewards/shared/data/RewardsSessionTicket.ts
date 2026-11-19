// Fork enhancement (hex-ci): persist the rewards.bing.com session ticket.
//
// `rewards.bing.com/api/getuserinfo` -- the primary dashboard endpoint -- answers
// with a "JavaScript required to sign in" HTML placeholder unless the request
// carries the `tifacfaatcs` cookie. That cookie is not a login credential and is
// not issued by /earn: only a document navigation to an /api/* endpoint under
// rewards.bing.com hands it out. Without it the primary endpoint always degrades
// to the Bing flyout fallback, which leaves punchCards / dailySetPromotions /
// morePromotions starved.
//
// Verified 2026-09-19 by single-variable A/B on /api/getuserinfo:
//   saved cookies only -> 35,955 B text/html
//   saved cookies + this cookie -> 624,142 B JSON
// The cookie is necessary and sufficient, and expires in ~14 days.
//
// Self-contained and additive: delete this file plus the single call site in
// AccountData.getDashboardData when upstream fixes the endpoint itself.

import type { Page } from 'patchright'
import type { BotContext } from '../../../core/BotContext'
import { URLs } from '../../../constants/urls'
import { browserTimeout } from '../../../browser/BrowserTiming'

export const REWARDS_SESSION_TICKET = 'tifacfaatcs'

const TICKET_WAIT_MS = 10_000
const TICKET_POLL_MS = 500

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function hasTicket(cookies: Array<{ name: string }>): boolean {
    return cookies.some(cookie => cookie.name === REWARDS_SESSION_TICKET)
}

/**
 * Navigates the existing browser context to the legacy endpoint once so the site
 * issues the ticket into that context. Never throws: a failure only means the run
 * continues with the existing flyout fallback.
 */
export async function ensureRewardsSessionTicket(bot: BotContext, source = 'REWARDS-TICKET'): Promise<boolean> {
    const page = bot.activePage
    if (!page || page.isClosed()) return false

    try {
        const context = page.context()
        if (hasTicket(await context.cookies())) {
            bot.logger.debug(bot.isMobile, source, `${REWARDS_SESSION_TICKET} already present in context`)
            return true
        }

        const probe: Page = await context.newPage()
        try {
            await probe
                .goto(URLs.rewards.userInfoApi, {
                    waitUntil: 'domcontentloaded',
                    timeout: browserTimeout(bot, 'navigation')
                })
                .catch(() => undefined)

            const deadline = Date.now() + Math.min(TICKET_WAIT_MS, browserTimeout(bot, 'navigation'))
            while (Date.now() < deadline) {
                if (hasTicket(await context.cookies())) {
                    bot.logger.info(
                        bot.isMobile,
                        source,
                        `Acquired ${REWARDS_SESSION_TICKET} - primary dashboard endpoint returns full JSON`
                    )
                    return true
                }
                await sleep(TICKET_POLL_MS)
            }

            bot.logger.debug(
                bot.isMobile,
                source,
                `${REWARDS_SESSION_TICKET} not issued after navigation; continuing with existing fallback`
            )
            return false
        } finally {
            await probe.close().catch(() => undefined)
        }
    } catch (error) {
        bot.logger.debug(
            bot.isMobile,
            source,
            `Could not ensure ${REWARDS_SESSION_TICKET} | ${error instanceof Error ? error.message : String(error)}`
        )
        return false
    }
}
