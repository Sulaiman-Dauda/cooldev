import nodemailer from 'nodemailer'

export type PasswordResetDeliveryMode = 'email' | 'server-log'

type MailerConfig = {
  from: string
  host: string
  pass?: string
  port: number
  secure: boolean
  user?: string
}

let cachedTransporter: nodemailer.Transporter | null = null

function readMailerConfig(): MailerConfig | null {
  const host = process.env.COOLDEV_SMTP_HOST?.trim()
  const from = process.env.COOLDEV_SMTP_FROM?.trim()

  if (!host || !from) {
    return null
  }

  return {
    from,
    host,
    pass: process.env.COOLDEV_SMTP_PASS?.trim(),
    port: Number(process.env.COOLDEV_SMTP_PORT ?? 587),
    secure: process.env.COOLDEV_SMTP_SECURE === 'true',
    user: process.env.COOLDEV_SMTP_USER?.trim(),
  }
}

function getTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter) {
    return cachedTransporter
  }

  const config = readMailerConfig()
  if (!config) {
    return null
  }

  cachedTransporter = nodemailer.createTransport({
    auth: config.user
      ? {
          user: config.user,
          pass: config.pass,
        }
      : undefined,
    host: config.host,
    port: config.port,
    secure: config.secure,
  })

  return cachedTransporter
}

export function getPasswordResetDeliveryMode(): PasswordResetDeliveryMode {
  return getTransporter() ? 'email' : 'server-log'
}

export async function deliverPasswordResetLink(input: {
  email: string
  expiresAt: string
  name: string
  resetUrl: string
}): Promise<PasswordResetDeliveryMode> {
  const transporter = getTransporter()
  const config = readMailerConfig()

  if (!transporter || !config) {
    console.info(`[CoolDev password reset] ${input.email} -> ${input.resetUrl} (expires ${input.expiresAt})`)
    return 'server-log'
  }

  try {
    await transporter.sendMail({
      from: config.from,
      html: `
        <p>Hello ${input.name},</p>
        <p>Use the link below to reset your CoolDev password:</p>
        <p><a href="${input.resetUrl}">${input.resetUrl}</a></p>
        <p>This link expires at ${new Date(input.expiresAt).toUTCString()}.</p>
        <p>If you did not request this, you can ignore this message.</p>
      `,
      subject: 'Reset your CoolDev password',
      text: [
        `Hello ${input.name},`,
        '',
        'Use the link below to reset your CoolDev password:',
        input.resetUrl,
        '',
        `This link expires at ${new Date(input.expiresAt).toUTCString()}.`,
        'If you did not request this, you can ignore this message.',
      ].join('\n'),
      to: input.email,
    })

    return 'email'
  } catch (error) {
    console.warn('CoolDev could not send the password reset email. Falling back to the server log.', error)
    console.info(`[CoolDev password reset] ${input.email} -> ${input.resetUrl} (expires ${input.expiresAt})`)
    return 'server-log'
  }
}
