import { RefreshingAuthProvider } from '@twurple/auth'

import { logger } from '../../utils/logger.js'
import { getBotTokens } from './getBotTokens.js'
import { hasTokens } from './hasTokens.js'
import { prisma } from '../../db/prisma.js'

export const getBotAuthProvider = async function () {
  if (!hasTokens) {
    throw new Error('Missing twitch tokens')
  }
  const botTokens = await getBotTokens()

  if (!botTokens?.access_token || !botTokens.refresh_token) {
    logger.info('[TWITCHSETUP] Missing bot tokens', {
      twitchId: process.env.TWITCH_BOT_PROVIDERID,
    })
    return false
  }

  const twitchId = process.env.TWITCH_BOT_PROVIDERID

  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID ?? '',
      clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
      onRefresh: (newTokenData) => {
        console.log('[TWITCHSETUP] Refreshing twitch tokens', { twitchId })

        prisma.account
          .update({
            where: {
              providerAccountId: twitchId,
            },
            data: {
              scope: newTokenData.scope.join(' '),
              access_token: newTokenData.accessToken,
              refresh_token: newTokenData.refreshToken ?? botTokens.refresh_token,
              expires_at: Math.floor(
                new Date(newTokenData.obtainmentTimestamp).getTime() / 1000 +
                  (newTokenData.expiresIn ?? 0),
              ),
              expires_in: newTokenData.expiresIn ?? 0,
              obtainment_timestamp: new Date(newTokenData.obtainmentTimestamp),
            },
          })
          .then(() => {
            console.log('[TWITCHSETUP] Updated bot tokens', { twitchId })
          })
          .catch((e) => {
            console.error('[TWITCHSETUP] Failed to update bot tokens', {
              twitchId,
              error: e,
            })
          })
      },
    },
    {
      scope: botTokens.scope?.split(' ') ?? [],
      expiresIn: botTokens.expires_in ?? 0,
      obtainmentTimestamp: botTokens.obtainment_timestamp?.getTime() ?? 0,
      accessToken: botTokens.access_token,
      refreshToken: botTokens.refresh_token,
    },
  )

  return authProvider
}
