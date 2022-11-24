import { RefreshingAuthProvider } from '@twurple/auth'

import findUser from '../../dota/lib/connectedStreamers'
import { hasTokens } from './hasTokens'

export const getChannelAuthProvider = function (channel: string, userId: string) {
  if (!hasTokens) {
    throw new Error('Missing twitch tokens')
  }

  const twitchTokens = findUser(userId)

  if (!twitchTokens?.account.access_token || !twitchTokens.account.refresh_token) {
    console.log('[TWITCHSETUP]', 'Missing twitch tokens', channel)
    return {}
  }

  console.log('[TWITCHSETUP]', 'Retrieved twitch access tokens', channel)

  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID ?? '',
      clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
    },
    {
      scope: [
        'openid',
        'user:read:email',
        'channel:manage:predictions',
        'channel:manage:polls',
        'channel:read:predictions',
        'channel:read:polls',
      ],
      expiresIn: 86400,
      obtainmentTimestamp: Date.now(),
      accessToken: twitchTokens.account.access_token,
      refreshToken: twitchTokens.account.refresh_token,
    },
  )

  return { providerAccountId: twitchTokens.account.providerAccountId, authProvider }
}