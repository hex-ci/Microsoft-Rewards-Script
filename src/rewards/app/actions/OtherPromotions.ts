// Fork enhancement (hex-ci): solve the SAIOS "Other Promotions" surface.
//
// The app dashboard only exposes `sapphire` / `checkin` / `msnreadearn` items to
// AppPromotions, so plain `urlreward` promotions that only exist on the SAIOS
// `options=612` response are never completed. This activity reads that surface,
// completes each eligible offer and verifies the credit through the balance.

import { randomUUID } from 'node:crypto'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { activityResult, activityFailure, type ActivityResult } from '../../shared/ActivityResult'
import { pointDelta, pointValue } from '../../shared/PointAccounting'
import { runTaskWithDelay } from '../../shared/TaskPacing'
import { URLs } from '../../../constants/urls'

const CHANNEL = 'SAIOS'
const APP_ID = 'SAIOS/32.5.431027001'
const PARTNER_ID = 'startapp'
const FLIGHTS = 'rwgobig'

interface SaiosAttributes {
    complete?: string
    max?: number | string
    State?: string
    type?: string
    hidden?: string
    daily_set_date?: string
    offerid: string
}

interface SaiosPromotion {
    attributes: SaiosAttributes
}

interface SaiosResponse {
    response?: { promotions?: SaiosPromotion[]; balance?: number }
}

function isFutureDailySetDate(value: string | undefined, today: number): boolean {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value?.trim() ?? '')
    if (!match) return false
    const month = Number(match[1])
    const day = Number(match[2])
    const year = Number(match[3])
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false
    return date.getTime() > today
}

export class OtherPromotions extends BaseActivity {
    async run(): Promise<ActivityResult> {
        if (!this.bot.userData.geoLocale) return activityResult('skipped', 'locale-unavailable')
        const balanceBefore = this.bot.userData.currentPoints
        let totalGained = 0

        let promotions: SaiosPromotion[]
        let balance: number
        try {
            const response = await this.request<SaiosResponse>({
                url: URLs.platform.meSAIOS(CHANNEL),
                method: 'GET'
            })
            promotions = response.response?.promotions ?? []
            balance = pointValue(response.response?.balance) ?? balanceBefore
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.warn(
                this.bot.isMobile,
                'OTHER-PROMOTIONS',
                `SAIOS promotion list unavailable | ${error instanceof Error ? error.message : String(error)}`
            )
            return activityFailure(error)
        }

        const today = new Date().setHours(0, 0, 0, 0)
        const pending = promotions.filter(promotion => {
            const attributes = promotion.attributes
            if (attributes.complete?.trim().toLowerCase() === 'true') return false
            if ((pointValue(attributes.max) ?? 0) <= 0) return false
            if (attributes.State?.trim().toLowerCase() === 'locked') return false
            if (attributes.hidden?.trim().toLowerCase() === 'true') return false
            if (attributes.type?.trim().toLowerCase() !== 'urlreward') return false
            return !isFutureDailySetDate(attributes.daily_set_date, today)
        })

        if (!pending.length) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'OTHER-PROMOTIONS',
                'No pending "Other Promotions" items are available'
            )
            return activityResult('skipped', 'no-pending-offers')
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'OTHER-PROMOTIONS',
            `Started solving "Other Promotions" items | remaining=${pending.length}`
        )

        let previousBalance = balance
        let confirmed = 0
        let failed = 0
        for (const promotion of pending) {
            const result = await runTaskWithDelay(this.bot, () => this.complete(promotion, previousBalance), {
                source: 'other',
                promotion: { title: promotion.attributes.offerid, offerId: promotion.attributes.offerid }
            })
            this.bot.recordActivity('other-promotions', result)
            if (typeof result.balanceAfter === 'number') previousBalance = result.balanceAfter
            if (result.pointsGained > 0) totalGained += result.pointsGained
            if (result.status === 'confirmed') confirmed++
            else if (result.status === 'failed') failed++
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'OTHER-PROMOTIONS',
            `All "Other Promotions" items processed | confirmed=${confirmed} | failed=${failed} | pointsGained=${totalGained} | currentBalance=${this.bot.userData.currentPoints}`
        )
        this.bot.signal.throwIfAborted()
        return {
            ...activityResult(
                confirmed > 0 ? 'confirmed' : failed === pending.length ? 'failed' : 'unconfirmed',
                `other-promotions-processed`,
                undefined,
                totalGained
            ),
            balanceBefore,
            balanceAfter: this.bot.userData.currentPoints
        }
    }

    private async complete(promotion: SaiosPromotion, previousBalance: number): Promise<ActivityResult> {
        const offerId = promotion.attributes.offerid
        try {
            const response = await this.request<{ response?: { balance?: number } }>({
                url: URLs.platform.activities,
                method: 'POST',
                data: JSON.stringify({
                    id: randomUUID(),
                    amount: 1,
                    type: 101,
                    attributes: { offerid: offerId },
                    country: this.bot.userData.geoLocale,
                    channel: CHANNEL,
                    risk_context: {}
                })
            })
            const balanceAfter = pointValue(response.response?.balance) ?? pointValue(previousBalance)
            const gained = pointDelta(previousBalance, balanceAfter)
            if (balanceAfter !== null) this.bot.userData.currentPoints = balanceAfter

            if (gained !== null && gained > 0) {
                return {
                    ...activityResult('confirmed', 'balance-confirmed', offerId, gained),
                    balanceBefore: previousBalance,
                    balanceAfter
                }
            }
            return {
                ...activityResult('unconfirmed', 'balance-unchanged', offerId),
                balanceBefore: previousBalance,
                balanceAfter
            }
        } catch (error) {
            this.bot.signal.throwIfAborted()
            return activityFailure(error, offerId)
        }
    }

    private async request<T>(config: { url: string; method: 'GET' | 'POST'; data?: string }): Promise<T> {
        const response = await this.bot.http.request<{ code?: number } & T>({
            url: config.url,
            method: config.method,
            data: config.data,
            headers: {
                Authorization: `Bearer ${this.bot.accessTokens.mobile}`,
                Accept: '*/*',
                'User-Agent': this.bot.appIdentity.userAgent,
                ...(config.data ? { 'Content-Type': 'application/json' } : {}),
                'X-Rewards-Country': this.bot.userData.geoLocale,
                'X-Rewards-Language': this.bot.userData.langCode,
                'X-Rewards-IsMobile': '',
                'X-Rewards-AppId': APP_ID,
                'X-Rewards-PartnerId': PARTNER_ID,
                'X-Rewards-Flights': FLIGHTS
            },
            retries: 0
        })
        if (response.data.code !== undefined && response.data.code !== 0) {
            throw new Error(`SAIOS API responded with code ${response.data.code}`)
        }
        return response.data as T
    }
}
