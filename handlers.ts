const { args } = Deno
import * as Path from "https://deno.land/std@0.128.0/path/mod.ts"
import {
  parse,
  acceptWebSocket,
  serve,
  Server,
  serveTLS,
  ServerRequest,
  posix,
} from './deps.ts'

/* Archaeopteryx utils */
import {
  isValidArg,
  printHelp,
  readFile,
  isWebSocket,
  appendReloadScript,
  printStart,
  printRequest,
  error,
  isValidPort,
  inject404,
  setHeaders,
  encode,
  decode,
  info,
  prompt,
  joinPath,
  DirEntry,
  pipe,
} from './utils/utils.ts'

import { html, css, logo } from './utils/boilerplate.ts'
import { getNetworkAddr } from './utils/local-ip.ts'
import dirTemplate from './directory.ts'
import { InterceptorException } from './utils/errors.ts'


// is caught
export const handleFileRequest = async (settings: any, req: ServerRequest) => {
  try {
    const path = joinPath(settings.root, unescape(req.url))
    const file = await Deno.open(path)
    req.done.then(() => {
      file.close()
    })
    // is caught 
    return await req.respond({
      status: 200,
      headers: setHeaders(settings.cors, path),
      body: file,
    })
  } catch (err) {
    !settings.silent && settings.debug ? console.error(err) : error(err)
    // is caught
    await handleNotFound(settings, req)
  }
}

// is caught
export const handleRouteRequest = async (settings: any, req: ServerRequest): Promise<void> => {
  try {
    const file = await readFile(`${settings.root}/${settings.entryPoint}`)
    const { hostname, port } = req.conn.localAddr as Deno.NetAddr
    // is caught
    await req.respond({
      status: 200,
      headers: setHeaders(settings.cors),
      body: settings.disableReload
        ? file
        : appendReloadScript(file, port, hostname, settings.secure),
    })
  } catch (err) {
    !settings.silent && settings.debug ? console.error(err) : error(err)
    // is caught
    await handleDirRequest(settings, req)
  }
}

// is caught
export const handleDirRequest = async (settings: any, req: ServerRequest): Promise<void> => {
  const path = joinPath(settings.root, unescape(req.url))
  const dirUrl = `/${posix.relative(settings.root, path)}`
  const entries: DirEntry[] = []
  for await (const entry of Deno.readDir(path.replace(/\/$/, ''))) {
    const filePath = posix.join(dirUrl, '/', entry.name)
    entries.push({ ...entry, url: decodeURIComponent(filePath) })
  }

  await req.respond({
    status: 200,
    body: encode(dirTemplate(entries, dirUrl)),
    headers: setHeaders(settings.cors),
  })
}

let watcher = null as null|Deno.FsWatcher
export const handleWs = async (settings: any, req: ServerRequest): Promise<void> => {
  if (!watcher) {
    watcher = Deno.watchFs(settings.root, { recursive: true })
  }
  try {
    const { conn, r: bufReader, w: bufWriter, headers } = req
    const socket = await acceptWebSocket({
      conn,
      bufReader,
      bufWriter,
      headers,
    })

    for await (const event of watcher) {
      if (event.kind === 'modify') {
        await socket.send('reload')
      }
    }
  } catch (err) {
    !settings.silent && error(err)
  }
}

// is caught
export const handleNotFound = async (settings: any, req: ServerRequest): Promise<void> => {
  return req.respond({
    status: 404,
    headers: setHeaders(settings.cors),
    body: inject404(req.url),
  })
}
