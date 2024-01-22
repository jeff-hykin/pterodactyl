import {
  acceptWebSocket,
  ServerRequest,
  posix,
} from './deps.ts'

/* Archaeopteryx utils */
import {
  readFile,
  appendReloadScript,
  error,
  inject404,
  setHeaders,
  encode,
  joinPath,
  DirEntry,
} from './utils/utils.ts'

import dirTemplate from './directory.ts'


// is caught
export const handleFileRequest = async (settings: any, req: ServerRequest, path: String) => {
  try {
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
export const handleDirRequest = async (settings: any, req: ServerRequest, path: String): Promise<void> => {
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

export const handleFileOrFolderRequest = async (settings: any, req: ServerRequest): Promise<void> => {
  let path = joinPath(settings.root, unescape(req.url))
  let itemExists = false
  let itemInfo
  
  try {
    itemInfo = await Deno.stat(path)
    itemExists = true
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err
    }
  }
  
  // try as absolute path (NOTE: there is no way to perfectly differentiate absolute VS relative in the request)
  if (settings.allowAbsolute && !itemExists) {
    try {
      path = `/${unescape(req.url)}`
      itemInfo = await Deno.stat(path)
      itemExists = true
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) {
        throw err
      }
    }
  }
  
  let output
  if (!itemExists) {
    output = await handleNotFound(settings, req)
  } else {
    if (!itemInfo?.isDirectory) {
      return await handleFileRequest(settings, req, path)
    } else {
      if (settings.dontList) {
        // is caught
        return await handleNotFound(settings, req)
      } else {
        return await handleDirRequest(settings, req, path)
      }
    }
  }
  
  return output
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
    const path = joinPath(settings.root, unescape(req.url))
    await handleDirRequest(settings, req, path)
  }
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
