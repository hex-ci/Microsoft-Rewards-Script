import { URLs } from '../constants/urls'
import { BING_APP_USER_AGENT } from '../constants/userAgents'
import type { HttpRequestConfig } from '../util/Http'
import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../index'
import type { DashboardData, PunchCard, BasePromotion } from '../interface/DashboardData'
import type { AppDashboardData } from '../interface/AppDashBoardData'
import type { QuestChild, ParentQuest } from '../browser/ReactFunc'
import { randomUUID } from 'crypto'

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

export class Workers {
    public bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    public async doDailySet(data: DashboardData) {
        const todayKey = this.bot.utils.getFormattedDate()
        const todayData = data.dashboard.dailySetPromotions[todayKey]

        const activitiesUncompleted = todayData?.filter(x => !x?.complete && x.pointProgressMax > 0) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'All "Daily Set" items have already been completed')
            return
        }

        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'Started solving "Daily Set" items')

        await this.solveActivities(activitiesUncompleted)

        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'All "Daily Set" items have been completed')
    }

    public async doMorePromotions(data: DashboardData) {
        const morePromotions: BasePromotion[] = [
            ...new Map(
                [
                    ...(data.dashboard.morePromotions ?? []),
                    ...(data.dashboard.morePromotionsWithoutPromotionalItems ?? [])
                ]
                    .filter(Boolean)
                    .map(p => [p.offerId, p as BasePromotion] as const)
            ).values()
        ]

        const activitiesUncompleted: BasePromotion[] =
            morePromotions?.filter(x => {
                if (x.complete) return false
                if (x.pointProgressMax <= 0) return false
                if (x.exclusiveLockedFeatureStatus === 'locked') return false
                if (!x.promotionType) return false
                if (x.priority < 0 && x.exclusiveLockedFeatureStatus !== 'unlocked') return false
                if (x.attributes?.promotional === 'True') return false
                return true
            }) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.logger.info(
                this.bot.isMobile,
                'MORE-PROMOTIONS',
                'All "More Promotion" items have already been completed'
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'MORE-PROMOTIONS',
            `Started solving ${activitiesUncompleted.length} "More Promotions" items`
        )

        await this.solveActivities(activitiesUncompleted)

        this.bot.logger.info(this.bot.isMobile, 'MORE-PROMOTIONS', 'All "More Promotion" items have been completed')
    }

    public async doOtherPromotions() {
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

    public async doAppPromotions(data: AppDashboardData) {
        const appRewards = data.response.promotions.filter(x => {
            if (x.attributes['complete']?.toLowerCase() !== 'false') return false
            if (!x.attributes['offerid']) return false
            if (!x.attributes['type']) return false
            if (x.attributes['type'] !== 'sapphire') return false

            return true
        })

        if (!appRewards.length) {
            this.bot.logger.info(
                this.bot.isMobile,
                'APP-PROMOTIONS',
                'All "App Promotions" items have already been completed'
            )
            return
        }

        for (const reward of appRewards) {
            await this.bot.activities.doAppReward(reward)
            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
        }

        this.bot.logger.info(this.bot.isMobile, 'APP-PROMOTIONS', 'All "App Promotions" items have been completed')
    }

    public async doPunchCards(data: DashboardData, page: Page) {
        let parents: ParentQuest[]

        try {
            const earn = await page.request.get(URLs.rewards.earn)
            if (!earn.ok()) {
                this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD', `/earn ${earn.status()} - cannot list quests`)
                return
            }
            const html = await earn.text()
            parents = this.bot.browser.react.snapshotQuestList(html)

            // Some deploys render the carousel only on /dashboard
            if (!parents.length) {
                const dash = await page.request.get(URLs.rewards.dashboard)
                if (dash.ok()) parents = this.bot.browser.react.snapshotQuestList(html, await dash.text())
            }
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'PUNCHCARD',
                `Failed fetching /earn for quest list | ${error instanceof Error ? error.message : String(error)}`
            )
            return
        }

        const apiById = new Map(
            (data.dashboard.punchCards ?? [])
                .filter(c => c.parentPromotion?.offerId)
                .map(c => [c.parentPromotion.offerId, c] as const)
        )

        const seen = new Set(parents.map(p => p.offerId))
        for (const card of apiById.values()) {
            const pp = card.parentPromotion
            if (!pp?.offerId || seen.has(pp.offerId)) continue
            parents.push({
                offerId: pp.offerId,
                title: pp.title ?? '',
                pointProgressMax: pp.pointProgressMax ?? 0,
                complete: !!pp.complete
            })
            seen.add(pp.offerId)
        }

        for (const p of parents) {
            if (p.pointProgressMax <= 0) {
                p.pointProgressMax = apiById.get(p.offerId)?.parentPromotion?.pointProgressMax ?? p.pointProgressMax
            }
        }

        const incomplete = parents.filter(p => {
            if (p.complete) return false
            if (this.bot.config.skipNonPointTasks && p.pointProgressMax <= 0) return false
            return true
        })
        if (!incomplete.length) {
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'No actionable quests')
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Found ${incomplete.length} incomplete quest(s) on /earn | api-matched=${incomplete.filter(p => apiById.has(p.offerId)).length}`
        )

        for (const parent of incomplete) {
            try {
                await this.solvePunchCard(parent, apiById.get(parent.offerId), page)
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'PUNCHCARD',
                    `Error solving quest "${parent.title || parent.offerId}" | message=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'Finished processing quests')
    }

    public async doClaimBonusPoints(data: DashboardData) {
        const pointsActivity = data.dashboard.pointClaimBannerPromotion

        if (!pointsActivity) {
            this.bot.logger.info(this.bot.isMobile, 'CLAIM-BONUS-POINTS', 'No claim bonus points banner found')
            return
        }

        if (pointsActivity.complete) {
            this.bot.logger.info(
                this.bot.isMobile,
                'CLAIM-BONUS-POINTS',
                `Bonus points have already been claimed | offerId=${pointsActivity.offerId}`
            )
            return
        }

        await this.bot.activities.doClaimBonusPoints()

        this.bot.logger.info(
            this.bot.isMobile,
            'CLAIM-BONUS-POINTS',
            `Bonus points have been claimed | title="${pointsActivity.title}" | offerId=${pointsActivity.offerId}`
        )
    }

    private async solvePunchCard(parent: ParentQuest, apiCard: PunchCard | undefined, page: Page) {
        const parentId = parent.offerId
        const title = parent.title || apiCard?.parentPromotion?.title || parentId

        let questChildren: QuestChild[]
        try {
            const res = await page.request.get(URLs.rewards.quest(parentId))
            if (!res.ok()) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'PUNCHCARD',
                    `Quest page ${res.status()} for "${title}" - skipping`
                )
                return
            }
            questChildren = this.bot.browser.react.snapshotQuestPage(await res.text())
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'PUNCHCARD',
                `Failed fetching quest page for "${title}" | ${error instanceof Error ? error.message : String(error)}`
            )
            return
        }

        if (!questChildren.length) {
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `No actionable children rendered for "${title}"`)
            return
        }

        const apiChildById = new Map(
            (apiCard?.childPromotions ?? []).filter(c => c.offerId).map(c => [c.offerId, c] as const)
        )
        const ordered = [...questChildren].sort(
            (a, b) =>
                (apiChildById.get(a.offerId)?.priority ?? Number.MAX_SAFE_INTEGER) -
                (apiChildById.get(b.offerId)?.priority ?? Number.MAX_SAFE_INTEGER)
        )

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Solving "${title}" | children=${ordered.length} | reportable=${ordered.filter(c => c.reportable).length}`
        )

        const startBalance = this.bot.userData.currentPoints
        let reported = 0
        let remaining = 0

        for (const child of ordered) {
            const offerId = child.offerId
            const api = apiChildById.get(offerId)

            if (!child.reportable) {
                remaining++
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'PUNCHCARD',
                    `Skip ${offerId}: not reportable (locked=${child.isLocked} disabled=${child.isDisabled} done=${child.isCompleted} hash=${!!child.hash})`
                )
                continue
            }

            if (this.isSearchQuotaChild(offerId, api)) {
                remaining++
                this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `Skip ${offerId}: multi-day search task`)
                continue
            }

            if (this.isClaimChild(offerId, api)) {
                if (!this.bot.config.autoClaimPunchcardRewards) {
                    remaining++
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'PUNCHCARD',
                        `Reward for "${title}" ready to claim - left for manual redemption (autoClaimPunchcardRewards=false) | ${offerId}`
                    )
                    continue
                }
                await this.bot.activities.doClaimReward(child, parentId)
                reported++
                continue
            }

            await this.reportQuestChild(child, parentId)
            reported++
            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
        }

        const gained = this.bot.userData.currentPoints - startBalance
        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Quest "${title}" ${remaining === 0 ? 'COMPLETE' : 'in progress'} | reported=${reported}${remaining ? ` | remaining=${remaining}` : ''} | pointsGained=${gained} | currentBalance=${this.bot.userData.currentPoints}${parent.pointProgressMax > 0 ? ` | targetPoints=${parent.pointProgressMax}` : ''}`,
            gained > 0 ? 'green' : undefined
        )
    }

    private async reportQuestChild(child: QuestChild, parentId: string) {
        const offerId = child.offerId
        const actionId = this.bot.nextActions.reportActivity
        if (!actionId) {
            this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD', `Skip ${offerId}: "reportActivity" not discovered`)
            return
        }
        if (!child.hash) {
            this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD', `Skip ${offerId}: no live hash on quest child`)
            return
        }

        const oldBalance = this.bot.userData.currentPoints
        try {
            const questUrl = URLs.rewards.quest(parentId)
            const { status, acknowledged } = await this.bot.browser.func.reportServerAction(
                actionId,
                [
                    child.hash,
                    11,
                    { offerid: offerId, isPromotional: '$undefined', timezoneOffset: this.bot.userData.timezoneOffset }
                ],
                {
                    url: questUrl,
                    referer: questUrl,
                    routerStateTree: this.bot.browser.react.questRouterStateTree(parentId)
                }
            )

            const newBalance = await this.bot.browser.func.getCurrentPoints()
            const gained = newBalance - oldBalance
            if (gained > 0) {
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'PUNCHCARD',
                `Reported child | offerId=${offerId} | status=${status} | acknowledged=${acknowledged} | pointsGained=${gained} | currentBalance=${newBalance}`,
                gained > 0 || acknowledged ? 'green' : undefined
            )
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'PUNCHCARD',
                `Error reporting child | offerId=${offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async solveActivities(activities: BasePromotion[]) {
        for (const activity of activities) {
            try {
                const type = activity.promotionType?.toLowerCase() ?? ''
                const name = activity.name?.toLowerCase() ?? ''
                const offerId = (activity as BasePromotion).offerId

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'ACTIVITY',
                    `Processing activity | title="${activity.title}" | offerId=${offerId} | type=${type}`
                )

                switch (type) {
                    case 'urlreward': {
                        const basePromotion = activity as BasePromotion

                        // Search on Bing are subtypes of "urlreward"
                        const isSearchOnBing = name.includes('exploreonbing')

                        if (isSearchOnBing && !this.bot.config.activities.searchOnBing) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Skipping "SearchOnBing" (disabled in config) | offerId=${offerId}`
                            )
                            continue
                        }
                        if (!isSearchOnBing && !this.bot.config.activities.urlReward) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Skipping "UrlReward" (disabled in config) | offerId=${offerId}`
                            )
                            continue
                        }

                        if (isSearchOnBing) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "SearchOnBing" | title="${activity.title}" | offerId=${offerId}`
                            )

                            const page = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
                            await this.bot.activities.doSearchOnBing(basePromotion, page)
                        } else {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "UrlReward" | title="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doUrlReward(basePromotion)
                        }
                        break
                    }

                    default: {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `Skipped activity "${activity.title}" | offerId=${offerId} | Reason: Unsupported type "${activity.promotionType}"`
                        )
                        break
                    }
                }

                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'ACTIVITY',
                    `Error while solving activity "${activity.title}" | message=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    }

    // Util
    private isSearchQuotaChild(offerId: string, api?: BasePromotion): boolean {
        if (api) {
            const type = (api.promotionType ?? '').toLowerCase()
            const attrType = String(api.attributes?.type ?? '').toLowerCase()
            const progressMax = Number(api.activityProgressMax ?? 0)
            if (type === 'search' || attrType === 'search' || progressMax > 1) {
                return true
            }
        }

        return /search/i.test(offerId) && /(day|streak|\dx)/i.test(offerId)
    }

    private isClaimChild(offerId: string, api?: BasePromotion): boolean {
        const dest = (api?.destinationUrl ?? '').toLowerCase()
        if (/\/redeem\//.test(dest)) return true
        return /(redeem|claim|(?<!url)reward)/i.test(offerId)
    }
}
