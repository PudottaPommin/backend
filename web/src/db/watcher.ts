import { Setting, SteamAccount, User } from '@prisma/client'

import { server } from '../dota/index.js'
import findUser from '../dota/lib/connectedStreamers.js'
import { getRankDetail } from '../dota/lib/ranks.js'
import { tellChatNewMMR } from '../dota/lib/updateMmr.js'
import { chatClient } from '../twitch/index.js'
import supabase from './supabase.js'

const channel = supabase.channel('db-changes')

// When a user updates MMR from dashboard and they have client open
channel
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    console.log('[SUPABASE]', 'New user to send bot to: ', payload.new.name)
    chatClient
      .join(payload.new.name)
      .then(() => {
        console.log('[SUPABASE]', 'Joined channel', payload.new.name)
      })
      .catch((e) => {
        console.error('[SUPABASE]', 'Error joining channel', e)
      })
  })
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
    async function handler() {
      const newObj = payload.new as User
      const oldObj = payload.old as User
      const client = findUser(newObj.id)
      if (newObj.mmr !== 0 && client && client.mmr !== newObj.mmr && oldObj.mmr !== newObj.mmr) {
        // dont overwrite with 0 because we use this variable to track currently logged in mmr
        console.log('[WATCHER MMR] Sending mmr to socket', client.name)
        tellChatNewMMR(client.token, newObj.mmr)
        client.mmr = newObj.mmr

        const deets = await getRankDetail(newObj.mmr, client.steam32Id)
        server.io.to(client.token).emit('update-medal', deets)
      }
    }

    void handler()
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
    const newObj = payload.new as Setting
    const client = findUser(newObj.userId)

    // replace the new setting with the one we have saved in cache
    if (client) {
      console.log('[WATCHER SETTING] Updating setting for', client.name, newObj.key)
      const setting = client.settings.find((s) => s.key === newObj.key)

      if (setting) {
        setting.value = newObj.value
      } else {
        client.settings.push({ key: newObj.key, value: newObj.value })
      }

      console.log('[WATCHER SETTING] Sending new setting value to socket', client.name)
      server.io.to(client.token).emit('refresh-settings')
    }
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'steam_accounts' }, (payload) => {
    const newObj = payload.new as SteamAccount
    const oldObj = payload.old as SteamAccount
    const client = findUser(newObj.userId || oldObj.userId)

    // Just here to update local memory
    if (!client) return

    if (payload.eventType === 'DELETE') {
      console.log('[WATCHER STEAM] Deleting steam account for', client.name)
      const oldSteamIdx = client.SteamAccount.findIndex((s) => s.steam32Id === oldObj.steam32Id)
      client.SteamAccount.splice(oldSteamIdx, 1)
      return
    }

    console.log('[WATCHER STEAM] Updating steam accounts for', client.name)

    const currentSteamIdx = client.SteamAccount.findIndex((s) => s.steam32Id === newObj.steam32Id)
    if (currentSteamIdx === -1) {
      client.SteamAccount.push({
        name: newObj.name,
        mmr: newObj.mmr,
        steam32Id: newObj.steam32Id,
      })
    } else {
      client.SteamAccount[currentSteamIdx].name = newObj.name
      client.SteamAccount[currentSteamIdx].mmr = newObj.mmr
    }

    // Push an mmr update to overlay since it's the steam account rn
    if (client.steam32Id === newObj.steam32Id) {
      client.mmr = newObj.mmr
      tellChatNewMMR(client.token, newObj.mmr)
      getRankDetail(newObj.mmr, newObj.steam32Id)
        .then((deets) => {
          server.io.to(client.token).emit('update-medal', deets)
        })
        .catch((e) => {
          console.log('[WATCHER STEAM] Error getting rank detail', e)
        })
    }
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE]', 'Ready to receive database changes!')
    }
  })