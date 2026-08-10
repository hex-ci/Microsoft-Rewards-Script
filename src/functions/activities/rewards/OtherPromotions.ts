import { randomUUID } from 'crypto'
import { BaseActivity } from '../BaseActivity'
import { URLs } from '../../../constants/urls'
import { BING_APP_USER_AGENT } from '../../../constants/userAgents'
import type { HttpRequestConfig } from '../../../util/Http'

interface SaiosPromotionAttributes {
    complete?: string
    max?: number
    State?: string
    type?: string
    hidden?: string
    daily_set_date?: string
    offerid: string
}

interface SaiosPromotion {
    attributes: SaiosPromotionAttributes
}

interface SaiosMeResponse {
    code?: number
    response?: {
        promotions?: SaiosPromotion[]
        balance?: number
    }
}

export class OtherPromotions extends BaseActivity {
    public async run(): Promise<void> {
        let oldBalance = this.bot.userData.currentPoints
        let totalGainedPoints = 0

        try {
            const request: HttpRequestConfig = {
                url: URLs.platform.meSAIOS('SAIOS'),
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.bot.accessToken}`,
                    'User-Agent': BING_APP_USER_AGENT,
                    'X-Rewards-Country': this.bot.userData.geoLocale,
                    'X-Rewards-Language': 'zh',
                    'X-Rewards-IsMobile': '',
                    'X-Rewards-AppId': 'SAIOS/32.5.431027001',
                    'X-Rewards-PartnerId': 'startapp',
                    'X-Rewards-Flights': 'rwgobig'
                }
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'OTHER-PROMOTIONS',
                `Sending promotion request | url=${request.url}`
            )

            const response = await this.bot.http.request<SaiosMeResponse>(request)

            this.bot.logger.debug(
                this.bot.isMobile,
                'OTHER-PROMOTIONS',
                `Received promotion response | status=${response.status}`
            )

            if (response.data.code != 0) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'GET-OTHER-PROMOTION-DATA',
                    `API responded with non-zero code: ${response.data.code}`
                )
                return
            }

            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const activitiesUncompleted =
                response.data.response?.promotions?.filter(x => {
                    if (x.attributes.complete == 'True') return false
                    if ((x.attributes.max ?? 0) <= 0) return false
                    if (x.attributes.State == 'locked') return false
                    if (!x.attributes.type) return false
                    if (x.attributes.hidden == 'True') return false

                    const dailySetDate = x.attributes.daily_set_date
                    if (typeof dailySetDate === 'string') {
                        const [monthValue, dayValue, yearValue] = dailySetDate.split('/')
                        const month = Number(monthValue)
                        const day = Number(dayValue)
                        const year = Number(yearValue)

                        if (Number.isInteger(month) && Number.isInteger(day) && Number.isInteger(year)) {
                            const activityDate = new Date(year, month - 1, day)

                            if (
                                activityDate.getFullYear() === year &&
                                activityDate.getMonth() === month - 1 &&
                                activityDate.getDate() === day &&
                                activityDate > today
                            ) {
                                return false
                            }
                        }
                    }

                    if (x.attributes.type != 'urlreward') return false

                    return true
                }) ?? []

            this.bot.logger.info(
                this.bot.isMobile,
                'OTHER-PROMOTIONS',
                `Current balance before processing | oldBalance=${oldBalance}`
            )

            if (!activitiesUncompleted.length) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'OTHER-PROMOTIONS',
                    'All "Other Promotions" items have already been completed'
                )
                return
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'OTHER-PROMOTIONS',
                `Started solving ${activitiesUncompleted.length} "Other Promotions" items`
            )

            for (const activity of activitiesUncompleted) {
                try {
                    const offerId = activity.attributes.offerid

                    this.bot.logger.info(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Starting activity | offerId=${offerId} | oldBalance=${oldBalance}`
                    )

                    const jsonData = {
                        id: randomUUID(),
                        amount: 1,
                        type: 101,
                        attributes: {
                            offerid: offerId
                        },
                        country: this.bot.userData.geoLocale,
                        channel: 'SAIOS',
                        risk_context: {}
                    }

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Prepared activity payload | offerId=${offerId} | id=${jsonData.id} | amount=${jsonData.amount} | type=${jsonData.type} | country=${jsonData.country}`
                    )

                    const activityRequest: HttpRequestConfig = {
                        url: URLs.platform.activities,
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${this.bot.accessToken}`,
                            'User-Agent': BING_APP_USER_AGENT,
                            'Content-Type': 'application/json',
                            'X-Rewards-Country': this.bot.userData.geoLocale,
                            'X-Rewards-Language': 'zh',
                            'X-Rewards-IsMobile': '',
                            'X-Rewards-AppId': 'SAIOS/32.5.431027001',
                            'X-Rewards-PartnerId': 'startapp',
                            'X-Rewards-Flights': 'rwgobig'
                        },
                        data: JSON.stringify(jsonData)
                    }

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Sending activity request | offerId=${offerId} | url=${activityRequest.url}`
                    )

                    const activityResponse = await this.bot.http.request<{ response?: { balance?: number } }>(
                        activityRequest
                    )

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Received activity response | offerId=${offerId} | status=${activityResponse.status}`
                    )

                    const newBalance = Number(activityResponse?.data?.response?.balance ?? oldBalance)
                    const gainedPoints = newBalance - oldBalance

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Balance delta after activity | offerId=${offerId} | oldBalance=${oldBalance} | newBalance=${newBalance} | gainedPoints=${gainedPoints}`
                    )

                    if (gainedPoints > 0) {
                        totalGainedPoints += gainedPoints
                        this.bot.userData.currentPoints = newBalance
                        this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints

                        this.bot.logger.info(
                            this.bot.isMobile,
                            'OTHER-PROMOTIONS',
                            `Completed activity | offerId=${offerId} | gainedPoints=${gainedPoints} | oldBalance=${oldBalance} | newBalance=${newBalance}`,
                            'green'
                        )
                    } else {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'OTHER-PROMOTIONS',
                            `Completed activity with no points | offerId=${offerId} | oldBalance=${oldBalance} | newBalance=${newBalance}`
                        )
                    }

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Waiting after activity | offerId=${offerId}`
                    )

                    oldBalance = newBalance
                    await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
                } catch (error) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Error while solving activity | offerId=${activity.attributes.offerid} | message=${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'OTHER-PROMOTIONS',
                `All "Other Promotions" items have been completed | totalGainedPoints=${totalGainedPoints} | finalBalance=${this.bot.userData.currentPoints}`
            )
        } catch {
            this.bot.logger.warn(this.bot.isMobile, 'GET-OTHER-PROMOTION-DATA', 'API failed')
        }
    }
}
