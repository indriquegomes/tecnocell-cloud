import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: 'https://b49afcb45f08615c6f7ea4bd20016251@o4512001193607168.ingest.us.sentry.io/4512001222377472',
  tracesSampleRate: 1,
})
