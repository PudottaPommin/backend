import { prisma } from './db/prisma.js'
import { getBotAPI } from './twitch/lib/getBotAPI.js'
import axios from './utils/axios.js'

async function getAccounts() {
  // const steam32id = 1234
  // const steamserverid = (await server.dota.getUserSteamServer(steam32id)) as string | undefined
  // const response = await axios(
  //   `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env.STEAM_WEB_API}&server_steam_id=${steamserverid}`,
  // )
  // console.log(steamserverid)
}

// await getAccounts()

async function getFollows() {
  const twitchApi = getBotAPI()

  const bets = await prisma.bet.findMany({
    select: {
      id: true,
      matchId: true,
      myTeam: true,
      user: {
        select: {
          Account: {
            select: {
              providerAccountId: true,
            },
          },
          name: true,
        },
      },
    },
    where: {
      won: null,
    },
    skip: 0,
    take: 10,
    orderBy: {
      createdAt: 'desc',
    },
  })

  // Currently live and streaming
  const allFollow = []
  for (const bet of bets) {
    if (!bet.user.Account?.providerAccountId) continue
    const follows = twitchApi.users.getFollowsPaginated({
      followedUser: bet.user.Account.providerAccountId,
    })
    const totalFollowerCount = await follows.getTotalCount()
    allFollow.push({
      name: bet.user.name,
      follows: totalFollowerCount.toLocaleString(),
      url: `https://twitch.tv/${bet.user.name}`,
    })
  }

  allFollow.sort((a, b) => {
    return parseInt(b.follows.replace(/,/g, '')) - parseInt(a.follows.replace(/,/g, ''))
  })

  console.log(allFollow)
}

async function fixWins() {
  const bets = await prisma.bet.findMany({
    select: {
      id: true,
      matchId: true,
      myTeam: true,
    },
    where: {
      won: null,
    },
    take: 50,
    orderBy: {
      createdAt: 'desc',
    },
  })

  for (const bet of bets) {
    try {
      const match = await axios('https://api.opendota.com/api/matches/' + bet.matchId)
      if (!match.data?.match_id) continue

      console.log({
        matchid: match.data.match_id,
        lobbytype: match.data.lobby_type,
        won: match.data.radiant_win && bet.myTeam === 'radiant',
      })

      await prisma.bet.update({
        where: {
          id: bet.id,
        },
        data: {
          won: match.data.radiant_win && bet.myTeam === 'radiant',
          lobby_type: match.data.lobby_type,
        },
      })
    } catch (e) {
      continue
    }
  }
}

// await fixWins()
// await getFollows()
