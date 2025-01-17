import { NextFunction, Request, Response } from 'express'

import getDBUser from '../db/getDBUser.js'
import { logger } from '../utils/logger.js'
import { invalidTokens, lookingupToken, pendingCheckAuth } from './lib/consts.js'

export function validateToken(req: Request, res: Response, next: NextFunction) {
  // Sent from dota gsi config file
  const token = req.body?.auth?.token as string | undefined

  if (invalidTokens.has(token)) {
    res.status(401).send('Invalid token, skipping auth check')
    return
  }

  if (!token) {
    invalidTokens.add(token)
    logger.info(`[GSI], Dropping message from IP: ${req.ip}, no valid auth token`)
    res.status(401).json({
      error: new Error('Invalid request!'),
    })
    return
  }

  // lookingupToken comes from the gsi handler, which could be true at the same time
  // so getDBUser was returning null, which means this was sending a new auth error and then
  // no longer doing authentications. i think adding the `lookingupToken` check here fixes that
  if (pendingCheckAuth.has(token) || lookingupToken.has(token)) {
    res.status(401).send('Still validating token, skipping requests until auth')
    return
  }

  pendingCheckAuth.set(token, true)
  getDBUser(token)
    .then((client) => {
      if (client?.token) {
        client.gsi = req.body
        pendingCheckAuth.delete(token)

        next()
        return
      }

      pendingCheckAuth.delete(token)
      logger.info('[GSI] io.use Error checking auth 42', { token, client })
      next(new Error('authentication error 42'))
    })
    .catch((e) => {
      logger.info('[GSI] io.use Error checking auth 48', { token, e })
      invalidTokens.add(token)
      pendingCheckAuth.delete(token)
      next(new Error('authentication error 48'))
    })
    // TODO: idk if finally runs when next() is called in a .then() earlier
    // So adding the .deletes to .then and .catch until i figure that out lol
    .finally(() => {
      pendingCheckAuth.delete(token)
    })
}
