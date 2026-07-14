import { Workers } from '../../Workers'

import type { ParsedOffer, StreakState } from '../../../browser/ReactFunc'

const VISUAL_SEARCH_ACTIVATION_OFFER = 'visualsearch_streak_activation_v2'

const VISUAL_SEARCH_ACTIVITY_TYPE = 714

const MAX_ATTEMPTS = 3

type ActivationResult = 'activated' | 'already-active' | 'absent' | 'failed'

export class VisualSearch extends Workers {
    public async doVisualSearch(): Promise<number> {
        if (this.bot.isMobile) {
            this.bot.logger.debug(this.bot.isMobile, 'VISUAL-SEARCH', 'Skipping on mobile - desktop-only activity')
            return 0
        }

        const streak = this.findStreak()
        if (streak?.isCurrentDayCompleted) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Already completed today | visualSearchStreak=${streak.completedDays}/${streak.totalDays}`,
                'green'
            )
            return 0
        }

        const activation = await this.activate()

        const available = !!streak || activation === 'activated' || activation === 'already-active'
        if (!available) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'Visual search not available for this account, skipping'
            )
            return 0
        }

        return await this.performDailySearch()
    }

    private findStreak(): StreakState | undefined {
        return (this.bot.reactSnapshot?.streaks ?? []).find(s => /visual.?search/i.test(s.partner))
    }

    private async activate(): Promise<ActivationResult> {
        const offer = this.findActivationOffer()
        if (!offer) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'No visual-search activation offer present on the dashboard'
            )
            return 'absent'
        }

        if (!offer.reportable) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Visual search already active (or not activatable) | offerId=${offer.offerId}`,
                'green'
            )
            return 'already-active'
        }

        if (!offer.hash) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Activation offer present but missing a hash | offerId=${offer.offerId}`
            )
            return 'failed'
        }

        const actionId = this.bot.nextActions.reportActivity
        if (!actionId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'Skipping activation: "reportActivity" action id not discovered in bundle'
            )
            return 'failed'
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Activating visual search | offerId=${offer.offerId} | geo=${this.bot.userData.geoLocale}`
        )

        try {
            const { status, acknowledged } = await this.bot.browser.func.reportServerAction(actionId, [
                offer.hash,
                VISUAL_SEARCH_ACTIVITY_TYPE,
                {
                    offerid: offer.offerId,
                    isPromotional: '$undefined',
                    timezoneOffset: this.bot.userData.timezoneOffset
                }
            ])

            if (acknowledged) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Activated visual search | offerId=${offer.offerId}`,
                    'green'
                )
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
                return 'activated'
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Activation not acknowledged | offerId=${offer.offerId} | status=${status}`
            )
            return 'failed'
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Activation error | offerId=${offer.offerId} | ${error instanceof Error ? error.message : String(error)}`
            )
            return 'failed'
        }
    }

    private findActivationOffer(): ParsedOffer | null {
        const offers = this.bot.reactSnapshot?.offers ?? []

        const exact = offers.find(o => o.offerId === VISUAL_SEARCH_ACTIVATION_OFFER)
        if (exact) return exact

        return (
            offers.find(o => {
                const id = o.offerId.toLowerCase()
                return id.includes('visualsearch') && id.includes('activation')
            }) ?? null
        )
    }

    private async performDailySearch(): Promise<number> {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const visual = await this.bot.browser.func.acquireVisualSearch()
            if (!visual) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Could not obtain a visual search (attempt ${attempt}/${MAX_ATTEMPTS})`
                )
                await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
                continue
            }

            const res = await this.bot.browser.func.reportVisualSearchActivity(visual)

            if (res.balance != null) this.bot.userData.currentPoints = res.balance

            const gained = res.gained ?? 0
            if (gained > 0) {
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained
                this.bot.logger.info(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Daily visual search done | pointsGained=${gained} | currentBalance=${res.balance} | query="${visual.query}"`,
                    'green'
                )
                return gained
            }

            if (res.ig) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Visual search reported, no new points | "${visual.query}" | likely already completed today`,
                    'green'
                )
                return 0
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `No IG on report (attempt ${attempt}/${MAX_ATTEMPTS}) - retrying with a fresh image`
            )
            await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Daily visual search did not credit after ${MAX_ATTEMPTS} attempts`
        )
        return 0
    }
}
