import http from 'node:http'

const DOCKER_SOCKET_PATH = process.env.COOLDEV_DOCKER_SOCKET_PATH || '/var/run/docker.sock'

type DockerResponse = {
  bodyText: string
  statusCode: number
}

function dockerRequest(method: string, requestPath: string, body?: unknown): Promise<DockerResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)

    const request = http.request(
      {
        method,
        path: requestPath,
        socketPath: DOCKER_SOCKET_PATH,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (response) => {
        const chunks: Buffer[] = []

        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })

        response.on('end', () => {
          resolve({
            bodyText: Buffer.concat(chunks).toString('utf8'),
            statusCode: response.statusCode ?? 500,
          })
        })
      },
    )

    request.on('error', reject)

    if (payload) {
      request.write(payload)
    }

    request.end()
  })
}

function assertOk(response: DockerResponse, fallback: string): void {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    return
  }

  throw new Error(response.bodyText || fallback)
}

export async function execInDockerContainer(containerName: string, command: string[]): Promise<string> {
  const createResponse = await dockerRequest('POST', `/containers/${containerName}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: command,
  })
  assertOk(createResponse, `Could not create an exec session in ${containerName}.`)

  const parsed = JSON.parse(createResponse.bodyText) as { Id?: string }
  if (!parsed.Id) {
    throw new Error(`Could not create an exec session in ${containerName}.`)
  }

  const startResponse = await dockerRequest('POST', `/exec/${parsed.Id}/start`, {
    Detach: false,
    Tty: false,
  })
  assertOk(startResponse, `Could not run the exec session in ${containerName}.`)

  return startResponse.bodyText
}
