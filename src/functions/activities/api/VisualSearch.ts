import { Workers } from '../../Workers'

import type { ParsedOffer, StreakState } from '../../../browser/ReactFunc'
import type { DashboardData } from '../../../interface/DashboardData'

const VISUAL_SEARCH_ACTIVATION_OFFER = 'visualsearch_streak_activation_v2'

const VERIFIED_ACTIVITY_TYPES: Readonly<Record<string, number>> = {
    WW_VisualSearch_SummerJuly26_Activation_Banner: 11
}

const MAX_ATTEMPTS = 3

type ActivationResult = 'activated' | 'already-active' | 'absent' | 'failed'

interface ActivationMetadata {
    activityType: number
    activityTypeSource: 'react' | 'dashboard' | 'verified-fallback'
    isPromotional: boolean
}

export class VisualSearch extends Workers {
    public async doVisualSearch(data: DashboardData): Promise<number> {
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

        const activation = await this.activate(data)

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

    private async activate(data: DashboardData): Promise<ActivationResult> {
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

        const metadata = this.resolveActivationMetadata(offer, data)
        if (!metadata) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Skipping activation: no valid activity type found | offerId=${offer.offerId}`
            )
            return 'failed'
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Activating visual search | offerId=${offer.offerId} | activityType=${metadata.activityType} | activityTypeSource=${metadata.activityTypeSource} | promotional=${metadata.isPromotional} | geo=${this.bot.userData.geoLocale}`
        )

        try {
            const { status, acknowledged } = await this.bot.browser.func.reportServerAction(actionId, [
                offer.hash,
                metadata.activityType,
                {
                    offerid: offer.offerId,
                    isPromotional: metadata.isPromotional ? 'true' : '$undefined',
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

    private resolveActivationMetadata(offer: ParsedOffer, data: DashboardData): ActivationMetadata | null {
        const dashboardPromotion = this.findDashboardPromotion(data.dashboard, offer.offerId)

        if (offer.activityType !== null) {
            return {
                activityType: offer.activityType,
                activityTypeSource: 'react',
                isPromotional: offer.isPromotional || this.dashboardPromotionIsPromotional(dashboardPromotion)
            }
        }

        const dashboardActivityType = this.dashboardPromotionActivityType(dashboardPromotion)
        if (dashboardActivityType !== null) {
            return {
                activityType: dashboardActivityType,
                activityTypeSource: 'dashboard',
                isPromotional: offer.isPromotional || this.dashboardPromotionIsPromotional(dashboardPromotion)
            }
        }

        const verifiedFallback = VERIFIED_ACTIVITY_TYPES[offer.offerId]
        if (verifiedFallback !== undefined) {
            return {
                activityType: verifiedFallback,
                activityTypeSource: 'verified-fallback',
                isPromotional: offer.isPromotional || this.dashboardPromotionIsPromotional(dashboardPromotion)
            }
        }

        return null
    }

    private findDashboardPromotion(root: unknown, offerId: string): Record<string, unknown> | null {
        const target = offerId.toLowerCase()
        const pending: unknown[] = [root]
        const visited = new Set<object>()

        while (pending.length) {
            const value = pending.pop()
            if (!value || typeof value !== 'object' || visited.has(value)) continue
            visited.add(value)

            if (Array.isArray(value)) {
                pending.push(...value)
                continue
            }

            const record = value as Record<string, unknown>
            const attributes = this.asRecord(record.attributes)
            const candidateId = record.offerId ?? record.offerid ?? attributes?.offerid
            if (typeof candidateId === 'string' && candidateId.toLowerCase() === target) return record

            pending.push(...Object.values(record))
        }

        return null
    }

    private dashboardPromotionActivityType(promotion: Record<string, unknown> | null): number | null {
        if (!promotion) return null
        const attributes = this.asRecord(promotion.attributes)
        return this.parseActivityType(
            promotion.activityType ?? promotion.activity_type ?? attributes?.activityType ?? attributes?.activity_type
        )
    }

    private dashboardPromotionIsPromotional(promotion: Record<string, unknown> | null): boolean {
        if (!promotion) return false
        const attributes = this.asRecord(promotion.attributes)
        const value = promotion.isPromotional ?? promotion.promotional ?? attributes?.promotional
        return value === true || (typeof value === 'string' && value.toLowerCase() === 'true')
    }

    private parseActivityType(value: unknown): number | null {
        const parsed = Number(value)
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null
    }

    private asRecord(value: unknown): Record<string, unknown> | null {
        return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
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
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Visual search was reported but not credited (attempt ${attempt}/${MAX_ATTEMPTS}) | query="${visual.query}"`
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `No reportActivity acknowledgement (attempt ${attempt}/${MAX_ATTEMPTS}) | query="${visual.query}"`
                )
            }

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
