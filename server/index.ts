import { createApp } from './app.js'

const defaultPort = process.env.NODE_ENV === 'production' ? 80 : 3001
const port = Number(process.env.PORT ?? process.env.COOLDEV_SERVER_PORT ?? defaultPort)
const host = process.env.HOST ?? '0.0.0.0'

createApp().listen(port, host, () => {
  console.log(`CoolDev server listening on http://${host}:${port}`)
})
